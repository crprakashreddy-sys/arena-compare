import { Skia } from "@shopify/react-native-skia";

/**
 * zingd's photo grading engine. One GPU shader does what pro editors do: exposure, white balance,
 * highlight and shadow recovery, a filmic S-curve, saturation with vibrance (protects skin and
 * already-bright colours), split toning (colour the shadows and highlights separately), faded
 * blacks and black & white, all blended by an intensity slider. Runs live at full resolution.
 */
const SKSL = `
uniform shader image;
uniform float amount;
uniform float exposure;
uniform float contrast;
uniform float curve;
uniform float highlights;
uniform float shadows;
uniform float temp;
uniform float tint;
uniform float sat;
uniform float vib;
uniform float fade;
uniform float mono;
uniform float splitAmt;
uniform float3 shadowTint;
uniform float3 highTint;
uniform float clarity;   // local contrast ("pop") 0..1
uniform float sharpen;   // fine detail 0..1
uniform float grain;     // film grain 0..1 (luminance-aware, monochrome)
uniform float halation;  // red glow around bright lights (CineStill) 0..1
uniform float teal;      // greens and blues toward teal 0..1
uniform float rolloff;   // filmic highlight shoulder 0..1
uniform float px;        // pixel density (keeps radii the same at any export size)

float hash(float2 p) { p = fract(p * float2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float shoulder(float x, float t) { return x < t ? x : t + (1.0 - t) * (1.0 - exp(-(x - t) / (1.0 - t))); }

half4 main(float2 xy) {
  const float3 W = float3(0.2126, 0.7152, 0.0722);
  half4 src = image.eval(xy);
  float3 c = float3(src.rgb);
  float l0 = dot(c, W);

  // Neighbourhood: a small ring for sharpening, a wide ring for clarity and halation.
  float r1 = 1.2 * px, r2 = 7.0 * px;
  float nearL = 0.0, farL = 0.0; float3 farC = float3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    float2 d = float2(cos(a), sin(a));
    nearL += dot(float3(image.eval(xy + d * r1).rgb), W);
    float3 f = float3(image.eval(xy + d * r2).rgb) + float3(image.eval(xy + d * r2 * 2.1).rgb);
    farC += f; farL += dot(f, W);
  }
  nearL /= 8.0; farL /= 16.0; farC /= 16.0;

  // Skin: keep faces natural while everything else gets graded.
  float skin = smoothstep(0.02, 0.12, c.r - c.g) * smoothstep(0.0, 0.06, c.g - c.b) * (1.0 - smoothstep(0.32, 0.5, c.r - c.b));

  // Detail: fine sharpening, then midtone clarity (the "expensive camera" look).
  c += (l0 - nearL) * sharpen * 1.4;
  float mid = 1.0 - abs(l0 * 2.0 - 1.0);
  c += (l0 - farL) * clarity * 1.6 * mid * (1.0 - skin * 0.6);

  c *= exp2(exposure);
  c += float3(temp * 0.07, tint * 0.05, -temp * 0.07);

  float l = dot(c, W);
  float sh = 1.0 - smoothstep(0.0, 0.55, l);
  float hi = smoothstep(0.45, 1.0, l);
  c += shadows * 0.22 * sh * (1.0 - l);
  c += highlights * 0.22 * hi * l;

  c = (c - 0.5) * contrast + 0.5;
  float3 cc = clamp(c, 0.0, 1.0);
  c = mix(c, cc * cc * (3.0 - 2.0 * cc), curve);

  // Hue work: foliage and sky toward teal (cinema), skin untouched.
  float green = clamp((c.g - max(c.r, c.b)) * 4.0, 0.0, 1.0);
  float blue = clamp((c.b - max(c.r, c.g)) * 4.0, 0.0, 1.0);
  float3 tealed = float3(c.r * 0.88, c.g * 0.96 + c.b * 0.04, c.b * 0.7 + c.g * 0.3);
  c = mix(c, tealed, green * teal * (1.0 - skin));
  c = mix(c, float3(c.r * 0.92, c.g * 1.02, c.b), blue * teal * 0.6);

  l = dot(c, W);
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float chroma = clamp(mx - mn, 0.0, 1.0);
  float s = sat * (1.0 + vib * (1.0 - chroma) * 0.8);
  s = mix(s, 1.0 + (s - 1.0) * 0.4, skin);
  c = mix(float3(l), c, s);
  c = mix(c, float3(dot(c, W)), mono);

  float tl = clamp(dot(c, W), 0.0, 1.0);
  float split = splitAmt * (1.0 - skin * 0.65);
  c += (shadowTint - 0.5) * split * (1.0 - tl) * 0.6;
  c += (highTint - 0.5) * split * tl * 0.6;

  // Halation: warm red bloom bleeding out of bright lights.
  float glow = max(dot(farC, W) - 0.72, 0.0) * 2.2;
  c += float3(1.0, 0.32, 0.12) * glow * halation * 0.55;

  // Filmic shoulder: highlights roll off softly instead of clipping.
  float t = mix(0.995, 0.72, rolloff);
  c = float3(shoulder(max(c.r, 0.0), t), shoulder(max(c.g, 0.0), t), shoulder(max(c.b, 0.0), t));

  c = c * (1.0 - fade * 0.16) + fade * 0.16;

  // Grain: fine, monochrome, strongest in midtones, like real film.
  if (grain > 0.0) {
    float2 g = floor(xy / max(px * 1.15, 0.5));
    float n = (hash(g) + hash(g + 17.31) - 1.0);
    float gl = clamp(dot(c, W), 0.0, 1.0);
    c += n * grain * 0.11 * (0.35 + (1.0 - abs(gl * 2.0 - 1.0)) * 0.65);
  }

  c = clamp(c, 0.0, 1.0);
  return half4(half3(mix(float3(src.rgb), c, amount)), src.a);
}`;

