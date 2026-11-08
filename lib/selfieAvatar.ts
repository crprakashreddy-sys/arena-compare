import { AlphaType, ColorType, Skia } from "@shopify/react-native-skia";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { AvatarOpts } from "./avatar";

/**
 * Reads a selfie (face inside the oval guide) and fills in the cartoon for you: real skin tone,
 * real hair colour, long or short hair, beard or not. All on the phone; the photo is never uploaded.
 */
type RGB = [number, number, number];
const N = 96; // analyse a small copy, it's plenty for colours

async function pixels(uri: string, square = true) {
  const out = await ImageManipulator.manipulate(uri).resize({ width: N }).renderAsync()
    .then((img) => img.saveAsync({ format: SaveFormat.PNG, base64: true }));
  const data = Skia.Data.fromBase64(out.base64!);
  const img = Skia.Image.MakeImageFromEncoded(data);
  if (!img) throw new Error("Couldn't read that photo.");
  const w = img.width(), h = img.height();
  let px = img.readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }) as Uint8Array | null;
  if (!px) px = img.readPixels() as Uint8Array | null;
  if (!px) throw new Error("Couldn't read that photo.");
  return { px, w, h, square };
}

/** Median colour of a box given in 0..1 fractions of the image. */
function region(p: { px: Uint8Array; w: number; h: number }, x0: number, y0: number, x1: number, y1: number): RGB {
  const r: number[] = [], g: number[] = [], b: number[] = [];
  for (let y = Math.floor(y0 * p.h); y < Math.ceil(y1 * p.h); y++) {
    for (let x = Math.floor(x0 * p.w); x < Math.ceil(x1 * p.w); x++) {
      const i = (y * p.w + x) * 4;
      r.push(p.px[i]); g.push(p.px[i + 1]); b.push(p.px[i + 2]);
    }
  }
  const med = (a: number[]) => a.sort((m, n) => m - n)[Math.floor(a.length / 2)] ?? 0;
  return [med(r), med(g), med(b)];
}
const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hex = (c: RGB) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const lum = (c: RGB) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
// Cartoon colours look best a touch cleaner and brighter than camera colours.
const tidy = (c: RGB, lift = 1.08): RGB => {
  const l = lum(c);
  return c.map((v) => (l + (v - l) * 1.12) * lift) as RGB;
};

export async function avatarFromSelfie(uri: string): Promise<Partial<AvatarOpts>> {
  const p = await pixels(uri);
  // The selfie screen asks for the face inside a centred oval, so these boxes land on the right spots.
  const cheekL = region(p, 0.32, 0.5, 0.42, 0.6), cheekR = region(p, 0.58, 0.5, 0.68, 0.6);
  const skin: RGB = [(cheekL[0] + cheekR[0]) / 2, (cheekL[1] + cheekR[1]) / 2, (cheekL[2] + cheekR[2]) / 2];
  const crown = region(p, 0.4, 0.14, 0.6, 0.22);
  const sideL = region(p, 0.16, 0.5, 0.24, 0.66), sideR = region(p, 0.76, 0.5, 0.84, 0.66);
  const chin = region(p, 0.42, 0.74, 0.58, 0.8);

  const bald = dist(crown, skin) < 38;
  const hair: RGB = bald ? skin : crown;
  const longHair = !bald && (dist(sideL, hair) < 45 || dist(sideR, hair) < 45) && dist(sideL, skin) > 40;
  const beard = dist(chin, skin) > 55 && lum(chin) < lum(skin) - 25;

  return {
    skinHex: hex(tidy(skin)),
    hairHex: bald ? null : hex(tidy(hair, 1.0)),
    hair: bald ? 5 : longHair ? 2 : 0,
    beard,
  };
}

/** Main paint colour of your car from a photo of it (centre of the frame, ignoring glass and tyres). */
export async function carColourFromPhoto(uri: string): Promise<string> {
  const p = await pixels(uri, false);
  // Body panels sit in the lower-middle of a typical car photo; take the most saturated-or-bright cluster.
  const samples: RGB[] = [];
  for (const [x, y] of [[0.3, 0.6], [0.5, 0.62], [0.7, 0.6], [0.4, 0.68], [0.6, 0.68], [0.5, 0.55]]) {
    samples.push(region(p, x - 0.05, y - 0.04, x + 0.05, y + 0.04));
  }
  const score = (c: RGB) => { const mx = Math.max(...c), mn = Math.min(...c); return (mx - mn) * 1.4 + (lum(c) > 200 ? 60 : 0); };
  samples.sort((a, b) => score(b) - score(a));
  const top = samples.slice(0, 3);
  const avg: RGB = [0, 1, 2].map((k) => top.reduce((sum, c) => sum + c[k], 0) / top.length) as RGB;
  return hex(tidy(avg, 1.05));
}
