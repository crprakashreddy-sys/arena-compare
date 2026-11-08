import type { Profile } from "./types";

/** Profile completeness, matching the database formula (supabase/club_rules.sql). Adds up to 100. */
export const PROFILE_ITEMS: { key: string; label: string; pts: number; done: (p: Profile) => boolean; go: string }[] = [
  { key: "photo", label: "Add a photo or cartoon", pts: 15, done: (p) => !!p.avatar_path, go: "/avatar-maker" },
  { key: "bio", label: "Write a bio", pts: 15, done: (p) => !!p.bio?.trim(), go: "/edit-profile" },
  { key: "car", label: "Add your EV", pts: 15, done: (p) => !!p.car_model?.trim(), go: "/edit-profile" },
  { key: "city", label: "Add your city", pts: 10, done: (p) => !!p.city?.trim(), go: "/edit-profile" },
  { key: "personality", label: "Find your EV personality", pts: 15, done: (p) => !!p.personality, go: "/personality" },
  { key: "traits", label: "Pick 3+ vibes", pts: 10, done: (p) => (p.traits?.length ?? 0) >= 3, go: "/edit-profile" },
  { key: "interests", label: "Pick 3+ EV interests", pts: 10, done: (p) => (p.interests?.length ?? 0) >= 3, go: "/edit-profile" },
  { key: "prompt", label: "Answer a prompt", pts: 10, done: (p) => (p.prompts?.length ?? 0) >= 1, go: "/edit-profile" },
];
export function profileScore(p?: Profile | null) {
  if (!p) return { pct: 0, missing: PROFILE_ITEMS };
  const missing = PROFILE_ITEMS.filter((i) => !i.done(p));
  return { pct: PROFILE_ITEMS.reduce((n, i) => n + (i.done(p) ? i.pts : 0), 0), missing };
}
