/**
 * Daily zing challenge: one theme a day, the same for everyone (rotates at midnight India time).
 * Gives people a reason to open the camera today, and makes the feed feel like a shared moment.
 */
export type Challenge = { id: string; title: string; emoji: string; hint: string };
export const CHALLENGES: Challenge[] = [
  { id: "charger_view", title: "Best charger view", emoji: "🌄", hint: "The prettiest spot you've ever plugged in" },
  { id: "car_angle", title: "Your car's best angle", emoji: "📸", hint: "Low, wide, golden light. Make it a poster" },
  { id: "charging_snack", title: "Charging snack", emoji: "🍟", hint: "What you eat while the kWh go in" },
  { id: "night_glow", title: "Night glow", emoji: "🌙", hint: "Headlights, charger lights, city lights" },
  { id: "rain_drive", title: "Rainy drive", emoji: "🌧️", hint: "Wipers on, vibes on" },
  { id: "road_ahead", title: "The road ahead", emoji: "🛣️", hint: "Wherever you're headed today" },
  { id: "dashboard", title: "Dashboard flex", emoji: "🔋", hint: "Your best range or efficiency number" },
  { id: "crew_pic", title: "Crew at the charger", emoji: "👯", hint: "Who you met while charging" },
  { id: "clean_car", title: "Fresh wash", emoji: "✨", hint: "Shiny car, happy owner" },
  { id: "chai_stop", title: "Chai stop", emoji: "☕", hint: "The cutting chai that powers you" },
  { id: "sunrise", title: "Sunrise drive", emoji: "🌅", hint: "Early start, empty roads" },
  { id: "pet_copilot", title: "Co-pilot", emoji: "🐶", hint: "Pet, kid or best friend riding shotgun" },
  { id: "weird_charger", title: "Weirdest charger spot", emoji: "🤔", hint: "Behind a temple? Inside a mall basement?" },
  { id: "playlist", title: "Now playing", emoji: "🎶", hint: "What's on the car speakers right now" },
];
export function todaysChallenge(d = new Date()): Challenge {
  const day = Math.floor((d.getTime() + 5.5 * 3600e3) / 86400e3); // days since 1970, India time
  return CHALLENGES[day % CHALLENGES.length];
}
export const challengeById = (id?: string | null) => CHALLENGES.find((c) => c.id === id) ?? null;
