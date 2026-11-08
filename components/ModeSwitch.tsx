import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MODE_LABEL, useMode, type Mode } from "../lib/mode";
import { CTA, ON_CTA, useTheme } from "../lib/theme";
import { springNext, tapHaptic } from "../lib/motion";
import { Icon } from "./Icon";

/** The Cars / 2-wheelers switch. `compact` for the map's floating row. */
export function ModeSwitch({ compact, dark }: { compact?: boolean; dark?: boolean }) {
  const t = useTheme();
  const [mode, setMode] = useMode();
  const bg = dark ? "rgba(255,255,255,0.12)" : t.surface;
  return (
    <View style={[s.wrap, { backgroundColor: bg }, compact && s.compact]}>
      {(["car", "two"] as Mode[]).map((m) => {
        const on = mode === m;
        return (
          <Pressable key={m} onPress={() => { if (mode !== m) { tapHaptic(); springNext(); } setMode(m); }} style={[s.btn, compact && s.btnC, on && { backgroundColor: dark ? "#FCE38A" : CTA }]}
            accessibilityRole="button" accessibilityState={{ selected: on }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name={m === "car" ? "car" : "two"} size={compact ? 18 : 17} color={on ? (dark ? "#1A1A1A" : ON_CTA) : dark ? "#fff" : t.text} />
              {!compact && <Text style={{ color: on ? (dark ? "#1A1A1A" : ON_CTA) : dark ? "#fff" : t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 14 }}>{MODE_LABEL[m]}</Text>}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: "row", borderRadius: 999, padding: 3, gap: 3 },
  compact: { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  btn: { flex: 1, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  btnC: { flex: 0, height: 30, paddingHorizontal: 10 },
});
