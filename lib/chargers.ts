import { isConfigured, supabase } from "./supabase";
import { DEMO_CHARGERS } from "./demo";
import { bbox, distanceM } from "./geo";
import { isCommercial, matchNetwork } from "./networks";
import type { Charger, Speed } from "./types";

const OCM_KEY = process.env.EXPO_PUBLIC_OCM_KEY ?? "";

/** In-memory cache so a charger page opens instantly from the map. */
const cache = new Map<string, Charger>();
export const cacheCharger = (c: Charger) => cache.set(c.id, c);
export const cachedCharger = (id: string) => cache.get(id);

/** All commercial chargers within radiusKm of a point, from Open Charge Map and the community database. */
export async function fetchChargers(lat: number, lng: number, radiusKm = 15): Promise<Charger[]> {
  const [ocm, db] = await Promise.all([
    fetchOCM(lat, lng, radiusKm).catch(() => [] as Charger[]),
    fetchCommunity(lat, lng, radiusKm).catch(() => [] as Charger[]),
  ]);

  // Community and seed rows win; drop Open Charge Map duplicates within 60 m.
  const merged: Charger[] = [...db];
  for (const c of ocm) {
    if (merged.some((m) => m.id === c.id)) continue;
    const near = merged.find((m) => distanceM(m.lat, m.lng, c.lat, c.lng) < 60);
    if (near) {
      if (near.powerKW == null && c.powerKW != null) near.powerKW = c.powerKW;
      if (!near.connectors?.length && c.connectors?.length) near.connectors = c.connectors;
      continue;
    }
    merged.push(c);
  }

  const result = merged.filter((c) => isCommercial(c.name, c.address, c.network));
  result.forEach(cacheCharger);
  return result;
}

async function fetchCommunity(lat: number, lng: number, radiusKm: number): Promise<Charger[]> {
  const b = bbox(lat, lng, radiusKm);
  if (!isConfigured) {
    return DEMO_CHARGERS.filter((c) => c.lat >= b.minLat && c.lat <= b.maxLat && c.lng >= b.minLng && c.lng <= b.maxLng);
  }
  const { data, error } = await supabase
    .from("chargers")
    .select("id,name,network,lat,lng,address,power_kw,connectors,speed,source")
    .gte("lat", b.minLat).lte("lat", b.maxLat)
    .gte("lng", b.minLng).lte("lng", b.maxLng)
    .limit(600);
  if (error || !data) return [];
  return data.map(rowToCharger);
}

export function rowToCharger(r: any): Charger {
  return {
    id: r.id,
    name: r.name,
    network: r.network ?? "other",
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    powerKW: r.power_kw,
    connectors: r.connectors ?? [],
    speed: (r.speed ?? "unknown") as Speed,
    source: r.source === "ocm" ? "ocm" : r.source === "seed" ? "seed" : "community",
  };
}

// Open Charge Map usage types 2, 3 and 6 are private; statuses 150, 200 and 210 are planned or removed.
const PRIVATE_USAGE = new Set([2, 3, 6]);
const NOT_OPERATIONAL = new Set([150, 200, 210]);

async function fetchOCM(lat: number, lng: number, radiusKm: number, id?: string, extra?: Record<string, string>): Promise<Charger[]> {
  if (!OCM_KEY) return [];
  const params = new URLSearchParams({
    output: "json",
    countrycode: "IN",
    maxresults: "250",
    verbose: "false",
    key: OCM_KEY,
  });
  if (id) params.set("chargepointid", id);
  else if (extra) Object.entries(extra).forEach(([k, v]) => params.set(k, v));
  else {
    params.set("latitude", String(lat));
    params.set("longitude", String(lng));
    params.set("distance", String(Math.round(radiusKm)));
    params.set("distanceunit", "KM");
  }
  const res = await fetch(`https://api.openchargemap.io/v3/poi?${params.toString()}`);
  if (!res.ok) return [];
  const pois: any[] = await res.json();
  return pois
    .filter((p) => !(p.UsageTypeID && PRIVATE_USAGE.has(p.UsageTypeID)))
    .filter((p) => !(p.StatusTypeID && NOT_OPERATIONAL.has(p.StatusTypeID)))
    .map((p) => {
      const a = p.AddressInfo ?? {};
      const conns: any[] = p.Connections ?? [];
      const power = conns.reduce((m, c) => Math.max(m, c.PowerKW ?? 0), 0) || null;
      const types = Array.from(new Set(conns.map((c) => c.ConnectionType?.Title).filter(Boolean))) as string[];
      const fast = (power ?? 0) >= 25 || conns.some((c) => c.LevelID === 3);
      const title: string = a.Title ?? "EV charger";
      const op: string = p.OperatorInfo?.Title ?? "";
      return {
        id: `ocm-${p.ID}`,
        name: title,
        network: matchNetwork(`${op} ${title}`).id,
        lat: a.Latitude,
        lng: a.Longitude,
        address: [a.AddressLine1, a.Town, a.StateOrProvince].filter(Boolean).join(", "),
        powerKW: power,
        connectors: types.map((t) => t.replace(" (Socket Only)", "")),
        speed: (fast ? "dc" : power ? "ac" : "unknown") as Speed,
        source: "ocm" as const,
      };
    });
}

/** Load one charger by id: cache first, then database, then Open Charge Map. */
export async function getCharger(id: string): Promise<Charger | null> {
  const hit = cache.get(id) ?? DEMO_CHARGERS.find((c) => c.id === id);
  if (hit) return hit;
  const { data } = await supabase.from("chargers").select("*").eq("id", id).maybeSingle();
  if (data) {
    const c = rowToCharger(data);
    cacheCharger(c);
    return c;
  }
  if (id.startsWith("ocm-")) {
    const [c] = await fetchOCM(0, 0, 0, id.slice(4)).catch(() => []);
    if (c) { cacheCharger(c); return c; }
  }
  return null;
}

/** Copy an Open Charge Map charger into the database before the first post about it. */
export async function ensureChargerSaved(c: Charger) {
  await supabase.from("chargers").upsert(
    {
      id: c.id,
      name: c.name,
      network: c.network,
      lat: c.lat,
      lng: c.lng,
      address: c.address ?? null,
      power_kw: c.powerKW ?? null,
      connectors: c.connectors ?? [],
      speed: c.speed,
      source: c.source,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
}

export const isFast = (c: Charger) => c.speed === "dc" || c.speed === "dcac" || (c.powerKW ?? 0) >= 25;

export function speedLabel(c: Charger) {
  if (isFast(c)) return c.powerKW ? `DC fast ${Math.round(c.powerKW)} kW` : "DC fast";
  if (c.speed === "ac") return c.powerKW ? `AC ${Math.round(c.powerKW)} kW` : "AC";
  return "Speed not listed";
}

/** Public chargers within `distanceKm` of a route (Google encoded polyline), for the trip planner. */
export async function fetchChargersAlong(polyline: string, distanceKm = 5): Promise<Charger[]> {
  const list = await fetchOCM(0, 0, 0, undefined, {
    polyline, distance: String(distanceKm), distanceunit: "KM", maxresults: "500",
  }).catch(() => [] as Charger[]);
  const out = list.filter((c) => isCommercial(c.name, c.address, c.network));
  out.forEach(cacheCharger);
  return out;
}
