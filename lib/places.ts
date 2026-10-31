import { distanceM } from "./geo";
import type { FoodPlace } from "./types";

/** Cafes and restaurants within walking distance, from OpenStreetMap (free, no key). */
export async function nearbyFood(lat: number, lng: number, radiusM = 700): Promise<FoodPlace[]> {
  const q = `[out:json][timeout:15];(node(around:${radiusM},${lat},${lng})[amenity~"^(cafe|restaurant|fast_food|food_court|ice_cream)$"][name];way(around:${radiusM},${lat},${lng})[amenity~"^(cafe|restaurant|fast_food|food_court)$"][name];);out center 30;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "zappd/1.0" },
      body: "data=" + encodeURIComponent(q),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.elements ?? [])
      .map((e: any) => {
        const pLat = e.lat ?? e.center?.lat;
        const pLng = e.lon ?? e.center?.lon;
        if (pLat == null || pLng == null) return null;
        return {
          id: `${e.type}-${e.id}`,
          name: e.tags?.name as string,
          kind: e.tags?.amenity as string,
          cuisine: (e.tags?.cuisine as string | undefined)?.split(";").slice(0, 2).join(", ").replace(/_/g, " "),
          lat: pLat,
          lng: pLng,
          distanceM: distanceM(lat, lng, pLat, pLng),
        } as FoodPlace;
      })
      .filter(Boolean)
      .sort((a: FoodPlace, b: FoodPlace) => a.distanceM - b.distanceM)
      .slice(0, 12);
  } catch {
    return [];
  }
}

export const FOOD_LABEL: Record<string, string> = {
  cafe: "Cafe",
  restaurant: "Restaurant",
  fast_food: "Quick bites",
  food_court: "Food court",
  ice_cream: "Ice cream",
};

export type PlaceHit = { id: string; title: string; subtitle: string; lat: number; lng: number };

/** Place search across India (towns, localities, landmarks, pincodes), via Photon / OpenStreetMap. */
export async function searchPlaces(query: string, near?: { lat: number; lng: number }): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, limit: "8", lang: "en", bbox: "68,6,97.5,37.5" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
  }
  try {
    const res = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
      headers: { "User-Agent": "zappd/1.0" },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.features ?? []).map((f: any, i: number) => {
      const p = f.properties ?? {};
      const [lng, lat] = f.geometry?.coordinates ?? [0, 0];
      const parts = [p.district, p.city, p.state, p.postcode].filter((x: string | undefined) => x && x !== p.name);
      return {
        id: `${p.osm_type ?? "x"}${p.osm_id ?? i}`,
        title: p.name ?? p.street ?? q,
        subtitle: Array.from(new Set(parts)).join(", "),
        lat,
        lng,
      };
    });
  } catch {
    return [];
  }
}
