/**
 * GIF search through GIPHY (Tenor's API closed in June 2026). Needs a free key from
 * developers.giphy.com in .env as EXPO_PUBLIC_GIPHY_KEY. GIPHY's rules: show "Powered by GIPHY",
 * call it from the phone (not a server), and keep only links, never copies of the files.
 */
const KEY = process.env.EXPO_PUBLIC_GIPHY_KEY ?? "";
export const gifsReady = !!KEY;

export type Gif = { id: string; url: string; preview: string; w: number; h: number; title: string };

function toGif(g: any, sticker = false): Gif | null {
  const full = g.images?.fixed_width ?? g.images?.downsized;
  const small = g.images?.fixed_width_downsampled ?? g.images?.fixed_width_small ?? full;
  if (!full?.url) return null;
  // Remember the shape in the link, so the bubble is the right size before the GIF loads.
  const w = Number(full.width) || 200, h = Number(full.height) || 150;
  // A trailing "s" marks a sticker: drawn without a bubble, on a clear background.
  return { id: g.id, url: `${full.webp || full.url}#${w}x${h}${sticker ? "s" : ""}`, preview: small.webp || small.url, w, h, title: g.title ?? "" };
}

async function call(path: string, params: Record<string, string>) {
  const sticker = path.startsWith("stickers");
  if (!KEY) throw new Error("GIFs aren't set up yet.");
  const q = new URLSearchParams({ api_key: KEY, limit: "30", rating: "pg-13", lang: "en", ...params });
  const res = await fetch(`https://api.giphy.com/v1/${path}?${q}`);
  if (res.status === 429) throw new Error("Too many GIF searches right now. Try again in a few minutes.");
  if (!res.ok) throw new Error("GIFs didn't load. Check your connection.");
  const json = await res.json();
  return ((json.data ?? []) as any[]).map((g) => toGif(g, sticker)).filter(Boolean) as Gif[];
}

export const trendingGifs = () => call("gifs/trending", {});
export const searchGifs = (q: string) => call("gifs/search", { q });
export const trendingStickers = () => call("stickers/trending", {});
export const searchStickers = (q: string) => call("stickers/search", { q });

/** Width and height saved in the link (see toGif). */
export function gifSize(url: string): { w: number; h: number; sticker: boolean } {
  const m = url.match(/#(\d+)x(\d+)(s?)$/);
  return m ? { w: +m[1], h: +m[2], sticker: m[3] === "s" } : { w: 200, h: 150, sticker: false };
}
export const gifSrc = (url: string) => url.replace(/#\d+x\d+s?$/, "");
