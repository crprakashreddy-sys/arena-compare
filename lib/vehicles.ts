import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import type { Charger } from "./types";

/**
 * Vehicles: a catalog of common Indian EVs, the driver's own garage (kept on the phone only),
 * connector matching and charge-time estimates.
 *
 * Specs are approximate public figures, rounded. Drivers can edit battery and range for their own car.
 */

export type Plug = "ccs2" | "type2" | "chademo" | "gbt" | "bharat_dc" | "bharat_ac" | "ac15a" | "leccs" | "ola";
export type VehicleKind = "car" | "scooter" | "bike";

export type Model = {
  id: string;
  make: string;
  model: string;
  kind: VehicleKind;
  batteryKWh: number;   // usable, approx
  rangeKm: number;      // real-world, approx
  plugs: Plug[];
  maxDcKW: number;      // 0 = no DC fast charging
  maxAcKW: number;
};

export const PLUG_LABEL: Record<Plug, string> = {
  ccs2: "CCS2", type2: "Type 2", chademo: "CHAdeMO", gbt: "GB/T", bharat_dc: "Bharat DC-001",
  bharat_ac: "Bharat AC-001", ac15a: "15A socket", leccs: "LECCS (Ather)", ola: "Ola Hypercharger",
};

export const CATALOG: Model[] = [
  // Cars
  { id: "tata-nexon-ev-45", make: "Tata", model: "Nexon EV 45", kind: "car", batteryKWh: 46, rangeKm: 350, plugs: ["ccs2", "type2"], maxDcKW: 60, maxAcKW: 7.2 },
  { id: "tata-punch-ev-lr", make: "Tata", model: "Punch EV (LR)", kind: "car", batteryKWh: 35, rangeKm: 270, plugs: ["ccs2", "type2"], maxDcKW: 50, maxAcKW: 7.2 },
  { id: "tata-tiago-ev-lr", make: "Tata", model: "Tiago EV (LR)", kind: "car", batteryKWh: 24, rangeKm: 190, plugs: ["ccs2", "type2"], maxDcKW: 25, maxAcKW: 7.2 },
  { id: "tata-curvv-ev-55", make: "Tata", model: "Curvv EV 55", kind: "car", batteryKWh: 55, rangeKm: 430, plugs: ["ccs2", "type2"], maxDcKW: 70, maxAcKW: 7.2 },
  { id: "tata-harrier-ev-75", make: "Tata", model: "Harrier.ev 75", kind: "car", batteryKWh: 75, rangeKm: 500, plugs: ["ccs2", "type2"], maxDcKW: 120, maxAcKW: 7.2 },
  { id: "mg-windsor-38", make: "MG", model: "Windsor EV", kind: "car", batteryKWh: 38, rangeKm: 260, plugs: ["ccs2", "type2"], maxDcKW: 45, maxAcKW: 7.4 },
  { id: "mg-zs-ev", make: "MG", model: "ZS EV", kind: "car", batteryKWh: 50, rangeKm: 350, plugs: ["ccs2", "type2"], maxDcKW: 50, maxAcKW: 7.4 },
  { id: "mg-comet", make: "MG", model: "Comet EV", kind: "car", batteryKWh: 17, rangeKm: 170, plugs: ["type2", "ac15a"], maxDcKW: 0, maxAcKW: 3.3 },
  { id: "hyundai-creta-electric", make: "Hyundai", model: "Creta Electric", kind: "car", batteryKWh: 51, rangeKm: 390, plugs: ["ccs2", "type2"], maxDcKW: 50, maxAcKW: 11 },
  { id: "hyundai-ioniq5", make: "Hyundai", model: "Ioniq 5", kind: "car", batteryKWh: 72, rangeKm: 480, plugs: ["ccs2", "type2"], maxDcKW: 220, maxAcKW: 11 },
  { id: "mahindra-xuv400", make: "Mahindra", model: "XUV400 EV", kind: "car", batteryKWh: 39, rangeKm: 300, plugs: ["ccs2", "type2"], maxDcKW: 50, maxAcKW: 7.2 },
  { id: "mahindra-be6", make: "Mahindra", model: "BE 6", kind: "car", batteryKWh: 79, rangeKm: 500, plugs: ["ccs2", "type2"], maxDcKW: 175, maxAcKW: 11 },
  { id: "mahindra-xev9e", make: "Mahindra", model: "XEV 9e", kind: "car", batteryKWh: 79, rangeKm: 480, plugs: ["ccs2", "type2"], maxDcKW: 175, maxAcKW: 11 },
  { id: "byd-atto3", make: "BYD", model: "Atto 3", kind: "car", batteryKWh: 60, rangeKm: 420, plugs: ["ccs2", "type2"], maxDcKW: 80, maxAcKW: 7 },
  { id: "byd-emax7", make: "BYD", model: "eMax 7", kind: "car", batteryKWh: 72, rangeKm: 420, plugs: ["ccs2", "type2"], maxDcKW: 115, maxAcKW: 7 },
  { id: "kia-ev6", make: "Kia", model: "EV6", kind: "car", batteryKWh: 84, rangeKm: 500, plugs: ["ccs2", "type2"], maxDcKW: 240, maxAcKW: 11 },
  { id: "citroen-ec3", make: "Citroën", model: "eC3", kind: "car", batteryKWh: 29, rangeKm: 220, plugs: ["ccs2", "type2"], maxDcKW: 30, maxAcKW: 3.3 },
  // Two-wheelers
  { id: "ather-450x", make: "Ather", model: "450X", kind: "scooter", batteryKWh: 3.7, rangeKm: 110, plugs: ["leccs", "ac15a"], maxDcKW: 3, maxAcKW: 0.7 },
  { id: "ather-rizta", make: "Ather", model: "Rizta", kind: "scooter", batteryKWh: 3.7, rangeKm: 105, plugs: ["leccs", "ac15a"], maxDcKW: 3, maxAcKW: 0.7 },
  { id: "ola-s1-pro", make: "Ola", model: "S1 Pro", kind: "scooter", batteryKWh: 4, rangeKm: 150, plugs: ["ola", "ac15a"], maxDcKW: 4, maxAcKW: 0.75 },
  { id: "tvs-iqube", make: "TVS", model: "iQube", kind: "scooter", batteryKWh: 3.4, rangeKm: 100, plugs: ["ac15a"], maxDcKW: 0, maxAcKW: 0.95 },
  { id: "bajaj-chetak", make: "Bajaj", model: "Chetak", kind: "scooter", batteryKWh: 3.5, rangeKm: 120, plugs: ["ac15a"], maxDcKW: 0, maxAcKW: 0.75 },
  { id: "hero-vida-v2", make: "Hero", model: "Vida V2", kind: "scooter", batteryKWh: 3.9, rangeKm: 100, plugs: ["ac15a"], maxDcKW: 0, maxAcKW: 0.7 },
  { id: "revolt-rv400", make: "Revolt", model: "RV400", kind: "bike", batteryKWh: 3.2, rangeKm: 120, plugs: ["ac15a"], maxDcKW: 0, maxAcKW: 0.6 },
];

