import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";
import {
  CATALOG, PLUG_LABEL, addVehicle, removeVehicle, setActiveVehicle, updateVehicle, useGarage, vehicleName,
  type Model, type MyVehicle,
} from "../lib/vehicles";

/** My vehicles: add an EV from the list, pick the one you're driving, correct its battery and range. */
export default function Garage() {
  const t = useTheme();
  const { vehicles, active } = useGarage();
  const [adding, setAdding] = useState(vehicles.length === 0);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"car" | "two">("car");
  const [editing, setEditing] = useState<string | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return CATALOG
      .filter((m) => (kind === "car" ? m.kind === "car" : m.kind !== "car"))
      .filter((m) => !s || vehicleName(m).toLowerCase().includes(s));
  }, [q, kind]);

  const pick = (m: Model) => {
    addVehicle(m);
    setAdding(false);
    setQ("");
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "My vehicles" }} />

      {vehicles.map((v) => (
        <VehicleCard key={v.key} v={v} active={active?.key === v.key} editing={editing === v.key}
          onPick={() => setActiveVehicle(v.key)}
          onEdit={() => setEditing(editing === v.key ? null : v.key)}
          onRemove={() => { removeVehicle(v.key); setEditing(null); }} />
      ))}

      {!adding ? (
        <Pressable onPress={() => setAdding(true)} style={[styles.add, { borderColor: t.line }]} accessibilityRole="button">
          <Ionicons name="add" size={20} color={t.accent} />
          <Text style={{ color: t.accent, fontWeight: "700" }}>Add a vehicle</Text>
        </Pressable>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{vehicles.length ? "Add a vehicle" : "What do you drive?"}</Text>
          <Text style={{ color: t.muted }}>We'll show chargers that fit it and how long each one takes.</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["car", "two"] as const).map((k) => (
              <Pressable key={k} onPress={() => setKind(k)} accessibilityRole="button" accessibilityState={{ selected: kind === k }}
                style={[styles.seg, { borderColor: kind === k ? t.accent : t.line, backgroundColor: kind === k ? t.accentSoft : t.bg }]}>
                <Ionicons name={k === "car" ? "car-sport" : "bicycle"} size={16} color={kind === k ? t.accent : t.muted} />
                <Text style={{ color: kind === k ? t.accent : t.text, fontWeight: "700" }}>{k === "car" ? "Car" : "Two-wheeler"}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={q} onChangeText={setQ} placeholder="Search: Nexon, Atto 3, Ather…" placeholderTextColor={t.faint}
            style={[styles.input, { color: t.text, borderColor: t.line, backgroundColor: t.surface }]} />
          <View style={{ borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, overflow: "hidden" }}>
            {list.map((m, i) => (
              <Pressable key={m.id} onPress={() => pick(m)}
                style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "700" }}>{vehicleName(m)}</Text>
                  <Text style={{ color: t.muted, fontSize: 12.5 }}>
                    {m.batteryKWh} kWh · about {m.rangeKm} km · {m.maxDcKW ? `DC up to ${m.maxDcKW} kW` : "AC only"}
                  </Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={t.accent} />
              </Pressable>
            ))}
            {list.length === 0 && <Text style={{ color: t.muted, padding: 14 }}>Not listed? Pick the closest one, then edit its battery and range.</Text>}
          </View>
          {vehicles.length > 0 && (
            <Pressable onPress={() => setAdding(false)} style={{ alignSelf: "center", padding: 10 }}>
              <Text style={{ color: t.muted }}>Cancel</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={{ color: t.muted, fontSize: 12.5, lineHeight: 18 }}>
        Battery and range are approximate figures for each model. Edit them to match your car. Your vehicles are saved on this phone only.
      </Text>
      {vehicles.length > 0 && (
        <Pressable onPress={() => router.back()} style={[styles.done, { backgroundColor: t.accent }]}>
          <Text style={{ color: t.bg, fontWeight: "800" }}>Done</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function VehicleCard({ v, active, editing, onPick, onEdit, onRemove }: {
  v: MyVehicle; active: boolean; editing: boolean; onPick: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const t = useTheme();
  const [battery, setBattery] = useState(String(v.batteryKWh));
  const [range, setRange] = useState(String(v.rangeKm));
  const saveEdits = () => {
    const b = parseFloat(battery), r = parseFloat(range);
    updateVehicle(v.key, { batteryKWh: b > 0 ? b : v.batteryKWh, rangeKm: r > 0 ? r : v.rangeKm });
    onEdit();
  };
  return (
    <View style={[styles.card, { borderColor: active ? t.accent : t.line, backgroundColor: t.surface }]}>
      <Pressable onPress={onPick} style={{ flexDirection: "row", gap: 12, alignItems: "center" }} accessibilityRole="radio" accessibilityState={{ selected: active }}>
        <View style={[styles.icon, { backgroundColor: active ? t.accent : t.accentSoft }]}>
          <Ionicons name={v.kind === "car" ? "car-sport" : "bicycle"} size={22} color={active ? t.bg : t.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>{vehicleName(v)}</Text>
          <Text style={{ color: t.muted, fontSize: 12.5 }}>
            {v.batteryKWh} kWh · {v.rangeKm} km · {v.plugs.map((p) => PLUG_LABEL[p]).join(", ")}
          </Text>
        </View>
        {active ? <Text style={{ color: t.accent, fontWeight: "700", fontSize: 12.5 }}>Driving</Text> : <Text style={{ color: t.muted, fontSize: 12.5 }}>Tap to use</Text>}
      </Pressable>
      {editing ? (
        <View style={{ gap: 8, marginTop: 10 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Field label="Usable battery (kWh)" value={battery} onChange={setBattery} />
            <Field label="Real range (km)" value={range} onChange={setRange} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={saveEdits} style={[styles.small, { backgroundColor: t.accent }]}><Text style={{ color: t.bg, fontWeight: "700" }}>Save</Text></Pressable>
            <Pressable onPress={onRemove} style={[styles.small, { backgroundColor: t.badSoft }]}><Text style={{ color: t.bad, fontWeight: "700" }}>Remove</Text></Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={onEdit} style={{ alignSelf: "flex-start", paddingTop: 8 }} hitSlop={8}>
          <Text style={{ color: t.accent, fontSize: 13, fontWeight: "600" }}>Edit battery and range</Text>
        </Pressable>
      )}
    </View>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad"
        style={[styles.input, { color: t.text, borderColor: t.line, backgroundColor: t.bg }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  add: { height: 52, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  seg: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  card: { borderRadius: 16, borderWidth: 1.5, padding: 14 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  small: { flex: 1, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  done: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
