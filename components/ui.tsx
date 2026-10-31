import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { STATUS_LABEL, statusColors, useTheme } from "../lib/theme";
import { networkById } from "../lib/networks";
import { timeAgo } from "../lib/geo";
import type { LiveStatus } from "../lib/types";

type IconName = keyof typeof Ionicons.glyphMap;

export function Button({ title, icon, onPress, kind = "secondary", busy, style, disabled }: {
  title: string; icon?: IconName; onPress: () => void; kind?: "primary" | "secondary" | "danger";
  busy?: boolean; style?: ViewStyle; disabled?: boolean;
}) {
  const t = useTheme();
  const bg = kind === "primary" ? t.accent : kind === "danger" ? t.badSoft : t.surface;
  const fg = kind === "primary" ? t.bg : kind === "danger" ? t.bad : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: pressed || disabled ? 0.7 : 1 }, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={{ color: fg, fontWeight: "600", fontSize: 15 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, on, onPress, dot, icon }: { label: string; on: boolean; onPress: () => void; dot?: string; icon?: IconName }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: on }}
      style={[styles.chip, { backgroundColor: on ? t.accentSoft : t.bg, borderColor: on ? t.accent : t.line }]}
    >
      {dot && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: on ? dot : t.faint }} />}
      {icon && <Ionicons name={icon} size={14} color={on ? t.accent : t.muted} />}
      <Text style={{ color: on ? t.accent : t.text, fontSize: 13, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}

export function Stars({ value, size = 14, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: onChange ? 8 : 1 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const name: IconName = value >= i ? "star" : value >= i - 0.5 ? "star-half" : "star-outline";
        const star = <Ionicons name={name} size={size} color={t.star} />;
        return onChange ? (
          <Pressable key={i} onPress={() => onChange(i)} accessibilityLabel={`${i} star${i > 1 ? "s" : ""}`} hitSlop={6}>{star}</Pressable>
        ) : <View key={i}>{star}</View>;
      })}
    </View>
  );
}

export function StatusBanner({ live }: { live?: LiveStatus }) {
  const t = useTheme();
  if (!live) {
    return (
      <View style={[styles.banner, { backgroundColor: t.surface }]}>
        <Ionicons name="help-circle-outline" size={18} color={t.muted} />
        <Text style={{ color: t.muted, flex: 1 }}>No reports in the last 3 hours. Be the first to drop a zap.</Text>
      </View>
    );
  }
  const c = statusColors(t)[live.status];
  const icon: IconName = live.status === "working" ? "checkmark-circle" : live.status === "busy" ? "time" : "close-circle";
  return (
    <View style={[styles.banner, { backgroundColor: c.bg }]}>
      <Ionicons name={icon} size={18} color={c.fg} />
      <Text style={{ color: c.fg, flex: 1 }}>
        <Text style={{ fontWeight: "700" }}>{STATUS_LABEL[live.status]}</Text>
        {` · ${live.reports} report${live.reports > 1 ? "s" : ""}, latest ${timeAgo(live.lastAt)}`}
      </Text>
    </View>
  );
}

/**
 * Charger pin: a pill in the network's colour with the charger's power, and a status dot.
 * Drivers read speed and status before tapping, which Google Maps' generic pins don't show.
 */
export function Pin({ network, status, selected, kw, fits = true }: {
  network: string; status?: LiveStatus["status"]; selected?: boolean; kw?: number | null; fits?: boolean;
}) {
  const n = networkById(network);
  const dot = status === "working" ? "#34C759" : status === "busy" ? "#FFB020" : status === "broken" ? "#FF453A" : null;
  const h = selected ? 34 : 26;
  const label = kw ? `${Math.round(kw)}` : null;
  return (
    <View style={{ alignItems: "center", opacity: fits ? 1 : 0.55 }}>
      <View style={{
        height: h, minWidth: h, paddingHorizontal: label ? (selected ? 9 : 6) : 0, borderRadius: h / 2,
        backgroundColor: n.color, borderWidth: 2, borderColor: "#FFFFFF",
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2,
        shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 4,
      }}>
        <Ionicons name="flash" size={selected ? 15 : 12} color="#fff" />
        {label && <Text style={{ color: "#fff", fontWeight: "800", fontSize: selected ? 13 : 11 }}>{label}</Text>}
      </View>
      {/* pointer */}
      <View style={{ width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#FFFFFF", marginTop: -1 }} />
      {dot && (
        <View style={{ position: "absolute", top: -3, right: -3, width: 12, height: 12, borderRadius: 6, backgroundColor: dot, borderWidth: 2, borderColor: "#fff" }} />
      )}
    </View>
  );
}

/** Several chargers drawn as one bubble when zoomed out; the green number is how many are working. */
export function ClusterPin({ count, working }: { count: number; working: number }) {
  const size = count > 50 ? 52 : count > 15 ? 44 : 36;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: "rgba(20,32,43,0.92)", borderWidth: 2.5, borderColor: "#FFD60A",
      alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: size > 40 ? 15 : 13 }}>{count}</Text>
      {working > 0 && <Text style={{ color: "#34C759", fontWeight: "800", fontSize: 9.5, marginTop: -2 }}>{working} live</Text>}
    </View>
  );
}

export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const t = useTheme();
  const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: t.accent, fontWeight: "700", fontSize: size * 0.38 }}>{initials || "?"}</Text>
    </View>
  );
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  const t = useTheme();
  if (!verified) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <Ionicons name="checkmark-circle" size={14} color={t.good} />
      <Text style={{ color: t.good, fontSize: 12, fontWeight: "600" }}>Verified EV</Text>
    </View>
  );
}

export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600" }}>{title}</Text>
        {action && <Pressable onPress={onAction} hitSlop={8}><Text style={{ color: t.accent, fontSize: 13, fontWeight: "600" }}>{action}</Text></Pressable>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 12, paddingHorizontal: 16 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1 },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12 },
});