/** A vehicle in the driver's garage: a catalog model plus the driver's own corrections. */
export type MyVehicle = Model & { key: string; nickname?: string; batteryPct?: number };

export const vehicleName = (v: Pick<Model, "make" | "model">) => `${v.make} ${v.model}`;
export const kmPerKWh = (v: Model) => v.rangeKm / v.batteryKWh;

// ───────── Connector matching ─────────

/** Turn connector titles from Open Charge Map or our own data into plug keys. */
export function plugsOf(c: Charger): Plug[] {
  const out = new Set<Plug>();
  for (const raw of c.connectors ?? []) {
    const t = raw.toLowerCase();
    if (/ccs|combo/.test(t)) out.add("ccs2");
    else if (/chademo/.test(t)) out.add("chademo");
    else if (/gb.?t/.test(t)) out.add("gbt");
    else if (/bharat.*dc|dc.?001/.test(t)) out.add("bharat_dc");
    else if (/bharat.*ac|ac.?001/.test(t)) out.add("bharat_ac");
    else if (/type ?2|mennekes|iec 62196/.test(t)) out.add("type2");
    else if (/leccs|ather/.test(t)) out.add("leccs");
    else if (/ola|hyper/.test(t)) out.add("ola");
    else if (/15 ?a|16 ?a|3.?pin|domestic|iec 60309|commando|socket/.test(t)) out.add("ac15a");
  }
  if (c.network === "ather") out.add("leccs");
  return [...out];
}

