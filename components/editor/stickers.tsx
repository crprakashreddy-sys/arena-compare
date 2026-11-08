import React from "react";
import { Group, Paragraph, RoundedRect, Skia, TextAlign, Circle, type SkParagraph } from "@shopify/react-native-skia";
import { ZING_STICKERS } from "../ZingStickers";

/**
 * zingd's photo stickers, drawn in Skia so they're baked into the saved photo at full quality.
 * Text stickers have several looks you cycle through by tapping (like Snapchat); the zingd pack
 * and big emoji come along too. Every sticker can be moved, pinched to resize and twisted to rotate.
 */
export type InfoKind = "status" | "battery" | "speed" | "charger" | "time" | "waited" | "car";
export type StickerStyle = "pill" | "glass" | "headline" | "script" | "digital" | "tag" | "neon";
export type Sticker = {
  key: string;
  kind: InfoKind | `z:${string}` | `e:${string}`;
  style: StickerStyle;
  x: number; y: number;       // centre
  scale: number; rot: number; // radians
};

const fontMgr = (() => { try { return Skia.FontMgr.System(); } catch { return null; } })();

/** Which looks each kind of sticker can take (tap cycles through them). */
export function stylesFor(kind: Sticker["kind"]): StickerStyle[] {
  if (kind.startsWith("z:") || kind.startsWith("e:")) return ["pill"];
  if (kind === "time" || kind === "battery" || kind === "waited") return ["digital", "pill", "glass", "neon", "headline"];
  if (kind === "charger") return ["tag", "glass", "script", "headline", "pill"];
  if (kind === "car") return ["script", "pill", "glass", "neon"];
  if (kind === "status") return ["pill", "headline", "neon", "glass", "script"];
  return ["pill", "glass", "headline", "neon"];
}
export function firstStyle(kind: Sticker["kind"]) { return stylesFor(kind)[0]; }

type Built = { w: number; h: number; draw: React.ReactNode };

function para(text: string, o: {
  families: string[]; size: number; weight?: number; color: string; italic?: boolean; spacing?: number;
  shadow?: { color: string; x: number; y: number; blur: number }[]; width?: number;
}): SkParagraph | null {
  if (!fontMgr) return null;
  const b = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Center }, fontMgr);
  b.pushStyle({
    fontFamilies: [...o.families, "Helvetica Neue", "Apple Color Emoji"],
    fontSize: o.size,
    fontStyle: { weight: o.weight ?? 700, slant: o.italic ? 1 : 0 } as any,
    color: Skia.Color(o.color),
    letterSpacing: o.spacing ?? 0,
    shadows: (o.shadow ?? []).map((s) => ({ color: Skia.Color(s.color), offset: { x: s.x, y: s.y }, blurRadius: s.blur })),
  } as any);
  b.addText(text);
  const p = b.build();
  p.layout(o.width ?? 1000);
  return p;
}
function fit(p: SkParagraph) {
  const w = Math.ceil(p.getLongestLine()) + 2, h = Math.ceil(p.getHeight());
  p.layout(w);
  return { w, h };
}
function textNode(p: SkParagraph, w: number, h: number, ox = 0, oy = 0) {
  return <Paragraph paragraph={p} x={-w / 2 + ox} y={-h / 2 + oy} width={w} />;
}

