import * as Location from "expo-location";
import { distanceM } from "./geo";

/**
 * Zap Score. The database decides the real score (supabase/schema.sql, score_zap);
 * this file mirrors its rules so the camera can show a live preview before posting.
 */

export const TIERS = [
  { maxM: 60, points: 100, label: "At the plug" },
  { maxM: 200, points: 60, label: "At the station" },
  { maxM: 1000, points: 25, label: "Nearby" },
] as const;
export const FAR = { points: 5, label: "Far from the charger" };
export const PHOTO_BONUS = 20;
export const FRESH_BONUS = 25;
export const DAILY_CAP = 600;
const FUZZY_M = 150;

export type ZapFix = { lat: number; lng: number; accuracy: number | null; mocked: boolean };

/** One location fix for the zap. Returns null if location is off or too slow. */
export async function getZapFix(): Promise<ZapFix | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((r) => setTimeout(() => r(null), 8000)),
    ]);
    if (!pos) return null;
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      mocked: Boolean((pos as any).mocked),
    };
  } catch {
    return null;
  }
}

export function metresTo(fix: ZapFix, lat: number, lng: number) {
  return Math.round(distanceM(fix.lat, fix.lng, lat, lng));
}

/** Preview of the base points for a distance, using the same rules as the server. */
export function tierFor(distanceM: number | null, accuracy: number | null, mocked = false) {
  if (distanceM == null || mocked) return { points: 5, label: "Location unknown", next: null as null | { label: string; metres: number } };
  const precise = (accuracy ?? 0) <= FUZZY_M;
  for (let i = 0; i < TIERS.length; i++) {
    const t = TIERS[i];
    if (distanceM <= t.maxM && (precise || t.maxM > 200)) {
      const up = i > 0 ? TIERS[i - 1] : null;
      return { points: t.points, label: t.label, next: up ? { label: up.label, metres: distanceM - up.maxM } : null };
    }
  }
  return { ...FAR, next: { label: TIERS[2].label, metres: distanceM - TIERS[2].maxM } };
}

export function formatMetres(m: number) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

/** Colour for a score chip. */
export function scoreTone(points: number) {
  if (points >= 100) return "#FFD60A";
  if (points >= 60) return "#34C759";
  if (points >= 25) return "#5AC8FA";
  return "#8E8E93";
}