let effect: ReturnType<typeof Skia.RuntimeEffect.Make> = null;
try { effect = Skia.RuntimeEffect.Make(SKSL); } catch { effect = null; }
if (!effect) console.warn("[zingd] grade shader failed to compile, using simple filters");
/** The compiled shader, or null if this phone can't run it (the editor then falls back to simple colour matrices). */
export const GRADE_EFFECT = effect;

export type Grade = {
  exposure: number; contrast: number; curve: number; highlights: number; shadows: number;
  temp: number; tint: number; sat: number; vib: number; fade: number; mono: number;
  splitAmt: number; shadowTint: [number, number, number]; highTint: [number, number, number];
  clarity: number; sharpen: number; halation: number; teal: number; rolloff: number;
};
export const NEUTRAL: Grade = {
  exposure: 0, contrast: 1, curve: 0, highlights: 0, shadows: 0, temp: 0, tint: 0, sat: 1, vib: 0, fade: 0, mono: 0,
  splitAmt: 0, shadowTint: [0.5, 0.5, 0.5], highTint: [0.5, 0.5, 0.5],
  clarity: 0.22, sharpen: 0.35, halation: 0, teal: 0, rolloff: 0.7,
};
export const g = (p: Partial<Grade>): Grade => ({ ...NEUTRAL, ...p });

/** The sliders in the Adjust tab: each runs from -1 to 1, 0 = untouched. */
export type Adjust = { exposure: number; contrast: number; highlights: number; shadows: number; warmth: number; saturation: number; fade: number };
export const NO_ADJUST: Adjust = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, warmth: 0, saturation: 0, fade: 0 };
export const ADJUST_LABELS: { key: keyof Adjust; label: string; icon: string }[] = [
  { key: "exposure", label: "Brightness", icon: "sunny" },
  { key: "contrast", label: "Contrast", icon: "contrast" },
  { key: "highlights", label: "Highlights", icon: "partly-sunny" },
  { key: "shadows", label: "Shadows", icon: "moon" },
  { key: "warmth", label: "Warmth", icon: "thermometer" },
  { key: "saturation", label: "Saturation", icon: "color-palette" },
  { key: "fade", label: "Fade", icon: "cloudy" },
];

/** Look + your slider tweaks + intensity → the numbers the shader needs. */
/** px = pixel density of the target (1 on screen, ~4 for a full-size export); grain is 0..1. */
export function uniformsFor(look: Grade, adj: Adjust, amount: number, px = 1, grain = 0) {
  return {
    amount,
    exposure: look.exposure + adj.exposure * 0.8,
    contrast: look.contrast * (1 + adj.contrast * 0.35),
    curve: look.curve,
    highlights: look.highlights + adj.highlights,
    shadows: look.shadows + adj.shadows,
    temp: look.temp + adj.warmth * 0.9,
    tint: look.tint,
    sat: Math.max(0, look.sat * (1 + adj.saturation * 0.6)),
    vib: look.vib,
    fade: Math.max(0, Math.min(1, look.fade + adj.fade * 0.8)),
    mono: look.mono,
    splitAmt: look.splitAmt,
    shadowTint: look.shadowTint,
    highTint: look.highTint,
    clarity: look.clarity * amount + adj.contrast * 0.15,
    sharpen: look.sharpen,
    grain,
    halation: look.halation,
    teal: look.teal,
    rolloff: look.rolloff,
    px,
  };
}
