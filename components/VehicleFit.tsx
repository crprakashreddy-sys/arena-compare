import React from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";
import { PLUG_LABEL, chargeMinutes, fitFor, fmtMinutes, plugsOf, usablePowerKW, useGarage, vehicleName } from "../lib/vehicles";
import type { Charger } from "../lib/types";

/** On a charger page: does it fit the driver's vehicle, at what power, and how long a charge takes. */
export default function VehicleFit({ charger }: { charger: Charger }) {
  const t = useTheme();
  const { active: v } = useGarage();

  if (!v) {
    return (
      <Pressable onPress={() => router.push("/garage")} style={{ flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderRadius: 12, backgroundColor: t.surface }}>
        <Ionicons name="car-sport-outline" size={20} color={t.accent} />
        <Text style={{ color: t.text, flex: 1 }}>Add your EV to see if this charger fits and how long it takes.</Text>
        <Ionicons name="chevron-forward" size={18} color={t.muted} />
      </Pressable>
    );
  }

  const fit = fitFor(charger, v);
  const plugs = plugsOf(charger);
  const kw = usablePowerKW(charger, v);
  const tone = fit === "fits" ? t.good : fit === "no" ? t.bad : t.muted;
  const head = fit === "fits" ? `Fits your ${vehicleName(v)}` : fit === "no" ? `Doesn't fit your ${vehicleName(v)}` : `Connector not listed for this charger`;

  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: t.surface, gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Ionicons name={fit === "fits" ? "checkmark-circle" : fit === "no" ? "close-circle" : "help-circle"} size={20} color={tone} />
        <Text style={{ color: t.text, fontWeight: "700", flex: 1 }}>{head}</Text>
        <Pressable onPress={() => router.push("/garage")} hitSlop={8}><Text style={{ color: t.accent, fontSize: 13, fontWeight: "600" }}>Change</Text></Pressable>
      </View>
      {fit === "no" ? (
        <Text style={{ color: t.muted, fontSize: 13 }}>
          This charger has {plugs.map((p) => PLUG_LABEL[p]).join(", ")}. Your vehicle uses {v.plugs.map((p) => PLUG_LABEL[p]).join(", ")}.
        </Text>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            [`${Math.round(kw * 10) / 10} kW`, "Your speed here"],
            [fmtMinutes(chargeMinutes(charger, v, 0.2, 0.8)), "20 → 80%"],
            [fmtMinutes(chargeMinutes(charger, v, 0.1, 1)), "10 → 100%"],
          ].map(([a, b]) => (
            <View key={b} style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: t.bg }}>
              <Text style={{ color: t.text, fontWeight: "800", fontSize: 16, fontVariant: ["tabular-nums"] }}>{a}</Text>
              <Text style={{ color: t.muted, fontSize: 11.5 }}>{b}</Text>
            </View>
          ))}
        </View>
      )}
      {fit === "unknown" && <Text style={{ color: t.muted, fontSize: 12.5 }}>Times assume it fits. Check the zaps or ask drivers who charged here.</Text>}
    </View>
  );
}
