import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";
import { networkById } from "../lib/networks";
import { addPastSession, deleteSession, finishSession, monthTotals, rupees, useSessions, type Session } from "../lib/sessions";

const MONTH = new Date().toLocaleString("en-IN", { month: "long" });

/** Charging log: the charge in progress, this month's spend, and past charges. */
export default function ChargingLog() {
  const t = useTheme();
  const { sessions, active } = useSessions();
  const totals = monthTotals(sessions);
  const [adding, setAdding] = useState(false);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Charging log" }} />

      {active && <ActiveCard s={active} />}

      <View style={{ flexDirection: "row", gap: 8 }}>
        {[
          [rupees(totals.cost), `Spent in ${MONTH}`],
          [`${Math.round(totals.kWh)} kWh`, `${totals.count} charge${totals.count === 1 ? "" : "s"}`],
          [totals.perKWh ? `₹${totals.perKWh.toFixed(1)}` : "—", "Avg per kWh"],
        ].map(([a, b]) => (
          <View key={b} style={[styles.stat, { backgroundColor: t.surface }]}>
            <Text style={{ color: t.text, fontWeight: "800", fontSize: 18, fontVariant: ["tabular-nums"] }}>{a}</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>{b}</Text>
          </View>
        ))}
      </View>

      <Pressable onPress={() => router.push("/savings")} style={[styles.link, { backgroundColor: t.surface }]}>
        <Ionicons name="trending-down" size={20} color={t.good} />
        <Text style={{ color: t.text, flex: 1, fontWeight: "600" }}>See how much you save versus petrol</Text>
        <Ionicons name="chevron-forward" size={18} color={t.muted} />
      </Pressable>

      {adding ? <ManualEntry onDone={() => setAdding(false)} /> : (
        <Pressable onPress={() => setAdding(true)} style={[styles.add, { borderColor: t.line }]}>
          <Ionicons name="add" size={18} color={t.accent} />
          <Text style={{ color: t.accent, fontWeight: "700" }}>Add a past charge</Text>
        </Pressable>
      )}

      <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600" }}>History</Text>
      {sessions.filter((s) => s.endedAt).length === 0 && (
        <Text style={{ color: t.muted }}>No charges yet. Tap "Start charging" on any charger page, or add one you've done.</Text>
      )}
      {sessions.filter((s) => s.endedAt).map((s) => {
        const mins = Math.round((new Date(s.endedAt!).getTime() - new Date(s.startedAt).getTime()) / 60000);
        return (
          <Pressable key={s.id} onLongPress={() => Alert.alert("Delete this charge?", s.chargerName, [
            { text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteSession(s.id) }])}
            style={[styles.row, { borderBottomColor: t.line }]}>
            <View style={[styles.dot, { backgroundColor: networkById(s.network).color }]}><Ionicons name="flash" size={14} color="#fff" /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: t.text, fontWeight: "600" }} numberOfLines={1}>{s.chargerName}</Text>
              <Text style={{ color: t.muted, fontSize: 12.5 }}>
                {new Date(s.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {mins} min
                {s.startPct != null && s.endPct != null ? ` · ${s.startPct}→${s.endPct}%` : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: t.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{s.cost != null ? rupees(s.cost) : "—"}</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>{s.kWh != null ? `${s.kWh} kWh` : ""}</Text>
            </View>
          </Pressable>
        );
      })}
      <Text style={{ color: t.muted, fontSize: 12.5 }}>Your log is saved on this phone only. Press and hold a charge to delete it.</Text>
    </ScrollView>
  );
}

