// Cinematic looks for zaps. Each look is a colour grade (4×5 colour matrix) plus
// optional layers drawn on top in Skia: tints with blend modes, glow (bloom),
// light leak, vignette, film grain and letterbox bars.

type M = number[];

const IDENTITY: M = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

function saturation(s: number): M {
  const lr = 0.2126, lg = 0.7152, lb = 0.0722, a = 1 - s;
  return [
    lr * a + s, lg * a, lb * a, 0, 0,
    lr * a, lg * a + s, lb * a, 0, 0,
    lr * a, lg * a, lb * a + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}
function contrast(c: number, lift = 0): M {
  const o = (1 - c) / 2 + lift;
  return [c, 0, 0, 0, o, 0, c, 0, 0, o, 0, 0, c, 0, o, 0, 0, 0, 1, 0];
}
function scale(r: number, g: number, b: number, or = 0, og = 0, ob = 0): M {
  return [r, 0, 0, 0, or, 0, g, 0, 0, og, 0, 0, b, 0, ob, 0, 0, 0, 1, 0];
}
function sepia(amount: number): M {
  const s = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];
  const i = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const m = s.map((v, k) => i[k] * (1 - amount) + v * amount);
  return [m[0], m[1], m[2], 0, 0, m[3], m[4], m[5], 0, 0, m[6], m[7], m[8], 0, 0, 0, 0, 0, 1, 0];
}
function compose(a: M, b: M): M {
  const out: M = new Array(20).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += b[row * 5 + k] * a[k * 5 + col];
      if (col === 4) v += b[row * 5 + 4];
      out[row * 5 + col] = v;
    }
  }
  return out;
}
const chain = (...ms: M[]) => ms.reduce((acc, m) => compose(acc, m), IDENTITY);

export type Blend = "softLight" | "overlay" | "screen" | "lighten" | "multiply" | "srcOver";
export type Tint = { color: string; blend: Blend };

import { g, type Grade } from "./grade";

export type Look = {
  id: string;
  name: string;
  grade: Grade;     // the real grade (GPU shader)
  matrix: M;        // simple fallback if the shader can't run
  tints: Tint[];
  vignette: number; // 0–1 darkness at the edges
  grain: number;    // 0–1 opacity of film grain
  bloom: number;    // 0–1 strength of glow
  leak: boolean;    // warm light leak, top right
  letterbox: boolean;
};

// Teal, orange, lemon… [r, g, b] from 0 to 1, 0.5 = no tint.
const TEAL: [number, number, number] = [0.32, 0.58, 0.62], ORANGE: [number, number, number] = [0.72, 0.52, 0.36];
const MAGENTA: [number, number, number] = [0.66, 0.36, 0.64], BLUE: [number, number, number] = [0.36, 0.44, 0.7];
const WARM: [number, number, number] = [0.66, 0.54, 0.4], GREEN: [number, number, number] = [0.42, 0.6, 0.5];
const LEMON: [number, number, number] = [0.68, 0.64, 0.34], PINK: [number, number, number] = [0.7, 0.5, 0.58];
const COOL: [number, number, number] = [0.44, 0.5, 0.62], VIOLET: [number, number, number] = [0.5, 0.4, 0.66];

const base = { tints: [] as Tint[], vignette: 0, grain: 0, bloom: 0, leak: false, letterbox: false };