export type Fit = "fits" | "no" | "unknown";

export function fitFor(c: Charger, v: Model | null): Fit {
  if (!v) return "unknown";
  const p = plugsOf(c);
  if (!p.length) return "unknown";
  return p.some((x) => v.plugs.includes(x)) ? "fits" : "no";
}

/** Best power this vehicle can draw at this charger, in kW. */
export function usablePowerKW(c: Charger, v: Model): number {
  const p = plugsOf(c);
  const dcPlug = p.some((x) => (x === "ccs2" || x === "chademo" || x === "gbt" || x === "bharat_dc" || x === "leccs" || x === "ola") && v.plugs.includes(x));
  const chargerKW = c.powerKW ?? (c.speed === "dc" ? 30 : c.speed === "ac" ? 7.4 : 3.3);
  if (dcPlug && v.maxDcKW > 0 && (c.speed === "dc" || c.speed === "dcac" || chargerKW > 22)) return Math.min(chargerKW, v.maxDcKW);
  return Math.min(chargerKW, v.maxAcKW || 3.3);
}

/** Minutes to charge from one battery level to another (0–1). Charging slows above 80%. */
export function chargeMinutes(c: Charger, v: Model, from = 0.2, to = 0.8): number {
  const kw = usablePowerKW(c, v);
  if (kw <= 0) return Infinity;
  const fast = Math.min(to, 0.8) - from;
  const slow = Math.max(0, to - Math.max(from, 0.8));
  const slowKW = Math.max(kw * 0.35, Math.min(kw, v.maxAcKW || kw)); // DC tapers hard above 80%
  const hours = (Math.max(0, fast) * v.batteryKWh) / (kw * 0.75) + (slow * v.batteryKWh) / (slowKW * 0.9);
  return Math.round(hours * 60);
}

export function fmtMinutes(m: number) {
  if (!isFinite(m)) return "—";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// ───────── Garage (stored on this phone only) ─────────

type Garage = { vehicles: MyVehicle[]; activeKey: string | null };
const KEY = "garage.v1";
let garage: Garage = { vehicles: [], activeKey: null };
let loaded = false;
const subs = new Set<(g: Garage) => void>();

async function load() {
  if (loaded) return garage;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) garage = JSON.parse(raw);
  } catch {}
  loaded = true;
  subs.forEach((f) => f(garage));
  return garage;
}
function save(next: Garage) {
  garage = next;
  subs.forEach((f) => f(garage));
  AsyncStorage.setItem(KEY, JSON.stringify(garage)).catch(() => {});
}

export function addVehicle(m: Model) {
  const v: MyVehicle = { ...m, key: `${m.id}-${Date.now().toString(36)}`, batteryPct: 60 };
  save({ vehicles: [...garage.vehicles, v], activeKey: v.key });
  return v;
}
export function updateVehicle(key: string, patch: Partial<MyVehicle>) {
  save({ ...garage, vehicles: garage.vehicles.map((v) => (v.key === key ? { ...v, ...patch } : v)) });
}
export function removeVehicle(key: string) {
  const vehicles = garage.vehicles.filter((v) => v.key !== key);
  save({ vehicles, activeKey: garage.activeKey === key ? vehicles[0]?.key ?? null : garage.activeKey });
}
export function setActiveVehicle(key: string) {
  save({ ...garage, activeKey: key });
}

/** The driver's vehicles and the one in use. Re-renders when the garage changes. */
export function useGarage() {
  const [g, setG] = useState(garage);
  useEffect(() => {
    subs.add(setG);
    load().then(setG);
    return () => { subs.delete(setG); };
  }, []);
  const active = g.vehicles.find((v) => v.key === g.activeKey) ?? g.vehicles[0] ?? null;
  return { vehicles: g.vehicles, active };
}

/** Rough straight-line reach on the battery left, keeping a 10% reserve. Roads add 20–30%, so this is a guide. */
export function reachKm(v: MyVehicle) {
  const pct = (v.batteryPct ?? 60) / 100;
  return Math.max(0, (pct - 0.1) * v.rangeKm * 0.9);
}
