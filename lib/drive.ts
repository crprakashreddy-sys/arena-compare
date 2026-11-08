import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { getGarage, updateVehicle } from "./vehicles";
import { distanceM } from "./geo";

/**
 * Drive detection. The car itself can't talk to zingd, so we use the next best signal: the
 * iPhone connecting to the car's Bluetooth (or CarPlay). A Shortcuts automation the driver sets
 * up once opens zingd://drive?state=start on connect and …state=end on disconnect. From that,
 * zingd knows you're in your EV, measures the drive, and keeps an estimated battery % so nobody
 * has to type it.
 */
const KEY = "drive.v1";
// Roads aren't straight lines: straight-line distance × 1.3 is a good average for Indian roads.
const ROAD_FACTOR = 1.3;

export type Drive = {
  driving: boolean;
  startedAt?: string; endedAt?: string;
  startLat?: number; startLng?: number;
  lastLat?: number; lastLng?: number;
  km: number;                 // measured this drive (GPS points while zingd was open + start/end)
  lastKm?: number;            // the previous drive's distance
  setupDone?: boolean;        // the driver has seen a drive come in from the automation
  events: number;
};
let state: Drive = { driving: false, km: 0, events: 0 };
let loaded = false;
const subs = new Set<(d: Drive) => void>();

async function load() {
  if (!loaded) {
    try { const raw = await AsyncStorage.getItem(KEY); if (raw) state = { ...state, ...JSON.parse(raw) }; } catch {}
    loaded = true;
  }
  return state;
}
function save(next: Drive) {
  state = next; subs.forEach((f) => f(state));
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}
async function here() {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const p = (await Location.getLastKnownPositionAsync({ maxAge: 120000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return p ? { lat: p.coords.latitude, lng: p.coords.longitude } : null;
  } catch { return null; }
}

export async function startDrive() {
  await load();
  if (state.driving) return state;
  const p = await here();
  save({ ...state, driving: true, startedAt: new Date().toISOString(), endedAt: undefined, km: 0,
    startLat: p?.lat, startLng: p?.lng, lastLat: p?.lat, lastLng: p?.lng, setupDone: true, events: state.events + 1 });
  return state;
}

/** Ends the drive, adds the last stretch and takes the energy used off the battery estimate. */
export async function endDrive() {
  await load();
  if (!state.driving) return { km: 0, used: 0 };
  const p = await here();
  let km = state.km;
  if (p && state.lastLat != null && state.lastLng != null) km += (distanceM(state.lastLat, state.lastLng, p.lat, p.lng) / 1000) * ROAD_FACTOR;
  km = Math.round(km * 10) / 10;
  save({ ...state, driving: false, endedAt: new Date().toISOString(), lastKm: km, lastLat: p?.lat, lastLng: p?.lng, events: state.events + 1 });
  const used = useBattery(km);
  return { km, used };
}

/** Real-world use per km is battery ÷ real range, so the estimate tracks how the car actually drives. */
function useBattery(km: number) {
  const g = getGarage();
  const v = g.vehicles.find((x) => x.key === g.activeKey) ?? g.vehicles[0];
  if (!v || v.batteryPct == null || km <= 0) return 0;
  const pctPerKm = 100 / v.rangeKm;
  const used = Math.round(km * pctPerKm);
  updateVehicle(v.key, { batteryPct: Math.max(0, v.batteryPct - used), batteryAt: new Date().toISOString(), batterySource: "drive" });
  return used;
}

/** While zingd is open during a drive, add up GPS distance so longer drives are measured properly. */
export function useDriveTracker() {
  const [d, setD] = useState(state);
  useEffect(() => {
    subs.add(setD); load().then(setD);
    return () => { subs.delete(setD); };
  }, []);
  useEffect(() => {
    if (!d.driving) return;
    let sub: Location.LocationSubscription | null = null;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 150 }, (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      if ((accuracy ?? 999) > 120) return;
      if (state.lastLat != null && state.lastLng != null) {
        const m = distanceM(state.lastLat, state.lastLng, lat, lng);
        if (m < 50 || m > 20000) return; // jitter or a GPS jump
        save({ ...state, km: state.km + (m / 1000) * 1.08, lastLat: lat, lastLng: lng });
      } else save({ ...state, lastLat: lat, lastLng: lng });
    }).then((s) => { sub = s; }).catch(() => {});
    return () => { sub?.remove(); };
  }, [d.driving]);
  return d;
}

export const getDrive = () => state;

/** Driving now, or stopped in the last 30 minutes: that's when "Charging here?" makes sense. */
export function recentlyDriving(d: Drive = state) {
  if (d.driving) return true;
  return !!d.endedAt && Date.now() - new Date(d.endedAt).getTime() < 30 * 60e3;
}

/** How fresh the battery estimate is, in words. */
export function batteryNote(v?: { batteryAt?: string; batterySource?: string } | null) {
  if (!v?.batteryAt) return null;
  const h = (Date.now() - new Date(v.batteryAt).getTime()) / 3600e3;
  const when = h < 1 ? "just now" : h < 24 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago`;
  return v.batterySource === "drive" ? `estimated after your drive, ${when}` : v.batterySource === "charge" ? `from your last charge, ${when}` : `you set it ${when}`;
}
