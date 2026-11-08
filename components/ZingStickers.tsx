import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

/**
 * zingd's own sticker pack: chunky die-cut stickers for EV life in India.
 * Built into the app, so they're free, instant and work with no internet search.
 */
export type ZingSticker = { id: string; emoji: string; text: string; bg: string; fg: string; tilt: number };
export const ZING_STICKERS: ZingSticker[] = [
  { id: "charged", emoji: "🔋", text: "FULLY\nCHARGED", bg: "#FCE38A", fg: "#1A1A1A", tilt: -5 },
  { id: "on_my_way", emoji: "🚗💨", text: "ON MY\nWAY", bg: "#1A1A1A", fg: "#FCE38A", tilt: 4 },
  { id: "charger_down", emoji: "😤", text: "CHARGER\nDOWN", bg: "#FF5A4E", fg: "#FFFFFF", tilt: -3 },
  { id: "queue", emoji: "⏳", text: "IN THE\nQUEUE", bg: "#FFB547", fg: "#1A1A1A", tilt: 3 },
  { id: "chai_stop", emoji: "☕", text: "CHAI\nSTOP", bg: "#C98B5A", fg: "#FFFFFF", tilt: -4 },
  { id: "road_trip", emoji: "🛣️", text: "ROAD\nTRIP!", bg: "#3DB2FF", fg: "#FFFFFF", tilt: 5 },
  { id: "range_anxiety", emoji: "😅", text: "RANGE\nANXIETY", bg: "#B892FF", fg: "#1A1A1A", tilt: -2 },
  { id: "eighty_club", emoji: "⚡", text: "80%\nCLUB", bg: "#2FBF71", fg: "#FFFFFF", tilt: 4 },
  { id: "no_petrol", emoji: "⛽🚫", text: "NEVER\nAGAIN", bg: "#FFFFFF", fg: "#1A1A1A", tilt: -5 },
  { id: "dc_fast", emoji: "⚡⚡", text: "DC\nFAST", bg: "#1F6FEB", fg: "#FCE38A", tilt: 3 },
  { id: "saved_money", emoji: "💸", text: "SAVED\n₹₹₹", bg: "#9BE15D", fg: "#1A1A1A", tilt: -3 },
  { id: "thank_you", emoji: "🙏", text: "THANK\nYOU", bg: "#FF8FB1", fg: "#1A1A1A", tilt: 4 },
  { id: "welcome", emoji: "👋", text: "WELCOME\nTO THE CREW", bg: "#FCE38A", fg: "#1A1A1A", tilt: -4 },
  { id: "meetup", emoji: "📍", text: "MEETUP?", bg: "#1A1A1A", fg: "#FFFFFF", tilt: 2 },
  { id: "full_send", emoji: "🔥", text: "LET'S\nGO", bg: "#FF6B2C", fg: "#FFFFFF", tilt: -5 },
  { id: "zing", emoji: "⚡", text: "ZING!", bg: "#FCE38A", fg: "#1A1A1A", tilt: 6 },
];
export const stickerById = (id?: string | null) => ZING_STICKERS.find((s) => s.id === id) ?? null;

/** One sticker. `pop` springs it in, like it was just slapped on. */
export function StickerView({ id, size = 120, pop }: { id: string; size?: number; pop?: boolean }) {
  const st = stickerById(id);
  const a = useRef(new Animated.Value(pop ? 0.4 : 1)).current;
  useEffect(() => { if (pop) Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }).start(); }, []);
  if (!st) return null;
  const k = size / 120;
  return (
    <Animated.View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", transform: [{ scale: a }, { rotate: `${st.tilt}deg` }] }}>
      <View style={[s.die, { borderRadius: 26 * k, padding: 4 * k }]}>
        <View style={[s.face, { backgroundColor: st.bg, borderRadius: 22 * k, paddingHorizontal: 10 * k, paddingVertical: 8 * k, minWidth: 92 * k }]}>
          <Text style={{ fontSize: 34 * k, lineHeight: 40 * k }}>{st.emoji}</Text>
          <Text style={[s.text, { color: st.fg, fontSize: (st.text.length > 14 ? 12 : 15) * k, lineHeight: (st.text.length > 14 ? 13 : 16) * k }]}>{st.text}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  die: { backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  face: { alignItems: "center", justifyContent: "center" },
  text: { fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", textAlign: "center", letterSpacing: 0.3 },
});
