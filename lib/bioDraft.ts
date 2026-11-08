import { personalityById } from "./personality";
import { traitById } from "./traits";
import { interestById } from "./interests";

/**
 * Bio drafts written on the phone from your own profile: your car, city, EV personality, vibe and
 * interests, in the tone you pick. Free and instant; every tap of Shuffle gives a new take.
 */
export type Tone = "fun" | "chill" | "pro";
export const TONES: { id: Tone; label: string; emoji: string }[] = [
  { id: "fun", label: "Fun", emoji: "😄" }, { id: "chill", label: "Chill", emoji: "😌" }, { id: "pro", label: "Classy", emoji: "✨" },
];
type Input = { car?: string | null; city?: string | null; personality?: string | null; traits?: string[]; interests?: string[] };

const pick = <T,>(a: T[], r: () => number) => a[Math.floor(r() * a.length)];
// mulberry32: small, well-mixed random numbers so every Shuffle feels different.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// How each tag reads inside a sentence.
const PHRASE: Record<string, string> = {
  "Cricket fan": "cricket", "Football fan": "football", "Pet parent": "my pets", "Family first": "family time", "Giving back": "giving back",
  "Art & design": "art & design", "Max range": "chasing max range", "EV tech": "EV tech", "Mods & accessories": "car mods", "Car photography": "car photography",
  "Solar at home": "solar", "Pets on board": "road trips with my dog", "Driving playlists": "a good playlist", "Highway food": "highway food",
};
const phrase = (label: string) => PHRASE[label] ?? label.toLowerCase();
const cap = (s: string) => s.replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());

export function draftBio(p: Input, tone: Tone, seed = Date.now()): string {
  const r = rng(seed);
  const hasCar = !!p.car?.trim();
  const car = p.car?.trim() || "EV";
  const city = p.city?.trim();
  const per = personalityById(p.personality);
  const vibes = (p.traits ?? []).map(traitById).filter(Boolean) as { label: string; emoji: string }[];
  const ints = (p.interests ?? []).map(interestById).filter(Boolean) as { label: string; emoji: string }[];
  const likes = [...vibes.filter((v) => !["Introvert", "Ambivert", "Extrovert", "Early bird", "Night owl", "Planner", "Spontaneous", "Chill", "Go-getter"].includes(v.label)), ...ints];
  const two = likes.sort(() => r() - 0.5).slice(0, 2);
  const rhythm = vibes.find((v) => ["Early bird", "Night owl"].includes(v.label));
  const energy = vibes.find((v) => ["Introvert", "Ambivert", "Extrovert"].includes(v.label));

  const like = two.length ? two.map((x) => `${phrase(x.label)} ${x.emoji}`).join(" & ") : null;
  const opts: Record<Tone, (() => string)[]> = {
    fun: [
      () => `${per ? `${per.emoji} ${per.name}` : "⚡ EV convert"} driving ${hasCar ? `a ${car}` : "electric"}${city ? ` around ${city}` : ""}. ${like ? `Powered by ${like}.` : "Powered by electrons and chai."}`,
      () => `Petrol? Never heard of her. ${car}${city ? ` · ${city}` : ""}. ${rhythm ? `${rhythm.label} ${rhythm.emoji}` : "Charger-hopper"}${like ? `, big on ${like}` : ""}.`,
      () => `${city ? `${city}'s` : "Your"} friendliest ${car} owner. Will talk range for hours${like ? `, or ${phrase(two[0].label)}` : ""} ${pick(["😄", "⚡", "🔋", "☕"], r)}`,
      () => `0 litres of petrol, 100% vibes. ${car}${per ? ` · ${per.name} ${per.emoji}` : ""}${like ? ` · ${like}` : ""}`,
    ],
    chill: [
      () => `${car}${city ? ` in ${city}` : ""}. ${per ? per.tagline : "Quiet drives, good company."}${like ? ` Into ${like}.` : ""}`,
      () => `Slow mornings, smooth drives. ${car}${city ? `, ${city}` : ""}${like ? `. ${like}` : ""}${energy ? `. ${energy.label} ${energy.emoji}` : ""}`,
      () => `Just here for good chargers and better people. ${car}${like ? ` · ${like}` : ""}`,
      () => `${rhythm ? `${rhythm.label} ${rhythm.emoji} · ` : ""}${car}${city ? ` · ${city}` : ""}. Say hi at the next charger.`,
    ],
    pro: [
      () => `${car} owner${city ? ` based in ${city}` : ""}. ${per ? `${per.name}: ${per.tagline.toLowerCase()}` : "Happy to share charging tips."}`,
      () => `Driving electric${city ? ` in ${city}` : ""} with a ${car}. ${like ? `Outside the car: ${two.map((x) => phrase(x.label)).join(" and ")}.` : "Always up for a club drive."}`,
      () => `${per ? `${per.emoji} ${per.name}. ` : ""}${car}. Sharing honest charger reviews and the best stops on the road.`,
    ],
  };
  const list = opts[tone];
  for (let i = 0; i < 6; i++) {
    const s = cap(pick(list, r)().replace(/\s+/g, " ").replace(/\s\./g, ".").trim());
    if (s.length <= 160) return s;
  }
  return `${car}${city ? ` · ${city}` : ""}${per ? ` · ${per.name} ${per.emoji}` : ""}`.slice(0, 160);
}
