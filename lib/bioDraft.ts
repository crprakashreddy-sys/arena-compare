import { personalityById } from "./personality";
import { traitById } from "./traits";
import { interestById } from "./interests";

/**
 * Bio drafts written on the phone from your own profile: your car, city, EV personality, vibe and
 * interests, in the tone you pick. Free and instant; every tap of Shuffle gives a new take.
 */
export type Tone = "witty" | "funny" | "classy" | "chill";
export const TONES: { id: Tone; label: string; emoji: string }[] = [
  { id: "witty", label: "Witty", emoji: "😏" }, { id: "funny", label: "Funny", emoji: "😂" },
  { id: "classy", label: "Classy", emoji: "🥂" }, { id: "chill", label: "Chill", emoji: "😌" },
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
  "Regional mass songs": "mass songs on full volume", "Folk": "folk songs", "Motivational": "motivational tracks", "Old Bollywood": "old Bollywood",
  "Devotional": "devotional songs", "Punjabi beats": "Punjabi beats", "Lo-fi": "lo-fi", "Desi hip-hop": "desi hip-hop", "English pop": "English pop",
  "Classical": "classical music", "Foodie": "good food", "Fitness": "the gym", "Music": "music", "Movies": "movies", "Travel": "travel",
  "Books": "books", "Gaming": "gaming", "Startups": "startups", "Cooking": "cooking", "Spiritual": "temple runs", "Outdoors": "the outdoors",
  "Comedy": "stand-up comedy", "Chai stops": "chai stops", "Road trips": "road trips", "Weekend drives": "weekend drives", "Night drives": "night drives",
  "Hill drives": "hill drives", "Family trips": "family trips", "Detailing": "a spotless car", "Daily commute": "the daily commute", "My ex's favourites (still trying to forget)": "my ex's playlist (still working on it)",
  "Cricket fan": "cricket", "Football fan": "football", "Pet parent": "my pets", "Family first": "family time", "Giving back": "giving back",
  "Art & design": "art & design", "Max range": "chasing max range", "EV tech": "EV tech", "Mods & accessories": "car mods", "Car photography": "car photography",
  "Solar at home": "solar", "Pets on board": "road trips with my dog", "Driving playlists": "a good playlist", "Highway food": "highway food",
};
const phrase = (label: string) => PHRASE[label] ?? label.toLowerCase();
const cap = (s: string) => s.replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());

