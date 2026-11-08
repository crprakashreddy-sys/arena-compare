import { FilterMode, MipmapMode, Skia, TileMode, type SkImage } from "@shopify/react-native-skia";

/**
 * Cartoon of your car from your own photo, done the way pro "toon" apps do it, in GPU passes:
 *  1. Abstraction: an edge-preserving (bilateral) blur run 3 times at growing radius. Road grit,
 *     leaves and paint noise melt into clean flat areas, but the car's edges stay sharp.
 *  2. Ink: XDoG (difference of Gaussians) on the *smoothed* image, so only real shapes get lines:
 *     body outline, windows, grille, wheels. No speckles from texture.
 *  3. Cel colour: brightness eased into a few soft bands (no harsh dithering), colour boosted.
 * Runs on the phone, nothing is uploaded until you save.
 */

const BILATERAL = `
uniform shader image;
uniform float r;      // tap spacing in pixels
uniform float sigma;  // colour tolerance
half4 main(float2 xy) {
  float3 c0 = float3(image.eval(xy).rgb);
  float3 acc = float3(0.0); float wsum = 0.0;
  for (int i = -3; i <= 3; i++) {
    for (int j = -3; j <= 3; j++) {
      float2 o = float2(float(i), float(j));
      float3 s = float3(image.eval(xy + o * r).rgb);
      float3 d = s - c0;
      float w = exp(-dot(d, d) / (2.0 * sigma * sigma)) * exp(-dot(o, o) / 8.0);
      acc += s * w; wsum += w;
    }
  }
  return half4(half3(acc / wsum), 1.0);
}`;

const TOON = `
uniform shader image;
uniform float s;         // edge scale in pixels (line weight)
uniform float levels;    // cel bands
uniform float sat;       // colour boost
uniform float edge;      // ink strength
uniform float thresh;    // how much contrast makes a line (lower = more lines)
uniform float lift;      // pastel lift
uniform float mono;      // 1 = pencil sketch
uniform float halftone;  // comic dots
uniform float3 ink;      // line colour
uniform float glow;      // 1 = neon

float lum(float3 c) { return dot(c, float3(0.299, 0.587, 0.114)); }

half4 main(float2 xy) {
  float3 c = float3(image.eval(xy).rgb);
  float y = lum(c);

  // XDoG: a narrow and a wide blur; where the narrow one is darker, draw ink.
  float a1 = 0.0, a2 = 0.0, a3 = 0.0;
  for (int i = 0; i < 12; i++) {
    float t = float(i) * 0.5235988;
    float2 dir = float2(cos(t), sin(t));
    a1 += lum(float3(image.eval(xy + dir * s).rgb));
    a2 += lum(float3(image.eval(xy + dir * s * 1.8).rgb));
    a3 += lum(float3(image.eval(xy + dir * s * 3.0).rgb));
  }
  float g1 = y * 0.4 + (a1 / 12.0) * 0.6;
  float g2 = (a2 / 12.0) * 0.5 + (a3 / 12.0) * 0.5;
  float d = g2 - g1;
  float e = smoothstep(thresh, thresh * 2.4, d);

  // Soft cel bands: ease between levels instead of hard steps (no speckle on gradients).
  float v = y * levels;
  float f = fract(v);
  float q = (floor(v) + smoothstep(0.35, 0.65, f)) / levels;
  float3 col = c * (q / max(y, 0.03));
  float g = lum(col);
  col = mix(float3(g), col, sat);
  col = mix(col, float3(1.0), lift * 0.32);

  if (halftone > 0.0) {
    float2 cell = fract(xy / (s * 3.2)) - 0.5;
    float r = (1.0 - q) * 0.55;
    col *= 1.0 - (1.0 - smoothstep(r - 0.06, r + 0.06, length(cell))) * halftone * 0.4;
  }
  if (mono > 0.5) {
    float paper = 0.98 - (1.0 - q) * 0.18;
    col = float3(paper, paper * 0.985, paper * 0.955);
  }
  if (glow > 0.5) {
    col = col * 0.2;
    return half4(half3(clamp(col + ink * e * 1.5, 0.0, 1.0)), 1.0);
  }
  col = mix(col, ink, clamp(e * edge, 0.0, 1.0));
  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}`;

