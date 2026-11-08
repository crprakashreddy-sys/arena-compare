import { Skia } from "@shopify/react-native-skia";

/**
 * Turns a real photo of your car into a cartoon, entirely on the phone's GPU (no server, no cost).
 * Three steps in one shader:
 *  1. Smooth: an edge-aware blur flattens paint, reflections and noise into clean areas of colour.
 *  2. Ink: a Sobel edge pass finds the car's real outline, panel gaps, windows and wheels.
 *  3. Colour: brightness is posterised into a few cel-shading bands and the colour is boosted.
 * Because it traces *your* photo, the cartoon keeps your car's exact shape, colour and angle.
 */
const SKSL = `
uniform shader image;
uniform float px;        // sampling distance in pixels (bigger = bolder, flatter)
uniform float levels;    // cel-shading bands
uniform float sat;       // colour boost
uniform float edge;      // ink strength 0..1
uniform float thresh;    // edge threshold
uniform float lift;      // pastel lift 0..1
uniform float mono;      // 1 = pencil sketch
uniform float halftone;  // comic dots 0..1
uniform float3 ink;      // outline colour
uniform float glow;      // 1 = neon: dark scene, glowing outlines

float lum(float3 c) { return dot(c, float3(0.299, 0.587, 0.114)); }

half4 main(float2 xy) {
  float3 c0 = float3(image.eval(xy).rgb);

  // 1. Edge-aware smoothing (cheap bilateral over a 5x5 ring).
  float3 acc = float3(0.0); float wsum = 0.0;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      float3 s = float3(image.eval(xy + float2(float(i), float(j)) * px).rgb);
      float d = length(s - c0);
      float w = exp(-d * d * 18.0) * exp(-float(i * i + j * j) * 0.12);
      acc += s * w; wsum += w;
    }
  }
  float3 c = acc / wsum;

  // 2. Sobel edges on luminance.
  float tl = lum(float3(image.eval(xy + float2(-px, -px)).rgb));
  float  t = lum(float3(image.eval(xy + float2(0.0, -px)).rgb));
  float tr = lum(float3(image.eval(xy + float2(px, -px)).rgb));
  float  l = lum(float3(image.eval(xy + float2(-px, 0.0)).rgb));
  float  r = lum(float3(image.eval(xy + float2(px, 0.0)).rgb));
  float bl = lum(float3(image.eval(xy + float2(-px, px)).rgb));
  float  b = lum(float3(image.eval(xy + float2(0.0, px)).rgb));
  float br = lum(float3(image.eval(xy + float2(px, px)).rgb));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float e = smoothstep(thresh, thresh + 0.18, sqrt(gx * gx + gy * gy));

  // 3. Cel shading: posterise brightness, keep hue, boost colour.
  float y = lum(c);
  float q = floor(y * levels + 0.5) / levels;
  float3 col = c * (q / max(y, 0.04));
  float g = lum(col);
  col = mix(float3(g), col, sat);
  col = mix(col, float3(1.0), lift * 0.35);

  if (halftone > 0.0) {
    float2 cell = fract(xy / 7.0) - 0.5;
    float dotR = (1.0 - q) * 0.62;
    float dots = 1.0 - smoothstep(dotR - 0.08, dotR + 0.08, length(cell));
    col *= 1.0 - dots * halftone * 0.45;
  }
  if (mono > 0.5) {
    float paper = 0.97 - (1.0 - q) * 0.22;
    col = float3(paper, paper * 0.985, paper * 0.95);
  }
  if (glow > 0.5) {
    col = col * 0.22;
    return half4(half3(clamp(col + ink * e * 1.4, 0.0, 1.0)), 1.0);
  }
  col = mix(col, ink, e * edge);
  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}`;

let effect: ReturnType<typeof Skia.RuntimeEffect.Make> = null;
try { effect = Skia.RuntimeEffect.Make(SKSL); } catch { effect = null; }
export const TOON_EFFECT = effect;

export type ToonStyle = {
  id: string; name: string; emoji: string;
  px: number; levels: number; sat: number; edge: number; thresh: number;
  lift: number; mono: number; halftone: number; ink: [number, number, number]; glow: number;
};

export const TOON_STYLES: ToonStyle[] = [
  { id: "toon", name: "Toon", emoji: "🎨", px: 1.6, levels: 5, sat: 1.45, edge: 0.95, thresh: 0.22, lift: 0, mono: 0, halftone: 0, ink: [0.07, 0.07, 0.09], glow: 0 },
  { id: "comic", name: "Comic", emoji: "💥", px: 2.4, levels: 4, sat: 1.75, edge: 1, thresh: 0.2, lift: 0, mono: 0, halftone: 1, ink: [0.02, 0.02, 0.04], glow: 0 },
  { id: "anime", name: "Anime", emoji: "✨", px: 1.3, levels: 6, sat: 1.25, edge: 0.75, thresh: 0.3, lift: 0.35, mono: 0, halftone: 0, ink: [0.18, 0.14, 0.24], glow: 0 },
  { id: "pastel", name: "Pastel", emoji: "🍬", px: 1.8, levels: 5, sat: 0.85, edge: 0.55, thresh: 0.28, lift: 1, mono: 0, halftone: 0, ink: [0.35, 0.3, 0.42], glow: 0 },
  { id: "sketch", name: "Sketch", emoji: "✏️", px: 1.2, levels: 4, sat: 0, edge: 0.9, thresh: 0.16, lift: 0, mono: 1, halftone: 0, ink: [0.16, 0.16, 0.2], glow: 0 },
  { id: "neon", name: "Neon", emoji: "🌃", px: 1.4, levels: 5, sat: 1.4, edge: 1, thresh: 0.18, lift: 0, mono: 0, halftone: 0, ink: [0.99, 0.89, 0.54], glow: 1 },
];

export function toonUniforms(s: ToonStyle, bold: number) {
  return {
    px: s.px * (0.7 + bold * 0.9), levels: s.levels, sat: s.sat, edge: s.edge, thresh: s.thresh,
    lift: s.lift, mono: s.mono, halftone: s.halftone, ink: s.ink, glow: s.glow,
  };
}