export function draftBio(p: Input, tone: Tone, seed = Date.now(), avoid?: string | null): string {
  const r = rng(seed);
  const hasCar = !!p.car?.trim();
  const car = p.car?.trim() || "EV";
  const aCar = hasCar ? `my ${car}` : "an EV";
  const city = p.city?.trim();
  const per = personalityById(p.personality);
  const vibes = (p.traits ?? []).map(traitById).filter(Boolean) as { label: string; emoji: string }[];
  const ints = (p.interests ?? []).map(interestById).filter(Boolean) as { label: string; emoji: string }[];
  const all = [...vibes, ...ints];
  const has = (l: string) => all.some((x) => x.label === l);
  const likes = [...vibes.filter((v) => !["Introvert", "Ambivert", "Extrovert", "Early bird", "Night owl", "Planner", "Spontaneous", "Chill", "Go-getter"].includes(v.label)), ...ints];
  const two = likes.sort(() => r() - 0.5).slice(0, 2);
  const one = two[0] ? phrase(two[0].label) : null;
  const like = two.length ? two.map((x) => phrase(x.label)).join(" & ") : null;
  // Short sign-off; the personality badge already shows on the profile.
  const tagLine = [hasCar ? car : null, city].filter(Boolean).join(" · ");
  const tail = tagLine ? ` ${tagLine}` : "";

  // Lines that only appear when your profile earns them. These are the ones people screenshot.
  const special: Partial<Record<Tone, string[]>> = { witty: [], funny: [], classy: [], chill: [] };
  const add = (t: Tone, line: string) => special[t]!.push(line);
  if (has("My ex's favourites (still trying to forget)")) {
    add("funny", `Still playing my ex's playlist. The car moved on. I'm buffering.${tail}`);
    add("witty", `Zero emissions. Some baggage. Mostly my ex's playlist.${tail}`);
  }
  if (has("Night owl") || has("Night drives") || per?.id === "night_cruiser") {
    add("witty", `Night owl 🦉 Chargers are emptier after midnight, and so are my excuses.${tail}`);
    add("classy", `Partial to midnight highways and quiet cabins.${tail}`);
  }
  if (has("Early bird")) add("funny", `Up before the chargers get busy and before my alarm 🐦${tail}`);
  if (has("Pet parent") || has("Pets on board")) {
    add("funny", `My dog has the front seat. You can have the aux. Maybe.${tail}`);
    add("classy", `Travels with a co-pilot who has four legs and impeccable manners.${tail}`);
  }
  if (has("Cricket fan")) add("witty", `Fluent in run rates and range estimates. Both always optimistic.${tail}`);
  if (has("Highway food") || has("Foodie")) {
    add("funny", `I plan road trips around dhabas. The chargers just happen to be nearby 🍛${tail}`);
    add("classy", `Believes the best restaurants are found at 80% charge.${tail}`);
  }
  if (has("Chai stops")) add("chill", `Every charge is a chai break if you plan it right ☕${tail}`);
  if (has("Regional mass songs")) add("funny", `Silent car. Mass songs on full volume. The neighbours know when I'm back 🔊${tail}`);
  if (has("Classical")) add("classy", `Classical in the cabin, calm on the road.${tail}`);
  if (has("Max range") || per?.id === "range_master") add("witty", `I don't have range anxiety. My passengers do 🔋${tail}`);
  if (has("EV tech") || per?.id === "tech_geek") add("witty", `Reads release notes for fun. Yes, even the car's.${tail}`);
  if (has("Introvert")) add("witty", `Introvert who bought the quietest car on the road. Coincidence? No.${tail}`);
  if (has("Extrovert") || per?.id === "social_charger") add("funny", `I make friends at every charger. Some of them even wanted one ☕${tail}`);
  if (has("Car photography") || has("Detailing")) add("classy", `Keeps the car spotless and the photos sharper.${tail}`);
  if (has("Startups")) add("witty", `Building a startup by day, building range by night.${tail}`);

  const opts: Record<Tone, (() => string)[]> = {
    witty: [
      () => `Quietly fast. Fast, quietly.${tail}`,
      () => `I left petrol. Petrol hasn't moved on.${tail}`,
      () => `Zero emissions, plenty of opinions${one ? `, mostly about ${one}` : ""}.${tail}`,
      () => `Low on carbon, high on ${one ?? "good company"}.${tail}`,
      () => `Running on electrons and good decisions. Mostly electrons ⚡${tail}`,
      () => `${hasCar ? `The ${car} is silent.` : "My car is silent."} I am not.${city ? ` ${city}` : ""}`,
      () => `Plugged in, rarely switched off${like ? `. Into ${like}` : ""}.${tail}`,
    ],
    funny: [
      () => `Range anxiety? I have regular anxiety. The range is fine 🔋${tail}`,
      () => `${hasCar ? `My ${car}` : "My car"} has more charge than my phone. Priorities.${city ? ` ${city}` : ""}`,
      () => `Last fuel bill: ₹0. Last chai bill: classified ☕${tail}`,
      () => `Mom still thinks the car is broken because it makes no sound.${tail}`,
      () => `Swipe right if you know where the free chargers are 😌${tail}`,
      () => `Fluent in kWh. Still learning ${city ?? "city"} traffic.${hasCar ? ` ${car}` : ""}`,
      () => `I don't visit petrol pumps. I visit charger cafés${one ? ` and talk about ${one}` : ""}.${tail}`,
    ],
    classy: [
      () => `Quiet engine, strong opinions on coffee.${tail}`,
      () => `Driving electric, living deliberately${like ? `. ${cap(like)} on the side` : ""}.${tail}`,
      () => `Collector of quiet miles and good company.${tail}`,
      () => `Fine roads, finer conversations.${tail}`,
      () => `Unhurried drives, unforgettable stops${city ? ` in and around ${city}` : ""}.${hasCar ? ` ${car}` : ""}`,
      () => `Prefers torque to talk, and silence to noise.${tail}`,
      () => `Curating the best charging stops${city ? ` in ${city}` : ""}, one espresso at a time.${hasCar ? ` ${car}` : ""}`,
    ],
    chill: [
      () => `${per ? per.tagline : "Quiet drives, good company."}${like ? ` Into ${like}.` : ""}${tail}`,
      () => `Slow mornings, smooth drives${like ? `, ${like}` : ""}.${tail}`,
      () => `Just here for good chargers and better people.${tail}`,
      () => `Driving ${aCar}${city ? ` around ${city}` : ""}. Say hi at the next charger 👋`,
    ],
  };
  // Earned lines get picked more often, but the classics still show up.
  const pool = [...(special[tone] ?? []).map((l) => () => l), ...(special[tone] ?? []).map((l) => () => l), ...opts[tone]];
  for (let i = 0; i < 12; i++) {
    const s = pick(pool, r)().replace(/\s+/g, " ").replace(/\s\./g, ".").replace(/\.\./g, ".").trim();
    if (s.length <= 160 && s !== avoid) return s;
  }
  return `${car}${city ? ` · ${city}` : ""}${per ? ` · ${per.name} ${per.emoji}` : ""}`.slice(0, 160);
}
