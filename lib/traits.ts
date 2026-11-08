/**
 * Personality beyond the car: a few either-or picks plus lifestyle tags, Bumble-style.
 * Stored together as short ids in profiles.traits (e.g. ["introvert", "night_owl", "foodie"]).
 */
export type Trait = { id: string; label: string; emoji: string };
export const SCALES: { key: string; title: string; options: Trait[] }[] = [
  { key: "energy", title: "Social energy", options: [
    { id: "introvert", label: "Introvert", emoji: "🌙" }, { id: "ambivert", label: "Ambivert", emoji: "🌗" }, { id: "extrovert", label: "Extrovert", emoji: "☀️" },
  ] },
  { key: "rhythm", title: "Your rhythm", options: [
    { id: "early_bird", label: "Early bird", emoji: "🌅" }, { id: "night_owl", label: "Night owl", emoji: "🦉" },
  ] },
  { key: "style", title: "How you roll", options: [
    { id: "planner", label: "Planner", emoji: "📋" }, { id: "spontaneous", label: "Spontaneous", emoji: "🎲" },
  ] },
  { key: "pace", title: "Your pace", options: [
    { id: "chill", label: "Chill", emoji: "🧘" }, { id: "go_getter", label: "Go-getter", emoji: "🚀" },
  ] },
];
export const LIFESTYLE: Trait[] = [
  { id: "foodie", label: "Foodie", emoji: "🍜" }, { id: "fitness", label: "Fitness", emoji: "🏋️" }, { id: "music", label: "Music", emoji: "🎶" },
  { id: "movies", label: "Movies", emoji: "🎬" }, { id: "travel", label: "Travel", emoji: "✈️" }, { id: "pets", label: "Pet parent", emoji: "🐾" },
  { id: "books", label: "Books", emoji: "📚" }, { id: "gaming", label: "Gaming", emoji: "🎮" }, { id: "cricket", label: "Cricket fan", emoji: "🏏" },
  { id: "football", label: "Football fan", emoji: "⚽" }, { id: "startups", label: "Startups", emoji: "💡" }, { id: "cooking", label: "Cooking", emoji: "👩‍🍳" },
  { id: "spiritual", label: "Spiritual", emoji: "🕉️" }, { id: "art", label: "Art & design", emoji: "🎨" }, { id: "outdoors", label: "Outdoors", emoji: "🏕️" },
  { id: "family", label: "Family first", emoji: "👨‍👩‍👧" }, { id: "comedy", label: "Comedy", emoji: "😂" }, { id: "volunteering", label: "Giving back", emoji: "🤝" },
];
const ALL = [...SCALES.flatMap((s) => s.options), ...LIFESTYLE];
export const traitById = (id: string) => ALL.find((t) => t.id === id);
export const MAX_LIFESTYLE = 6;
