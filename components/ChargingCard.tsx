import React, { useEffect, useRef } from "react";
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "./SFIcon";
import { Glass } from "./Glass";
import { liveState, setTarget, stopCharge, useTicker } from "../lib/charging";
import { fmtMinutes } from "../lib/vehicles";
import { successHaptic, tapHaptic } from "../lib/motion";
import type { Session } from "../lib/sessions";

const LEMON = "#FCE38A", INK = "#1A1A1A", GOOD = "#3DDC84";
const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** A breathing dot that says "live". */
function Pulse() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start(); return () => loop.stop();
  }, []);
  return (
    <View style={{ width: 10, height: 10, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: GOOD,
        opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GOOD }} />
    </View>
  );
}

/** Battery bar: filled to now, with a tick at the goal. */
function Bar({ pct, target, height = 14 }: { pct: number; target: number; height?: number }) {
  const w = useRef(new Animated.Value(pct)).current;
  useEffect(() => { Animated.timing(w, { toValue: pct, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [pct]);
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
      <Animated.View style={{ position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: height / 2, backgroundColor: pct >= target ? GOOD : LEMON,
        width: w.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }} />
      <View style={{ position: "absolute", top: 2, bottom: 2, width: 2, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.85)", left: `${target}%` }} />
    </View>
  );
}

export function confirmStop(s: Session) {
  const st = liveState(s);
  Alert.alert("Stop and log this charge?", `About ${Math.round(st.pct)}% now · +${st.addedKWh.toFixed(1)} kWh`, [
    { text: "Keep charging", style: "cancel" },
    { text: "Stop", style: "destructive", onPress: () => { stopCharge(s); successHaptic(); } },
  ]);
}

/**
 * The charge in progress: estimated battery %, time to goal and when it'll be done.
 * `compact` floats on the map; the full card sits on You and in the charging log.
 */
export function ChargingCard({ s, compact }: { s: Session; compact?: boolean }) {
  useTicker(compact ? 30000 : 10000);
  const st = liveState(s);
  const pct = Math.round(st.pct);

  if (compact) {
    return (
      <Pressable onPress={() => { tapHaptic(); router.push("/log"); }} accessibilityLabel={`Charging, about ${pct} percent`}>
        <Glass style={styles.compact} tint={INK}>
          <Pulse />
          <Text style={styles.compactPct}>{pct}%</Text>
          <View style={{ width: 70 }}><Bar pct={st.pct} target={st.target} height={8} /></View>
          <Text style={styles.compactSub}>{st.reached ? "Done" : fmtMinutes(st.minsLeft)}</Text>
        </Glass>
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pulse />
        <Text style={styles.kicker}>CHARGING NOW</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.est}>estimate</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
        <Text style={styles.big}>{pct}<Text style={styles.bigUnit}>%</Text></Text>
        <View style={{ paddingBottom: 12, gap: 2 }}>
          <Text style={styles.line} numberOfLines={1}>{st.reached ? `Reached ${st.target}%` : `${fmtMinutes(st.minsLeft)} to ${st.target}%`}</Text>
          <Text style={styles.sub}>{st.reached ? "Unplug when you're ready" : `Done around ${fmtTime(st.doneAt)}`}</Text>
        </View>
      </View>
      <Bar pct={st.pct} target={st.target} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={styles.sub} numberOfLines={1}>{s.chargerName}</Text>
        <Text style={[styles.sub, { fontVariant: ["tabular-nums"] }]}>+{st.addedKWh.toFixed(1)} kWh · {Math.round(s.kw ?? 0)} kW</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        {[80, 90, 100].map((g) => (
          <Pressable key={g} onPress={() => { tapHaptic(); setTarget(s, g); }}
            style={[styles.goal, st.target === g && { backgroundColor: LEMON }]}>
            <Text style={[styles.goalText, st.target === g && { color: INK }]}>{g}%</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => confirmStop(s)} style={styles.stop}>
          <Ionicons name="stop-circle" size={18} color={INK} />
          <Text style={{ color: INK, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Stop</Text>
        </Pressable>
      </View>
      <Text style={styles.foot}>Worked out from your starting %, your car's battery and this charger's speed. You'll get a ping 5 minutes before {st.target}%.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: INK },
  compactPct: { color: "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 16, fontVariant: ["tabular-nums"] },
  compactSub: { color: "#C9CED3", fontWeight: "700", fontSize: 12.5, fontVariant: ["tabular-nums"] },
  card: { backgroundColor: INK, borderRadius: 26, padding: 18, gap: 10 },
  kicker: { color: GOOD, fontSize: 12, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: 1 },
  est: { color: "#7E868D", fontSize: 11.5, fontWeight: "600" },
  big: { color: "#fff", fontSize: 64, lineHeight: 68, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -2.5, fontVariant: ["tabular-nums"] },
  bigUnit: { fontSize: 28, letterSpacing: 0, color: "#C9CED3" },
  line: { color: "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 16 },
  sub: { color: "#A3ADB6", fontSize: 13, flexShrink: 1 },
  goal: { height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  goalText: { color: "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
  stop: { flex: 1, height: 40, borderRadius: 20, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  foot: { color: "#7E868D", fontSize: 11.5, lineHeight: 16 },
});