/** Build a sticker's drawing, centred on (0, 0), plus its size for hit-testing. */
export function buildSticker(s: Sticker, text: string, accent: string): Built | null {
  // zingd pack: die-cut card with emoji and label.
  if (s.kind.startsWith("z:")) {
    const z = ZING_STICKERS.find((x) => x.id === s.kind.slice(2)); if (!z) return null;
    const e = para(z.emoji, { families: ["Apple Color Emoji"], size: 40, color: "#000" });
    const t = para(z.text, { families: ["Futura", "Avenir Next Condensed"], size: z.text.length > 14 ? 15 : 19, weight: 900, color: z.fg, spacing: 0.4, width: 150 });
    if (!e || !t) return null;
    const es = fit(e), ts = fit(t);
    const w = Math.max(es.w, ts.w) + 28, h = es.h + ts.h + 22;
    return { w: w + 10, h: h + 10, draw: (
      <Group transform={[{ rotate: (z.tilt * Math.PI) / 180 }]}>
        <RoundedRect x={-w / 2 - 5} y={-h / 2 - 5} width={w + 10} height={h + 10} r={26} color="#FFFFFF" />
        <RoundedRect x={-w / 2} y={-h / 2} width={w} height={h} r={22} color={z.bg} />
        {textNode(e, es.w, es.h, 0, -ts.h / 2 - 1)}
        {textNode(t, ts.w, ts.h, 0, es.h / 2 + 1)}
      </Group>
    ) };
  }
  // Big emoji, with a soft shadow so it sits on the photo.
  if (s.kind.startsWith("e:")) {
    const e = para(s.kind.slice(2), { families: ["Apple Color Emoji"], size: 84, color: "#000", shadow: [{ color: "rgba(0,0,0,0.35)", x: 0, y: 4, blur: 10 }] });
    if (!e) return null; const z = fit(e);
    return { w: z.w, h: z.h, draw: textNode(e, z.w, z.h) };
  }

  switch (s.style) {
    case "pill": {
      const p = para(text.toUpperCase(), { families: ["Futura", "Avenir Next"], size: 24, weight: 900, color: "#FFFFFF", spacing: 0.6 });
      if (!p) return null; const z = fit(p); const w = z.w + 34, h = z.h + 18;
      return { w, h, draw: (<>
        <RoundedRect x={-w / 2} y={-h / 2 + 3} width={w} height={h} r={h / 2} color="rgba(0,0,0,0.25)" />
        <RoundedRect x={-w / 2} y={-h / 2} width={w} height={h} r={h / 2} color={accent} />
        <RoundedRect x={-w / 2 + 3} y={-h / 2 + 3} width={w - 6} height={h / 2 - 3} r={h / 2} color="rgba(255,255,255,0.16)" />
        {textNode(p, z.w, z.h)}
      </>) };
    }
    case "glass": {
      const p = para(text, { families: ["Avenir Next", "Helvetica Neue"], size: 22, weight: 800, color: "#1A1A1A" });
      if (!p) return null; const z = fit(p); const w = z.w + 30, h = z.h + 16;
      return { w, h, draw: (<>
        <RoundedRect x={-w / 2} y={-h / 2} width={w} height={h} r={14} color="rgba(255,255,255,0.88)" />
        <Circle cx={-w / 2 + 12} cy={0} r={4} color={accent} />
        {textNode(p, z.w, z.h, 6)}
      </>) };
    }
    case "headline": {
      const p = para(text.toUpperCase(), { families: ["Futura", "Avenir Next Condensed"], size: 46, weight: 900, color: "#FFFFFF", spacing: -0.5,
        shadow: [{ color: accent, x: 3, y: 3, blur: 0 }, { color: "rgba(0,0,0,0.45)", x: 0, y: 6, blur: 12 }], width: 320 });
      if (!p) return null; const z = fit(p);
      return { w: z.w, h: z.h, draw: textNode(p, z.w, z.h) };
    }
    case "script": {
      const p = para(text, { families: ["Snell Roundhand", "Savoye LET", "Zapfino"], size: 46, weight: 900, color: accent,
        shadow: [{ color: "#FFFFFF", x: 0, y: 0, blur: 2 }, { color: "#FFFFFF", x: 2, y: 2, blur: 0 }, { color: "rgba(0,0,0,0.3)", x: 0, y: 4, blur: 8 }], width: 340 });
      if (!p) return null; const z = fit(p);
      return { w: z.w, h: z.h, draw: textNode(p, z.w, z.h) };
    }
    case "digital": {
      const p = para(text.replace(" CHARGED", "%").replace("WAITED ", "").replace(/ MIN$/, "m"), {
        families: ["Avenir Next Condensed", "DIN Condensed", "Helvetica Neue"], size: 86, weight: 200, color: "#FFFFFF", spacing: -2,
        shadow: [{ color: "rgba(0,0,0,0.35)", x: 0, y: 3, blur: 10 }] });
      const cap = para(text.includes("CHARGED") ? "BATTERY" : text.startsWith("WAITED") || text === "NO WAIT" ? "WAITED" : "", {
        families: ["Avenir Next"], size: 13, weight: 800, color: "#FFFFFF", spacing: 3 });
      if (!p) return null; const z = fit(p); const c = cap ? fit(cap) : { w: 0, h: 0 };
      return { w: z.w, h: z.h + c.h, draw: (<>
        {textNode(p, z.w, z.h, 0, -c.h / 2)}
        {cap && c.h > 0 && textNode(cap, c.w, c.h, 0, z.h / 2)}
      </>) };
    }
    case "tag": {
      const pin = para("📍", { families: ["Apple Color Emoji"], size: 20, color: "#000" });
      const p = para(text, { families: ["Avenir Next"], size: 20, weight: 800, color: "#1A1A1A" });
      if (!p || !pin) return null; const z = fit(p), pz = fit(pin); const w = z.w + pz.w + 30, h = Math.max(z.h, pz.h) + 14;
      return { w, h, draw: (<>
        <RoundedRect x={-w / 2} y={-h / 2} width={w} height={h} r={10} color="#FFFFFF" />
        <RoundedRect x={-w / 2} y={-h / 2} width={6} height={h} r={3} color={accent} />
        {textNode(pin, pz.w, pz.h, -w / 2 + 12 + pz.w / 2)}
        {textNode(p, z.w, z.h, -w / 2 + 12 + pz.w + 6 + z.w / 2)}
      </>) };
    }
    case "neon": {
      const p = para(text, { families: ["Avenir Next", "Futura"], size: 34, weight: 700, color: "#FFFFFF",
        shadow: [{ color: accent, x: 0, y: 0, blur: 6 }, { color: accent, x: 0, y: 0, blur: 16 }, { color: accent, x: 0, y: 0, blur: 28 }], width: 340 });
      if (!p) return null; const z = fit(p);
      return { w: z.w + 20, h: z.h + 16, draw: textNode(p, z.w, z.h) };
    }
  }
  return null;
}

/** Is (px, py) on sticker s (taking its position, size, scale and rotation into account)? */
export function hitSticker(s: Sticker, b: { w: number; h: number }, px: number, py: number, pad = 14) {
  const dx = px - s.x, dy = py - s.y;
  const c = Math.cos(-s.rot), si = Math.sin(-s.rot);
  const lx = (dx * c - dy * si) / s.scale, ly = (dx * si + dy * c) / s.scale;
  return Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad;
}

export const EMOJI_STICKERS = ["⚡", "🔋", "🔥", "😍", "🚗💨", "☕", "🙏", "😤", "🎉", "💯", "🛣️", "🌧️", "🌄", "😎", "🤝", "📍"];
