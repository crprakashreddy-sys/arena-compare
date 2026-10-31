import { fetchChargersAlong, isFast } from "./chargers";
import { distanceM } from "./geo";
import { chargeMinutes, fitFor, usablePowerKW, type Model } from "./vehicles";
import type { Charger, LiveStatus } from "./types";

/**
 * Trip planner: route from OSRM (free, OpenStreetMap), chargers along it from Open Charge Map,
 * then charging stops picked so the battery never drops below the reserve.
 */

export type LatLng = { latitude: number; longitude: number };
export type Route = { coords: LatLng[]; km: number; minutes: number; cum: number[] };

export type Stop = {
  charger: Charger;
  atKm: number;        // distance from start along the route
  detourKm: number;    // distance from the route to the charger
  arrivePct: number;   // battery on arrival, 0–100
  leavePct: number;
  chargeMin: number;
  powerKW: number;
};

export type Plan = {
  route: Route;
  stops: Stop[];
  arrivePct: number;
  chargeMin: number;
  ok: boolean;
  problem?: string;
};

export async function getRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<Route> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't find a route. Check your connection and try again.");
  const j = await res.json();
  const r = j.routes?.[0];
  if (!r) throw new Error("No road route found between these places.");
  const coords: LatLng[] = r.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ latitude: lat, longitude: lng }));
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + distanceM(coords[i - 1].latitude, coords[i - 1].longitude, coords[i].latitude, coords[i].longitude) / 1000);
  }
  return { coords, km: r.distance / 1000, minutes: r.duration / 60, cum };
}

/** Google encoded polyline (precision 5), thinned to about one point per 2 km. */
function encodePolyline(route: Route): string {
  const pts: LatLng[] = [];
  let last = -Infinity;
  route.coords.forEach((c, i) => {
    if (route.cum[i] - last >= 2 || i === route.coords.length - 1) { pts.push(c); last = route.cum[i]; }
  });
  let out = "", pLat = 0, pLng = 0;
  const enc = (v: number) => {
    let x = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (x >= 0x20) { s += String.fromCharCode((0x20 | (x & 0x1f)) + 63); x >>= 5; }
    return s + String.fromCharCode(x + 63);
  };
  for (const p of pts) {
    const lat = Math.round(p.latitude * 1e5), lng = Math.round(p.longitude * 1e5);
    out += enc(lat - pLat) + enc(lng - pLng);
    pLat = lat; pLng = lng;
  }
  return out;
}

/** Where along the route a charger sits, and how far off the road it is. */
function locate(route: Route, c: Charger) {
  let best = Infinity, idx = 0;
  const step = Math.max(1, Math.floor(route.coords.length / 1500));
  for (let i = 0; i < route.coords.length; i += step) {
    const d = distanceM(c.lat, c.lng, route.coords[i].latitude, route.coords[i].longitude);
    if (d < best) { best = d; idx = i; }
  }
  return { atKm: route.cum[idx], detourKm: best / 1000 };
}

export async function planTrip(opts: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  vehicle: Model;
  startPct: number;          // battery now, 0–100
  reservePct?: number;       // never plan below this
  chargeToPct?: number;      // charge up to this at each stop
  live?: Record<string, LiveStatus>;
}): Promise<Plan> {
  const { vehicle: v, startPct } = opts;
  const reserve = (opts.reservePct ?? 15) / 100;
  const target = (opts.chargeToPct ?? 80) / 100;
  const route = await getRoute(opts.from, opts.to);

  // Highway driving uses more energy than the city range figure suggests.
  const rangeKm = v.rangeKm * 0.88;

  const finish = (stops: Stop[], soc: number, at: number, ok = true, problem?: string): Plan => ({
    route, stops, ok, problem,
    arrivePct: Math.round((soc - (route.km - at) / rangeKm) * 100),
    chargeMin: stops.reduce((a, s) => a + s.chargeMin, 0),
  });

  let soc = startPct / 100;
  if ((soc - reserve) * rangeKm >= route.km) return finish([], soc, 0);

  const chargers = (await fetchChargersAlong(encodePolyline(route), v.kind === "car" ? 5 : 3))
    .filter((c) => fitFor(c, v) !== "no")
    .filter((c) => opts.live?.[c.id]?.status !== "broken")
    .map((c) => ({ c, ...locate(route, c) }))
    .filter((x) => x.detourKm <= 5)
    .sort((a, b) => a.atKm - b.atKm);

  const stops: Stop[] = [];
  let at = 0;
  for (let guard = 0; guard < 12; guard++) {
    const reach = at + (soc - reserve) * rangeKm;
    if (reach >= route.km) return finish(stops, soc, at);

    // Candidates we can reach, preferring fast chargers late in the window (fewer stops).
    const inRange = chargers.filter((x) => x.atKm > at + 5 && x.atKm <= reach - x.detourKm);
    if (!inRange.length) {
      return finish(stops, soc, at, false, stops.length
        ? `No charger that fits your vehicle within range after ${stops[stops.length - 1].charger.name}.`
        : "No charger that fits your vehicle within range. Start with more battery or pick a closer destination.");
    }
    const score = (x: typeof inRange[number]) => {
      const kw = usablePowerKW(x.c, v);
      const live = opts.live?.[x.c.id]?.status;
      return x.atKm / route.km * 100 + Math.min(kw, 120) / 2 + (isFast(x.c) ? 20 : 0) + (live === "working" ? 15 : 0) - x.detourKm * 4;
    };
    const pick = inRange.reduce((a, b) => (score(b) > score(a) ? b : a));

    const arrive = soc - (pick.atKm - at + pick.detourKm) / rangeKm;
    const needToFinish = reserve + (route.km - pick.atKm + pick.detourKm) / rangeKm;
    // Charge to the target, or just enough to finish with the reserve if that's less.
    const leaveCapped = Math.min(1, Math.max(arrive, Math.min(target, needToFinish + 0.05)));
    stops.push({
      charger: pick.c,
      atKm: pick.atKm,
      detourKm: pick.detourKm,
      arrivePct: Math.round(arrive * 100),
      leavePct: Math.round(leaveCapped * 100),
      chargeMin: chargeMinutes(pick.c, v, arrive, leaveCapped),
      powerKW: usablePowerKW(pick.c, v),
    });
    soc = leaveCapped - pick.detourKm / rangeKm;
    at = pick.atKm;
  }
  return finish(stops, soc, at, false, "This trip needs too many stops to plan automatically.");
}

/** Google Maps directions with the charging stops as waypoints. */
export function mapsUrl(from: { lat: number; lng: number }, to: { lat: number; lng: number }, stops: Stop[]) {
  const wp = stops.map((s) => `${s.charger.lat},${s.charger.lng}`).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}` +
    (wp ? `&waypoints=${encodeURIComponent(wp)}` : "") + "&travelmode=driving";
}