export const LOOKS: Look[] = [
  { ...base, id: "original", name: "Original", grade: g({ clarity: 0, sharpen: 0, rolloff: 0 }), matrix: IDENTITY },
  // zingd's signature: punchy but true, lemon highs, inky blue shadows.
  { ...base, id: "zing", name: "Zing", vignette: 0.3, grain: 0.06,
    grade: g({ contrast: 1.06, curve: 0.35, vib: 0.5, sat: 1.06, highlights: -0.35, shadows: 0.25, splitAmt: 0.35, shadowTint: BLUE, highTint: LEMON, clarity: 0.35, sharpen: 0.45 }),
    matrix: chain(contrast(1.12), saturation(1.2)) },
  // iPhone-Pro clean: bright, crisp, honest colour.
  { ...base, id: "clean", name: "Clean", vignette: 0.12,
    grade: g({ exposure: 0.08, curve: 0.25, vib: 0.45, highlights: -0.4, shadows: 0.35, clarity: 0.3, sharpen: 0.5, rolloff: 0.9 }),
    matrix: chain(contrast(1.05), saturation(1.12)) },
  // Kodak Portra 400: warm skin, soft pastel greens, creamy highlights, fine grain.
  { ...base, id: "portra", name: "Portra 400", vignette: 0.2, grain: 0.22,
    grade: g({ exposure: 0.06, contrast: 0.94, curve: 0.3, sat: 0.9, vib: 0.25, temp: 0.18, tint: 0.04, fade: 0.18, highlights: -0.45, shadows: 0.2,
      splitAmt: 0.45, shadowTint: [0.46, 0.52, 0.5], highTint: [0.64, 0.55, 0.45], teal: 0.25, clarity: 0.12, sharpen: 0.25, rolloff: 1 }),
    matrix: chain(contrast(0.95), saturation(0.92), sepia(0.12)) },
  // CineStill 800T: tungsten-cool night, red halation around every light.
  { ...base, id: "cinestill", name: "CineStill", vignette: 0.45, grain: 0.3, bloom: 0.3,
    grade: g({ temp: -0.45, tint: 0.06, contrast: 1.08, curve: 0.35, sat: 1.05, vib: 0.2, highlights: -0.3, shadows: 0.15,
      splitAmt: 0.6, shadowTint: [0.36, 0.48, 0.62], highTint: [0.62, 0.52, 0.46], halation: 0.9, clarity: 0.15, rolloff: 1 }),
    matrix: chain(saturation(1.1), contrast(1.1), scale(0.95, 0.98, 1.08)) },
  // Fuji Classic Chrome: muted, documentary, deep shadows, cool greens.
  { ...base, id: "chrome", name: "Classic Chrome", vignette: 0.3, grain: 0.12,
    grade: g({ contrast: 1.1, curve: 0.45, sat: 0.72, vib: -0.1, temp: -0.05, highlights: -0.3, shadows: -0.05,
      splitAmt: 0.35, shadowTint: [0.44, 0.5, 0.54], highTint: [0.56, 0.53, 0.47], teal: 0.5, clarity: 0.4, sharpen: 0.45 }),
    matrix: chain(saturation(0.72), contrast(1.12)) },
  // Blockbuster teal & orange.
  { ...base, id: "cinema", name: "Cinema", vignette: 0.55, grain: 0.14, letterbox: true,
    grade: g({ contrast: 1.12, curve: 0.45, sat: 0.95, vib: 0.2, highlights: -0.45, shadows: 0.1, splitAmt: 0.9, shadowTint: TEAL, highTint: ORANGE,
      teal: 0.85, halation: 0.15, clarity: 0.35, rolloff: 1 }),
    matrix: chain(contrast(1.16), saturation(1.12)), tints: [{ color: "rgba(0,110,120,0.38)", blend: "softLight" }, { color: "rgba(255,140,60,0.22)", blend: "overlay" }] },
  { ...base, id: "golden", name: "Golden Hour", vignette: 0.35, grain: 0.08, leak: true,
    grade: g({ exposure: 0.06, temp: 0.55, tint: 0.08, curve: 0.3, vib: 0.4, highlights: -0.3, splitAmt: 0.5, shadowTint: WARM, highTint: ORANGE, halation: 0.35, clarity: 0.2, rolloff: 1 }),
    matrix: chain(sepia(0.32), saturation(1.5), contrast(1.06)) },
  // Y2K digicam flash: bright, cool, punchy, a little crunchy. The trend that won't die.
  { ...base, id: "y2k", name: "Y2K Flash", vignette: 0.4, grain: 0.1, bloom: 0.2,
    grade: g({ exposure: 0.18, contrast: 1.15, curve: 0.3, sat: 1.12, vib: 0.2, temp: -0.22, tint: -0.04, highlights: 0.1, shadows: -0.1,
      splitAmt: 0.3, shadowTint: [0.44, 0.48, 0.6], highTint: [0.52, 0.52, 0.58], clarity: 0.1, sharpen: 0.8, rolloff: 0.3 }),
    matrix: chain(saturation(1.15), contrast(1.18), scale(0.98, 1.0, 1.05)) },
  // Old money: warm ivory highlights, low saturation, quiet luxury.
  { ...base, id: "oldmoney", name: "Old Money", vignette: 0.25, grain: 0.1,
    grade: g({ exposure: 0.04, contrast: 0.96, curve: 0.3, sat: 0.78, vib: 0.1, temp: 0.22, fade: 0.22, highlights: -0.4, shadows: 0.15,
      splitAmt: 0.5, shadowTint: [0.5, 0.48, 0.44], highTint: [0.62, 0.57, 0.48], teal: 0.15, clarity: 0.15, rolloff: 1 }),
    matrix: chain(saturation(0.8), contrast(0.96), sepia(0.18)) },
  { ...base, id: "neon", name: "Neon Night", vignette: 0.5, grain: 0.1, bloom: 0.5,
    grade: g({ exposure: -0.05, contrast: 1.15, curve: 0.4, sat: 1.3, vib: 0.3, temp: -0.25, splitAmt: 0.9, shadowTint: BLUE, highTint: MAGENTA, halation: 0.5, clarity: 0.25, rolloff: 1 }),
    matrix: chain(saturation(1.65), contrast(1.18)) },
  { ...base, id: "monsoon", name: "Monsoon", vignette: 0.4, grain: 0.14,
    grade: g({ temp: -0.3, sat: 0.8, contrast: 0.98, curve: 0.25, fade: 0.22, shadows: 0.2, splitAmt: 0.7, shadowTint: GREEN, highTint: COOL, teal: 0.4, clarity: 0.3 }),
    matrix: chain(saturation(0.72), contrast(1.06), scale(0.95, 0.97, 1.0)) },
  { ...base, id: "film", name: "Film 35", vignette: 0.35, grain: 0.32, leak: true,
    grade: g({ contrast: 0.94, curve: 0.35, sat: 0.88, fade: 0.4, temp: 0.15, highlights: -0.35, splitAmt: 0.6, shadowTint: GREEN, highTint: WARM, halation: 0.25, clarity: 0.1, rolloff: 1 }),
    matrix: chain(contrast(0.9), saturation(0.85), sepia(0.2)) },
  { ...base, id: "dusk", name: "Dusk", vignette: 0.45, grain: 0.08, bloom: 0.25,
    grade: g({ exposure: -0.06, contrast: 1.06, curve: 0.35, sat: 1.08, temp: 0.1, highlights: -0.35, splitAmt: 0.85, shadowTint: VIOLET, highTint: ORANGE, halation: 0.3, clarity: 0.25, rolloff: 1 }),
    matrix: chain(saturation(1.2), contrast(1.1), scale(1.03, 0.98, 1.02)) },
  { ...base, id: "dreamy", name: "Soft Glow", vignette: 0.15, grain: 0.05, bloom: 0.45,
    grade: g({ exposure: 0.14, contrast: 0.92, sat: 1.02, vib: 0.3, fade: 0.2, splitAmt: 0.45, shadowTint: PINK, highTint: PINK, clarity: -0.15, sharpen: 0.1, rolloff: 1 }),
    matrix: chain(saturation(1.25), scale(1.08, 1.08, 1.08), contrast(0.96)) },
  { ...base, id: "vivid", name: "Vivid", vignette: 0.18, grain: 0.03,
    grade: g({ contrast: 1.1, curve: 0.4, sat: 1.2, vib: 0.6, highlights: -0.3, shadows: 0.2, clarity: 0.45, sharpen: 0.5, rolloff: 0.9 }),
    matrix: chain(saturation(1.5), contrast(1.12)) },
  { ...base, id: "matte", name: "Matte", vignette: 0.2, grain: 0.1,
    grade: g({ contrast: 0.9, curve: 0.2, sat: 0.82, fade: 0.65, highlights: -0.25, splitAmt: 0.3, shadowTint: COOL, highTint: WARM, clarity: 0.15 }),
    matrix: chain(contrast(0.88, 0.04), saturation(0.82)) },
  { ...base, id: "noir", name: "Noir", vignette: 0.65, grain: 0.28, letterbox: true,
    grade: g({ mono: 1, contrast: 1.25, curve: 0.6, highlights: -0.2, shadows: -0.15, clarity: 0.5, sharpen: 0.5, rolloff: 1 }),
    matrix: chain(saturation(0), contrast(1.5)) },
  { ...base, id: "silver", name: "Silver", vignette: 0.3, grain: 0.2,
    grade: g({ mono: 1, contrast: 0.95, curve: 0.3, fade: 0.35, highlights: -0.3, shadows: 0.25, splitAmt: 0.35, shadowTint: COOL, highTint: WARM, clarity: 0.3, rolloff: 1 }),
    matrix: chain(saturation(0), contrast(1.1, 0.03)) },
];

/** Fallback only: fade a matrix look towards "no change". */
export function mixMatrix(m: M, amount: number): M { return m.map((v, i) => IDENTITY[i] + (v - IDENTITY[i]) * amount); }

export const lookById = (id: string) => LOOKS.find((l) => l.id === id) ?? LOOKS[1];

export { chain, contrast, saturation, scale };

/** Brightens the blurred copy used for glow. */
export const BLOOM_MATRIX: M = chain(scale(1.3, 1.3, 1.3), saturation(1.4));

export type CinemaTools = { grain: boolean; vignette: boolean; letterbox: boolean; glow: boolean; leak: boolean };

export const toolsFor = (l: Look): CinemaTools => ({
  grain: l.grain > 0, vignette: l.vignette > 0, letterbox: l.letterbox, glow: l.bloom > 0, leak: l.leak,
});
