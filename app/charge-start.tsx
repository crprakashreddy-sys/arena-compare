import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { cachedCharger, getCharger, speedLabel } from "../lib/chargers";
import { fmtMinutes, updateVehicle, usablePowerKW, useGarage, vehicleName } from "../lib/vehicles";
import { fetchSpeedStats, gunsFor, minutesTo, startCharge, type Gun, type SpeedStats } from "../lib/charging";
import { networkById, openNetworkApp } from "../lib/networks";
import { BatterySlider } from "../components/BatterySlider";
import { Ionicons } from "../components/SFIcon";
import { successHaptic, tapHaptic } from "../lib/motion";
import { batteryNote } from "../lib/drive";
import type { Charger } from "../lib/types";

/** Start a tracked charge: battery now, goal, and a live estimate with a "nearly done" ping. */
export default function ChargeStart() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const chargerId = decodeURIComponent(String(id ?? ""));
  const { active: v } = useGarage();
  const [c, setC] = useState<Charger | null>(cachedCharger(chargerId) ?? null);
  const [from, setFrom] = useState(v?.batteryPct ?? 20);
  const [goal, setGoal] = useState(80);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<SpeedStats>({});
  const [gunKey, setGunKey] = useState<string | null>(null);

  useEffect(() => { if (!c) getCharger(chargerId).then(setC); fetchSpeedStats(chargerId).then(setStats).catch(() => {}); }, [chargerId]);
  useEffect(() => { if (v?.batteryPct) setFrom(v.batteryPct); }, [v?.key]);

  if (!c) return <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: "center" }}><ActivityIndicator color={t.muted} /></View>;

  const n = networkById(c.network);
  const guns = gunsFor(c, v, stats);
  const gun: Gun | null = guns.find((g) => g.key === gunKey) ?? guns[0] ?? null;
  const kw = gun?.kw ?? (v ? usablePowerKW(c, v) : (c.powerKW ?? 7));
  const draft = { startPct: from, capKWh: v?.batteryKWh ?? 40, kw, slowKW: gun?.kind === "ac" ? kw * 0.85 : Math.max(kw * 0.35, Math.min(kw, v?.maxAcKW || kw)) } as any;
  const mins = minutesTo(draft, goal);
  const doneAt = new Date(Date.now() + mins * 60000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const start = async () => {
    setBusy(true);
    if (v) updateVehicle(v.key, { batteryPct: from, batteryAt: new Date().toISOString(), batterySource: "you" });
    await startCharge(c, v, from, goal, gun);
    successHaptic();
    router.back();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: "Start charging" }} />
      <View style={{ gap: 4 }}>
        <Text style={{ color: t.muted, fontWeight: "700", fontSize: 13 }}>{n.short} · {speedLabel(c)}</Text>
        <Text style={{ color: t.text, fontSize: 26, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.6 }}>{c.name}</Text>
        {v && <Text style={{ color: t.muted }}>{vehicleName(v)} can take about {Math.round(kw)} kW here</Text>}
      </View>

      {guns.length > 1 && (
        <View style={{ gap: 10 }}>
          <Text style={[styles.h, { color: t.text }]}>Which gun did you plug in?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {guns.map((g) => {
              const on = g.key === gun?.key;
              return (
                <Pressable key={g.key} onPress={() => { tapHaptic(); setGunKey(g.key); }} style={[styles.gun, { backgroundColor: on ? CTA : t.surface }]}>
                  <Ionicons name={g.kind === "dc" ? "flash" : "flash-outline"} size={16} color={on ? ON_CTA : t.text} />
                  <Text style={{ color: on ? ON_CTA : t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{g.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      {gun?.crowd != null && (
        <Text style={{ color: t.muted, fontSize: 13, marginTop: -10 }}>
          Drivers really get about <Text style={{ color: t.text, fontWeight: "800" }}>{Math.round(gun.crowd)} kW</Text> here ({stats[gun.kind]?.charges} charge{stats[gun.kind]?.charges === 1 ? "" : "s"}), so we use that.
        </Text>
      )}

      <View style={{ gap: 10 }}>
        <Text style={[styles.h, { color: t.text }]}>Battery right now</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <BatterySlider value={from} onChange={setFrom} />
          <Text style={{ color: t.text, fontSize: 28, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontVariant: ["tabular-nums"] }}>{from}%</Text>
        </View>
        <Text style={{ color: t.muted, fontSize: 12.5 }}>
          {v && batteryNote(v) && from === v.batteryPct ? `≈ ${from}% ${batteryNote(v)}. ` : ""}Drag to match your car's screen.
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={[styles.h, { color: t.text }]}>Charge to</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[80, 90, 100].map((g) => (
            <Pressable key={g} onPress={() => { tapHaptic(); setGoal(g); }}
              style={[styles.goal, { backgroundColor: goal === g ? CTA : t.surface }]}>
              <Text style={{ color: goal === g ? ON_CTA : t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17 }}>{g}%</Text>
              {g === 80 && <Text style={{ color: goal === g ? ON_CTA : t.muted, fontSize: 11, opacity: 0.8 }}>fastest</Text>}
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.estimate, { backgroundColor: t.surface }]}>
        <Ionicons name="timer-outline" size={22} color={t.text} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17 }}>
            {from >= goal ? "Already there" : `≈ ${fmtMinutes(mins)} · done by ${doneAt}`}
          </Text>
          <Text style={{ color: t.muted, fontSize: 12.5 }}>We'll ping you 5 minutes before, and log it when you drive off.</Text>
        </View>
      </View>

      <Pressable onPress={start} disabled={busy || from >= goal} style={[styles.go, { opacity: from >= goal ? 0.4 : 1 }]}>
        {busy ? <ActivityIndicator color={ON_CTA} /> : <Text style={styles.goText}>Start tracking</Text>}
      </Pressable>
      <Pressable onPress={() => openNetworkApp(n)} style={{ alignItems: "center", padding: 6 }}>
        <Text style={{ color: t.muted, fontWeight: "700" }}>Need to start or pay? Open {n.id === "other" ? "the charger's app" : `${n.short} app`}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 17, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
  gun: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 22 },
  goal: { flex: 1, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  estimate: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 18 },
  go: { height: 58, borderRadius: 999, backgroundColor: CTA, alignItems: "center", justifyContent: "center" },
  goText: { color: ON_CTA, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17 },
});