const make = (src: string) => { try { return Skia.RuntimeEffect.Make(src); } catch { return null; } };
const BILATERAL_FX = make(BILATERAL);
const TOON_FX = make(TOON);
export const TOON_READY = !!(BILATERAL_FX && TOON_FX);

export type ToonStyle = {
  id: string; name: string; emoji: string;
  smooth: number; levels: number; sat: number; edge: number; thresh: number;
  lift: number; mono: number; halftone: number; ink: [number, number, number]; glow: number;
};

export const TOON_STYLES: ToonStyle[] = [
  { id: "toon", name: "Toon", emoji: "🎨", smooth: 1, levels: 5, sat: 1.35, edge: 1, thresh: 0.026, lift: 0, mono: 0, halftone: 0, ink: [0.06, 0.06, 0.08], glow: 0 },
  { id: "comic", name: "Comic", emoji: "💥", smooth: 1.25, levels: 4, sat: 1.6, edge: 1, thresh: 0.022, lift: 0, mono: 0, halftone: 1, ink: [0.02, 0.02, 0.04], glow: 0 },
  { id: "anime", name: "Anime", emoji: "✨", smooth: 1.1, levels: 6, sat: 1.2, edge: 0.85, thresh: 0.03, lift: 0.3, mono: 0, halftone: 0, ink: [0.2, 0.15, 0.26], glow: 0 },
  { id: "pastel", name: "Pastel", emoji: "🍬", smooth: 1.2, levels: 5, sat: 0.85, edge: 0.6, thresh: 0.032, lift: 1, mono: 0, halftone: 0, ink: [0.36, 0.3, 0.44], glow: 0 },
  { id: "sketch", name: "Sketch", emoji: "✏️", smooth: 0.8, levels: 4, sat: 0, edge: 0.95, thresh: 0.018, lift: 0, mono: 1, halftone: 0, ink: [0.18, 0.18, 0.22], glow: 0 },
  { id: "neon", name: "Neon", emoji: "🌃", smooth: 1, levels: 5, sat: 1.4, edge: 1, thresh: 0.02, lift: 0, mono: 0, halftone: 0, ink: [0.99, 0.89, 0.54], glow: 1 },
];

/** Draw one shader pass over an image into a new image the same size. */
function pass(fx: NonNullable<typeof TOON_FX>, img: SkImage, uniforms: number[]): SkImage | null {
  const w = img.width(), h = img.height();
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (!surface) return null;
  const child = img.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None);
  const paint = Skia.Paint();
  paint.setShader(fx.makeShaderWithChildren(uniforms, [child]));
  surface.getCanvas().drawRect(Skia.XYWHRect(0, 0, w, h), paint);
  surface.flush();
  const out = surface.makeImageSnapshot();
  return (out as any).makeNonTextureImage ? (out as any).makeNonTextureImage() : out;
}

// The smoothing is the slow part, so it's cached per photo and strength.
let cache: { img: SkImage; smooth: number; out: SkImage } | null = null;

/** Full cartoon at the photo's own resolution. bold 0..1 thickens the lines. */
export function renderToon(img: SkImage, style: ToonStyle, bold: number): SkImage | null {
  if (!BILATERAL_FX || !TOON_FX) return null;
  try {
    const scale = img.width() / 1000; // keep the look the same at any photo size
    let smooth = cache && cache.img === img && cache.smooth === style.smooth ? cache.out : null;
    if (!smooth) {
      let cur: SkImage | null = img;
      for (const r of [1.2, 2.2, 3.4]) {
        cur = cur && pass(BILATERAL_FX, cur, [r * style.smooth * scale, 0.15]);
      }
      if (!cur) return null;
      smooth = cur;
      cache = { img, smooth: style.smooth, out: cur };
    }
    const s = (1.1 + bold * 1.4) * scale;
    return pass(TOON_FX, smooth, [
      s, style.levels, style.sat, style.edge, style.thresh, style.lift, style.mono, style.halftone, ...style.ink, style.glow,
    ]);
  } catch {
    return null;
  }
}