function ActiveCard({ s }: { s: Session }) {
  const t = useTheme();
  const [now, setNow] = useState(Date.now());
  const [kWh, setKWh] = useState("");
  const [cost, setCost] = useState("");
  const [endPct, setEndPct] = useState("");
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const secs = Math.max(0, Math.floor((now - new Date(s.startedAt).getTime()) / 1000));
  const hh = Math.floor(secs / 3600), mm = Math.floor((secs % 3600) / 60), ss = secs % 60;
  const stop = () => finishSession(s.id, {
    kWh: parseFloat(kWh) || null, cost: parseFloat(cost) || null, endPct: parseInt(endPct, 10) || null,
  });
  return (
    <View style={[styles.active, { backgroundColor: "#14202B" }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={styles.pulse} />
        <Text style={{ color: "#A3ADB6", fontSize: 13, fontWeight: "600" }}>CHARGING NOW</Text>
      </View>
      <Text style={{ color: "#fff", fontSize: 40, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
        {hh > 0 ? `${hh}:` : ""}{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
      </Text>
      <Text style={{ color: "#D8DDE2" }} numberOfLines={1}>{s.chargerName}</Text>
      <Text style={{ color: "#A3ADB6", fontSize: 12.5 }}>When you finish, add what the charger's app showed:</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Small value={kWh} onChange={setKWh} placeholder="kWh" />
        <Small value={cost} onChange={setCost} placeholder="₹ paid" />
        <Small value={endPct} onChange={setEndPct} placeholder="Battery %" />
      </View>
      <Pressable onPress={stop} style={[styles.stop, { backgroundColor: "#FFD60A" }]}>
        <Text style={{ color: "#14202B", fontWeight: "800" }}>Stop and save</Text>
      </Pressable>
    </View>
  );
}

function ManualEntry({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const [name, setName] = useState("");
  const [kWh, setKWh] = useState("");
  const [cost, setCost] = useState("");
  const [mins, setMins] = useState("");
  const save = () => {
    if (!name.trim()) return Alert.alert("Where did you charge?", "Add the charger or place name.");
    const end = new Date();
    const start = new Date(end.getTime() - (parseFloat(mins) || 45) * 60000);
    addPastSession({
      chargerId: null, chargerName: name.trim(), network: "other", startedAt: start.toISOString(), endedAt: end.toISOString(),
      kWh: parseFloat(kWh) || null, cost: parseFloat(cost) || null, startPct: null, endPct: null,
    });
    onDone();
  };
  const input = [styles.input, { color: t.text, borderColor: t.line, backgroundColor: t.surface }];
  return (
    <View style={{ gap: 8 }}>
      <TextInput value={name} onChangeText={setName} placeholder="Where: Home, Statiq Kompally…" placeholderTextColor={t.faint} style={input} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput value={kWh} onChangeText={setKWh} placeholder="kWh" keyboardType="decimal-pad" placeholderTextColor={t.faint} style={[input, { flex: 1 }]} />
        <TextInput value={cost} onChangeText={setCost} placeholder="₹ paid" keyboardType="decimal-pad" placeholderTextColor={t.faint} style={[input, { flex: 1 }]} />
        <TextInput value={mins} onChangeText={setMins} placeholder="Minutes" keyboardType="number-pad" placeholderTextColor={t.faint} style={[input, { flex: 1 }]} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable onPress={save} style={[styles.stop, { flex: 1, backgroundColor: t.accent }]}><Text style={{ color: t.bg, fontWeight: "800" }}>Save</Text></Pressable>
        <Pressable onPress={onDone} style={[styles.stop, { flex: 1, backgroundColor: t.surface }]}><Text style={{ color: t.text, fontWeight: "700" }}>Cancel</Text></Pressable>
      </View>
    </View>
  );
}

function Small({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder: string }) {
  return (
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#6E7882" keyboardType="decimal-pad"
      style={{ flex: 1, height: 44, borderRadius: 10, backgroundColor: "#1E2A35", color: "#fff", paddingHorizontal: 10, fontSize: 15 }} />
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, padding: 12, borderRadius: 12 },
  link: { flexDirection: "row", gap: 10, alignItems: "center", padding: 14, borderRadius: 12 },
  add: { height: 48, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  active: { borderRadius: 18, padding: 16, gap: 8 },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#34C759" },
  stop: { height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
});
