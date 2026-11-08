/** Things EV drivers bond over. Shown as chips on profiles; shared ones light up on suggestion cards. */
export const INTERESTS = [
  { id: "road_trips", label: "Road trips", emoji: "🛣️" },
  { id: "weekend_drives", label: "Weekend drives", emoji: "🌄" },
  { id: "chai_stops", label: "Chai stops", emoji: "☕" },
  { id: "hypermiling", label: "Max range", emoji: "🔋" },
  { id: "tech", label: "EV tech", emoji: "🤓" },
  { id: "mods", label: "Mods & accessories", emoji: "🛠️" },
  { id: "photography", label: "Car photography", emoji: "📸" },
  { id: "detailing", label: "Detailing", emoji: "✨" },
  { id: "solar", label: "Solar at home", emoji: "☀️" },
  { id: "family", label: "Family trips", emoji: "👨‍👩‍👧" },
  { id: "pets", label: "Pets on board", emoji: "🐶" },
  { id: "music", label: "Driving playlists", emoji: "🎧" },
  { id: "foodie", label: "Highway food", emoji: "🍛" },
  { id: "night_drives", label: "Night drives", emoji: "🌙" },
  { id: "hills", label: "Hill drives", emoji: "⛰️" },
  { id: "commute", label: "Daily commute", emoji: "🏙️" },
] as const;
export const interestById = (id: string) => INTERESTS.find((i) => i.id === id);

/** Profile prompts, Bumble-style: pick up to three and answer in a line. */
export const PROMPTS = [
  "My EV in three words",
  "Best charger I've found",
  "Dream road trip",
  "Range record I'm proud of",
  "Never charging again at",
  "Best highway food stop",
  "Why I went electric",
  "Ask me about",
  "Weekend plan",
] as const;
export type Prompt = { q: string; a: string };

/** Opening lines for a connect request, built from what you share. */
export function openers(p: { display_name: string; car_model: string | null; city: string | null; shared_interests?: string[] | null }, mine: { car_model?: string | null; city?: string | null }) {
  const first = p.display_name.split(" ")[0];
  const out: string[] = [];
  if (p.car_model && mine.car_model && p.car_model.toLowerCase() === mine.car_model.toLowerCase()) out.push(`Hey ${first}! Fellow ${p.car_model} owner. What range are you getting?`);
  else if (p.car_model) out.push(`Hey ${first}! How are you finding the ${p.car_model}?`);
  const s = p.shared_interests?.map(interestById).filter(Boolean)[0];
  if (s) out.push(`We're both into ${s!.label.toLowerCase()} ${s!.emoji}. Got any favourites?`);
  if (p.city && mine.city && p.city.toLowerCase() === mine.city.toLowerCase()) out.push(`Hi ${first}! Which chargers in ${p.city} do you trust most?`);
  out.push(`Hi ${first}! Up for a drive with the club sometime?`);
  return out.slice(0, 3);
}
