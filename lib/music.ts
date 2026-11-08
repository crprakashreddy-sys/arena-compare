/**
 * zingd's own music: original tracks composed for the app, so they're free to use with no licence
 * or copyright claims. They play alongside a zing (like music on Instagram stories).
 */
export type Track = { id: string; title: string; mood: string; bpm: number; source: number };
export const TRACKS: Track[] = [
  { id: "lemon_lofi", title: "Lemon Lo-fi", mood: "Chill", bpm: 80, source: require("../assets/music/lemon_lofi.m4a") },
  { id: "highway_sunrise", title: "Highway Sunrise", mood: "Upbeat", bpm: 116, source: require("../assets/music/highway_sunrise.m4a") },
  { id: "monsoon_chai", title: "Monsoon Chai", mood: "Desi chill", bpm: 88, source: require("../assets/music/monsoon_chai.m4a") },
  { id: "dhol_drive", title: "Dhol Drive", mood: "Bhangra", bpm: 104, source: require("../assets/music/dhol_drive.m4a") },
  { id: "night_charge", title: "Night Charge", mood: "Synthwave", bpm: 100, source: require("../assets/music/night_charge.m4a") },
  { id: "full_send", title: "Full Send", mood: "Hype", bpm: 126, source: require("../assets/music/full_send.m4a") },
  { id: "cinematic_rise", title: "Cinematic Rise", mood: "Epic", bpm: 72, source: require("../assets/music/cinematic_rise.m4a") },
  { id: "ghat_road", title: "Ghat Road", mood: "Acoustic", bpm: 96, source: require("../assets/music/ghat_road.m4a") },
  { id: "electric_dreams", title: "Electric Dreams", mood: "Dreamy", bpm: 70, source: require("../assets/music/electric_dreams.m4a") },
  { id: "zing_anthem", title: "Zing Anthem", mood: "Happy", bpm: 120, source: require("../assets/music/zing_anthem.m4a") },
];
export const trackById = (id?: string | null) => TRACKS.find((t) => t.id === id) ?? null;
