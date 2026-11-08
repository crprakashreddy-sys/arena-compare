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

half4 main(float2 xy) {
  half4 src = image.eval(xy);
  float3 c = float3(src.rgb);
  const float3 W = float3(0.2126, 0.7152, 0.0722);

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

  l = dot(c, W);
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float chroma = clamp(mx - mn, 0.0, 1.0);
  float s = sat * (1.0 + vib * (1.0 - chroma) * 0.8);
  c = mix(float3(l), c, s);
  c = mix(c, float3(dot(c, W)), mono);

  float tl = clamp(dot(c, W), 0.0, 1.0);
  c += (shadowTint - 0.5) * splitAmt * (1.0 - tl) * 0.6;
  c += (highTint - 0.5) * splitAmt * tl * 0.6;

  c = c * (1.0 - fade * 0.16) + fade * 0.16;
  c = clamp(c, 0.0, 1.0);
  return half4(half3(mix(float3(src.rgb), c, amount)), src.a);
}`;

let effect: ReturnType<typeof Skia.RuntimeEffect.Make> = null;
try { effect = Skia.RuntimeEffect.Make(SKSL); } catch { effect = null; }
/** The compiled shader, or null if this phone can't run it (the editor then falls back to simple colour matrices). */
export const GRADE_EFFECT = effect;

export type Grade = {
  exposure: number; contrast: number; curve: number; highlights: number; shadows: number;
  temp: number; tint: number; sat: number; vib: number; fade: number; mono: number;
  splitAmt: number; shadowTint: [number, number, number]; highTint: [number, number, number];
};
export const NEUTRAL: Grade = {
  exposure: 0, contrast: 1, curve: 0, highlights: 0, shadows: 0, temp: 0, tint: 0, sat: 1, vib: 0, fade: 0, mono: 0,
  splitAmt: 0, shadowTint: [0.5, 0.5, 0.5], highTint: [0.5, 0.5, 0.5],
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
export function uniformsFor(look: Grade, adj: Adjust, amount: number) {
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
  };
}
