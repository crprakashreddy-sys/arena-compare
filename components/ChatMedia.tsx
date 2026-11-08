import React from "react";
import { Image } from "expo-image";
import { gifSize, gifSrc } from "../lib/gifs";
import { StickerView } from "./ZingStickers";

type M = { body?: string | null; photo_path?: string | null; gif_url?: string | null; sticker?: string | null; zing_id?: string | null; deleted?: boolean };

/** Stickers (and GIPHY stickers) sit on the chat with no bubble, like WhatsApp and iMessage. */
export function isBare(m: M) {
  if (m.deleted || m.body || m.photo_path) return false;
  return !!m.sticker || (!!m.gif_url && gifSize(m.gif_url).sticker);
}

export function previewOf(m: M) {
  return m.deleted ? "Message deleted" : m.zing_id && m.body ? `↩︎ ${m.body}` : m.body ?? (m.zing_id ? "📸 Sent you a zing" : m.sticker ? "Sticker" : m.gif_url ? (gifSize(m.gif_url).sticker ? "Sticker" : "GIF") : "📷 Photo");
}

/** The GIF or sticker inside a message, sized to its real shape before it loads. */
export function ChatMedia({ m, maxW = 230 }: { m: M; maxW?: number }) {
  if (m.sticker) return <StickerView id={m.sticker} size={132} pop />;
  if (!m.gif_url) return null;
  const { w, h, sticker } = gifSize(m.gif_url);
  const width = sticker ? 150 : maxW;
  const height = Math.min(320, width * (h / w));
  return (
    <Image source={{ uri: gifSrc(m.gif_url) }} style={{ width, height, borderRadius: sticker ? 0 : 14 }}
      contentFit={sticker ? "contain" : "cover"} autoplay transition={120} />
  );
}
