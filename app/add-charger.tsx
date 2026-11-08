import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import MapView, { type Region } from "react-native-maps";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { NETWORKS, OTHER } from "../lib/networks";
import { addCommunityCharger, chargersNear } from "../lib/chargers";
import type { Speed } from "../lib/types";
import { MAP_PROVIDER, zappdStyle } from "../lib/maps";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";

const PLUGS = [
  { key: "CCS2", label: "CCS2" },
  { key: "Type 2", label: "Type 2" },
  { key: "Bharat DC-001", label: "Bharat DC" },
  { key: "Bharat AC-001", label: "Bharat AC" },
  { key: "CHAdeMO", label: "CHAdeMO" },
  { key: "GB/T", label: "GB/T" },
  { key: "15A socket", label: "15A socket" },
  { key: "LECCS (Ather)", label: "Ather" },
];
const POWERS = [3.3, 7.4, 15, 30, 60, 120];

/** Add a charger that's missing from the map: drag the map under the pin, then a few taps. */
export default function AddCharger() {
  const t = useTheme();
  const scheme = useColorScheme();
  const { session } = useAuth();
  const p = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const start = { latitude: Number(p.lat) || 17.385, longitude: Number(p.lng) || 78.4867 };
  const [spot, setSpot] = useState(start);
  const [name, setName] = useState("");
  const [network, setNetwork] = useState<string>("other");
  const [speed, setSpeed] = useState<Speed>("dc");
  const [power, setPower] = useState<number | null>(null);
  const [plugs, setPlugs] = useState<string[]>(["CCS2"]);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const networks = useMemo(() => [...NETWORKS.filter((n) => !n.oem), ...NETWORKS.filter((n) => n.oem), OTHER], []);
  const toggle = (k: string) => setPlugs((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]));
  const ready = name.trim().length >= 3 && plugs.length > 0;

  const save = async () => {
    if (!session) { router.push("/login"); return; }
    if (!ready) { Alert.alert("Almost there", "Add a name and at least one plug type."); return; }
    setBusy(true);
    try {
      const dupes = await chargersNear(spot.latitude, spot.longitude);
      if (dupes.length) {
        const go = await new Promise<boolean>((res) =>
          Alert.alert("Already on the map?", `"${dupes[0].name}" is listed right here. Add yours anyway?`, [
            { text: "Open that one", onPress: () => res(false) },
            { text: "Add anyway", onPress: () => res(true) },
          ]));
        if (!go) { setBusy(false); router.replace(`/charger/${encodeURIComponent(dupes[0].id)}`); return; }
      }
      const c = await addCommunityCharger(
        { name, network, lat: spot.latitude, lng: spot.longitude, address, speed, powerKW: power, connectors: plugs },
        session.user.id,
      );
      router.replace(`/charger/${encodeURIComponent(c.id)}`);
    } catch (e: any) {
      Alert.alert("Couldn't add it", e?.message ?? "Please try again.");
      setBusy(false);
    }
  };

  const input = [s.input, { color: t.text, backgroundColor: t.surface }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "Add a charger" }} />
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <View style={s.mapBox}>
          <MapView provider={MAP_PROVIDER} customMapStyle={zappdStyle(scheme)}
            style={StyleSheet.absoluteFill}
            initialRegion={{ ...start, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
            onRegionChangeComplete={(r: Region) => setSpot({ latitude: r.latitude, longitude: r.longitude })}
            showsUserLocation
            showsPointsOfInterest={false}
          />
          <View pointerEvents="none" style={s.pinWrap}>
            <View style={s.pin}><Ionicons name="flash" size={20} color={LEMON} /></View>
            <View style={s.pinTip} />
          </View>
          <View style={s.hint}><Text style={s.hintText}>Move the map so the pin sits on the charger</Text></View>
        </View>

        <View style={{ padding: 16, gap: 18 }}>
          <Field label="Name" t={t}>
            <TextInput value={name} onChangeText={setName} placeholder="e.g. Statiq · Gandhi Nagar petrol pump"
              placeholderTextColor={t.faint} style={input} maxLength={60} />
          </Field>

          <Field label="Network" t={t}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {networks.map((n) => (
                <Pill key={n.id} label={n.short} on={network === n.id} dot={n.color} onPress={() => setNetwork(n.id)} t={t} />
              ))}
            </ScrollView>
          </Field>

          <Field label="Speed" t={t}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pill label="⚡ DC fast" on={speed === "dc"} onPress={() => { setSpeed("dc"); setPlugs((v) => (v.length ? v : ["CCS2"])); }} t={t} big />
              <Pill label="AC" on={speed === "ac"} onPress={() => setSpeed("ac")} t={t} big />
              <Pill label="Both" on={speed === "dcac"} onPress={() => setSpeed("dcac")} t={t} big />
            </View>
          </Field>

          <Field label="Plugs" t={t}>
            <View style={s.wrap}>
              {PLUGS.map((x) => <Pill key={x.key} label={x.label} on={plugs.includes(x.key)} onPress={() => toggle(x.key)} t={t} />)}
            </View>
          </Field>

          <Field label="Power (optional)" t={t}>
            <View style={s.wrap}>
              {POWERS.map((kw) => (
                <Pill key={kw} label={kw >= 120 ? "120+ kW" : `${kw} kW`} on={power === kw} onPress={() => setPower(power === kw ? null : kw)} t={t} />
              ))}
            </View>
          </Field>

          <Field label="Landmark or address (optional)" t={t}>
            <TextInput value={address} onChangeText={setAddress} placeholder="Next to the HP pump, Bypass Road"
              placeholderTextColor={t.faint} style={input} maxLength={120}
              onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 250)} />
          </Field>

          <Text style={{ color: t.muted, fontSize: 12.5, lineHeight: 18 }}>
            Public chargers only. It shows up for everyone as "Added by drivers" until others zing it there.
          </Text>
        </View>
      </ScrollView>

      <View style={[s.footer, { backgroundColor: t.bg, borderTopColor: t.line }]}>
        <Pressable onPress={save} disabled={busy} style={({ pressed }) => [s.save, { opacity: ready ? 1 : 0.5, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
          {busy ? <ActivityIndicator color={LEMON} /> : (
            <>
              <Ionicons name="add-circle" size={20} color={LEMON} />
              <Text style={s.saveText}>{session ? "Add to the map" : "Sign in to add"}</Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children, t }: { label: string; children: React.ReactNode; t: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: t.text, fontWeight: "800", fontSize: 14 }}>{label}</Text>
      {children}
    </View>
  );
}

function Pill({ label, on, onPress, dot, big, t }: {
  label: string; on: boolean; onPress: () => void; dot?: string; big?: boolean; t: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable onPress={onPress} style={[s.pill, big && { flex: 1, justifyContent: "center", paddingVertical: 12 },
      { backgroundColor: on ? INK : t.surface }]}>
      {dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />}
      <Text style={{ color: on ? LEMON : t.text, fontWeight: "700", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  mapBox: { height: 240, overflow: "hidden" },
  pinWrap: { position: "absolute", left: "50%", top: "50%", marginLeft: -22, marginTop: -52, alignItems: "center" },
  pin: { width: 44, height: 44, borderRadius: 22, backgroundColor: INK, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#fff" },
  pinTip: { width: 4, height: 10, backgroundColor: INK, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  hint: { position: "absolute", bottom: 10, alignSelf: "center", backgroundColor: "rgba(26,26,26,0.85)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  hintText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 30, borderTopWidth: StyleSheet.hairlineWidth },
  save: { backgroundColor: INK, height: 54, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: LEMON, fontSize: 17, fontWeight: "800" },
});
