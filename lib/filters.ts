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

export type Look = {
  id: string;
  name: string;
  matrix: M;
  tints: Tint[];
  vignette: number; // 0–1 darkness at the edges
  grain: number;    // 0–1 opacity of film grain
  bloom: number;    // 0–1 strength of glow
  leak: boolean;    // warm light leak, top right
  letterbox: boolean;
};

export const LOOKS: Look[] = [
  { id: "original", name: "Original", matrix: IDENTITY, tints: [], vignette: 0, grain: 0, bloom: 0, leak: false, letterbox: false },
  {
    id: "cinema", name: "Cinema", matrix: chain(contrast(1.16), saturation(1.12), scale(1.02, 1.02, 1.02)),
    tints: [{ color: "rgba(0,110,120,0.38)", blend: "softLight" }, { color: "rgba(255,140,60,0.22)", blend: "overlay" }],
    vignette: 0.6, grain: 0.22, bloom: 0, leak: false, letterbox: true,
  },
  {
    id: "neon", name: "Neon Night", matrix: chain(saturation(1.65), contrast(1.18), scale(1.06, 1.06, 1.06)),
    tints: [{ color: "rgba(255,0,170,0.16)", blend: "screen" }, { color: "rgba(0,60,140,0.25)", blend: "softLight" }],
    vignette: 0.55, grain: 0.14, bloom: 0.6, leak: false, letterbox: false,
  },
  {
    id: "golden", name: "Golden Hour", matrix: chain(sepia(0.32), saturation(1.5), contrast(1.06), scale(1.06, 1.06, 1.06)),
    tints: [{ color: "rgba(255,150,60,0.22)", blend: "softLight" }],
    vignette: 0.4, grain: 0.12, bloom: 0, leak: true, letterbox: false,
  },
  {
    id: "monsoon", name: "Monsoon", matrix: chain(saturation(0.72), contrast(1.06), scale(0.95, 0.97, 1.0)),
    tints: [{ color: "rgba(40,96,150,0.32)", blend: "softLight" }, { color: "rgba(200,215,230,0.10)", blend: "srcOver" }],
    vignette: 0.45, grain: 0.18, bloom: 0, leak: false, letterbox: false,
  },
  {
    id: "film", name: "Film 35", matrix: chain(contrast(0.9), saturation(0.85), sepia(0.2), scale(1.05, 1.05, 1.05)),
    tints: [{ color: "rgba(42,34,28,0.55)", blend: "lighten" }, { color: "rgba(255,170,120,0.12)", blend: "softLight" }],
    vignette: 0.35, grain: 0.38, bloom: 0, leak: true, letterbox: false,
  },
  {
    id: "noir", name: "Noir", matrix: chain(saturation(0), contrast(1.5), scale(0.94, 0.94, 0.94)),
    tints: [], vignette: 0.7, grain: 0.3, bloom: 0, leak: false, letterbox: true,
  },
  {
    id: "dreamy", name: "Dreamy", matrix: chain(saturation(1.25), scale(1.08, 1.08, 1.08), contrast(0.96)),
    tints: [{ color: "rgba(255,170,210,0.16)", blend: "screen" }],
    vignette: 0.25, grain: 0.08, bloom: 0.5, leak: false, letterbox: false,
  },
  { id: "vivid", name: "Vivid", matrix: chain(saturation(1.5), contrast(1.12)), tints: [], vignette: 0.2, grain: 0.05, bloom: 0, leak: false, letterbox: false },
];

export const lookById = (id: string) => LOOKS.find((l) => l.id === id) ?? LOOKS[1];

/** Brightens the blurred copy used for glow. */
export const BLOOM_MATRIX: M = chain(scale(1.3, 1.3, 1.3), saturation(1.4));

export type CinemaTools = { grain: boolean; vignette: boolean; letterbox: boolean; glow: boolean; leak: boolean };

export const toolsFor = (l: Look): CinemaTools => ({
  grain: l.grain > 0, vignette: l.vignette > 0, letterbox: l.letterbox, glow: l.bloom > 0, leak: l.leak,
});
