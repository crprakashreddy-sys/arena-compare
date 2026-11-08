/**
 * EV personalities: a quick, fun quiz that gives each driver a type. Shown as a badge on profiles
 * and suggestion cards, and it's a natural conversation starter ("Fellow Road Tripper!").
 */
export type PersonalityId = "road_tripper" | "range_master" | "city_glider" | "tech_geek" | "eco_warrior" | "thrill_seeker" | "social_charger" | "night_cruiser";
export type Personality = { id: PersonalityId; name: string; emoji: string; color: string; ink: string; tagline: string; about: string; traits: string[] };

export const PERSONALITIES: Personality[] = [
  { id: "road_tripper", name: "Road Tripper", emoji: "🛣️", color: "#FFB547", ink: "#1A1A1A", tagline: "Every highway is an invitation.",
    about: "You plan charging stops around the best dhabas and never say no to a long weekend drive.", traits: ["Highway planner", "Dhaba expert", "Long weekends"] },
  { id: "range_master", name: "Range Master", emoji: "🔋", color: "#2FBF71", ink: "#FFFFFF", tagline: "Squeezing every last km.",
    about: "Smooth throttle, regen on max, tyre pressures perfect. Your efficiency numbers make others jealous.", traits: ["Hypermiler", "Regen pro", "Data lover"] },
  { id: "city_glider", name: "City Glider", emoji: "🏙️", color: "#5B9BFF", ink: "#FFFFFF", tagline: "Silent, smooth, unbothered by traffic.",
    about: "Your EV is the calmest place in the city. Home charging, daily commutes, zero stress.", traits: ["Daily commuter", "Home charger", "Traffic zen"] },
  { id: "tech_geek", name: "Tech Geek", emoji: "🤓", color: "#B892FF", ink: "#1A1A1A", tagline: "Firmware updates are my love language.",
    about: "You know your kWh from your kW, test every feature, and are first to try the new charger network.", traits: ["Feature tester", "Spec nerd", "Early adopter"] },
  { id: "eco_warrior", name: "Eco Warrior", emoji: "🌱", color: "#9BE15D", ink: "#1A1A1A", tagline: "Clean air is the whole point.",
    about: "Solar at home, petrol never again, and you'll happily explain why to anyone who asks.", traits: ["Solar powered", "Petrol-free", "Green advocate"] },
  { id: "thrill_seeker", name: "Thrill Seeker", emoji: "⚡", color: "#FF4F8B", ink: "#FFFFFF", tagline: "Instant torque, instant grin.",
    about: "Sport mode is the only mode. You love the launch, the ghat roads and the look on petrolheads' faces.", traits: ["Sport mode", "Ghat roads", "0–100 fan"] },
  { id: "social_charger", name: "Social Charger", emoji: "☕", color: "#C98B5A", ink: "#FFFFFF", tagline: "Charging time is chai time.",
    about: "You know everyone at your charger, organise club drives and always share the best tips.", traits: ["Club organiser", "Tip sharer", "Chai stops"] },
  { id: "night_cruiser", name: "Night Cruiser", emoji: "🌙", color: "#1A1A2E", ink: "#FCE38A", tagline: "Empty roads, good playlist.",
    about: "Late-night drives, quiet chargers, and the city lights. Your best thinking happens after 10 pm.", traits: ["Late drives", "Playlist curator", "Quiet chargers"] },
];
export const personalityById = (id?: string | null) => PERSONALITIES.find((p) => p.id === id) ?? null;

type Answer = { text: string; emoji: string; gives: Partial<Record<PersonalityId, number>> };
export const QUIZ: { q: string; answers: Answer[] }[] = [
  { q: "A free Saturday. You…", answers: [
    { text: "Drive somewhere 300 km away", emoji: "🗺️", gives: { road_tripper: 3, thrill_seeker: 1 } },
    { text: "Meet the club at a café", emoji: "☕", gives: { social_charger: 3 } },
    { text: "Read the new software update notes", emoji: "📱", gives: { tech_geek: 3 } },
    { text: "Cruise the city after dark", emoji: "🌃", gives: { night_cruiser: 3 } },
  ] },
  { q: "Your driving mode is usually…", answers: [
    { text: "Eco, regen on max", emoji: "🔋", gives: { range_master: 3, eco_warrior: 1 } },
    { text: "Sport. Obviously.", emoji: "🏁", gives: { thrill_seeker: 3 } },
    { text: "Normal, just smooth", emoji: "🧘", gives: { city_glider: 3 } },
    { text: "I switch to test them all", emoji: "🔬", gives: { tech_geek: 2, thrill_seeker: 1 } },
  ] },
  { q: "Best part of charging?", answers: [
    { text: "Chai and a chat", emoji: "🫖", gives: { social_charger: 3 } },
    { text: "Watching the kW numbers", emoji: "📈", gives: { tech_geek: 2, range_master: 1 } },
    { text: "Plugging in at home, done", emoji: "🏠", gives: { city_glider: 2, eco_warrior: 1 } },
    { text: "Finding a new highway stop", emoji: "🛣️", gives: { road_tripper: 3 } },
  ] },
  { q: "Why did you go electric?", answers: [
    { text: "For the planet", emoji: "🌍", gives: { eco_warrior: 3 } },
    { text: "That instant torque", emoji: "⚡", gives: { thrill_seeker: 3 } },
    { text: "Running cost: ₹1/km!", emoji: "💸", gives: { range_master: 2, city_glider: 1 } },
    { text: "It's the future and I'm early", emoji: "🚀", gives: { tech_geek: 3 } },
  ] },
  { q: "Your road-trip playlist is…", answers: [
    { text: "Old Bollywood singalongs", emoji: "🎤", gives: { road_tripper: 2, social_charger: 1 } },
    { text: "Lo-fi beats, late at night", emoji: "🎧", gives: { night_cruiser: 3 } },
    { text: "EV podcasts, honestly", emoji: "🎙️", gives: { tech_geek: 2, eco_warrior: 1 } },
    { text: "Silence. Just the road.", emoji: "🤫", gives: { city_glider: 2, range_master: 1 } },
  ] },
  { q: "Range shows 15%. You feel…", answers: [
    { text: "Excited, let's see how far it goes", emoji: "😎", gives: { range_master: 3 } },
    { text: "Chill, I know every charger", emoji: "🗺️", gives: { road_tripper: 2, social_charger: 1 } },
    { text: "Already planned this, obviously", emoji: "📋", gives: { tech_geek: 1, city_glider: 2 } },
    { text: "Thrilled. Life on the edge.", emoji: "🔥", gives: { thrill_seeker: 2, night_cruiser: 1 } },
  ] },
];

/** Tally the answers; ties go to the type picked earliest in the quiz. */
export function scoreQuiz(picks: number[]): PersonalityId {
  const tally: Record<string, number> = {};
  picks.forEach((a, qi) => {
    const g = QUIZ[qi]?.answers[a]?.gives ?? {};
    Object.entries(g).forEach(([k, v]) => { tally[k] = (tally[k] ?? 0) + (v as number) + (QUIZ.length - qi) * 0.01; });
  });
  return (Object.entries(tally).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "city_glider") as PersonalityId;
}
