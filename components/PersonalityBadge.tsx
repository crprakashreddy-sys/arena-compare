import React from "react";
import { Text, View } from "react-native";
import { personalityById } from "../lib/personality";

/** Small coloured badge: "🛣️ Road Tripper". */
export function PersonalityBadge({ id, size = "sm" }: { id?: string | null; size?: "sm" | "md" }) {
  const p = personalityById(id);
  if (!p) return null;
  const md = size === "md";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "center", backgroundColor: p.color,
      paddingHorizontal: md ? 12 : 9, paddingVertical: md ? 6 : 4, borderRadius: 999 }}>
      <Text style={{ fontSize: md ? 14 : 12 }}>{p.emoji}</Text>
      <Text style={{ color: p.ink, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: md ? 14 : 12 }}>{p.name}</Text>
    </View>
  );
}
