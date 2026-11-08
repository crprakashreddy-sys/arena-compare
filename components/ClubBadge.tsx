import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { networkById } from "../lib/networks";
import type { Club } from "../lib/clubs";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";

/** Round club avatar: emoji on the club's colour for driver-made clubs, brand colour and initials otherwise. */
export function ClubBadge({ c, size }: { c: Pick<Club, "make" | "kind" | "emoji" | "color">; size: number }) {
  if (c.kind === "custom") {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.color || LEMON, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: size * 0.5 }}>{c.emoji || "⚡"}</Text>
      </View>
    );
  }
  const net = networkById(c.make.toLowerCase().replace("tata", "tataev"));
  const bg = net.id !== "other" ? net.color : INK;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: c.kind === "brand" ? LEMON : "#fff", fontWeight: "900", fontSize: size * 0.36 }}>{c.make.slice(0, 2).toUpperCase()}</Text>
      {c.kind === "model" && (
        <View style={{ position: "absolute", right: -2, bottom: -2, width: size * 0.38, height: size * 0.38, borderRadius: size, backgroundColor: LEMON, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" }}>
          <Ionicons name="flash" size={size * 0.2} color={INK} />
        </View>
      )}
    </View>
  );
}
