import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import MapView, { type Region } from "react-native-maps";
import * as Location from "expo-location";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "../components/SFIcon";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { EVENT_KINDS, createEvent, type EventKind } from "../lib/events";
import { MAP_PROVIDER, zappdStyle } from "../lib/maps";
import { Icon } from "../components/Icon";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";
const TIMES = Array.from({ length: 36 }, (_, i) => 5 * 60 + i * 30); // 5:00 am to 10:30 pm, every 30 minutes
const CAPS = [null, 5, 10, 20, 50];

/** Plan a club event: what, when, where. */
export default function NewEvent() {
  const t = useTheme();
  const scheme = useColorScheme();
  const { session } = useAuth();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const days = useMemo(() => Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; }), []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<EventKind>("meetup");
  const [day, setDay] = useState(() => { const d = new Date(); return d.getDay() === 0 ? 7 : 7 - d.getDay(); }); // next Sunday
  const [minutes, setMinutes] = useState(7 * 60);
  const [place, setPlace] = useState("");
  const [destination, setDestination] = useState("");
  const [cap, setCap] = useState<number | null>(null);
  const [spot, setSpot] = useState<{ latitude: number; longitude: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Location.getLastKnownPositionAsync().then((p) => setSpot(p ? { latitude: p.coords.latitude, longitude: p.coords.longitude } : { latitude: 17.385, longitude: 78.4867 }))
      .catch(() => setSpot({ latitude: 17.385, longitude: 78.4867 }));
  }, []);

  const startsAt = useMemo(() => { const d = new Date(days[day]); d.setMinutes(minutes); return d; }, [days, day, minutes]);
  const past = startsAt.getTime() < Date.now();
  const ok = title.trim().length >= 4 && !!spot && !past;

  const save = async () => {
    if (!session) return router.push("/login");
    if (!ok) return Alert.alert("Almost there", past ? "Pick a time in the future." : "Add a title of at least 4 characters.");
    setBusy(true);
    try {
      const id = await createEvent(clubId!, session.user.id, {
        title, description, kind, starts_at: startsAt, place_name: place, lat: spot!.latitude, lng: spot!.longitude, destination, max_people: cap,
      });
      router.replace(`/event/${id}`);
    } catch (e: any) { Alert.alert("Couldn't create it", e.message); setBusy(false); }
  };

  const fmtTime = (m: number) => new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const input = [s.input, { backgroundColor: t.surface, color: t.text }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "Plan an event" }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: 16, gap: 16 }}>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {EVENT_KINDS.map((k) => (
              <Pressable key={k.key} onPress={() => setKind(k.key)} style={[s.chip, { backgroundColor: kind === k.key ? CTA : t.surface }]}>
                <Icon name={k.icon} size={16} color={kind === k.key ? ON_CTA : t.text} />
                <Text style={{ color: kind === k.key ? ON_CTA : t.text, fontWeight: "700" }}>{k.label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={title} onChangeText={setTitle} placeholder={kind === "drive" ? "Sunrise drive to Ananthagiri Hills" : "Sunday chai at Statiq Banjara Hills"}
            placeholderTextColor={t.faint} style={[input, { fontSize: 18, fontWeight: "700" }]} maxLength={80} />
          <TextInput value={description} onChangeText={setDescription} multiline placeholder="Plan, charging stops, what to bring…"
            placeholderTextColor={t.faint} style={[input, { minHeight: 90, textAlignVertical: "top" }]} maxLength={2000} />

          <Text style={[s.label, { color: t.text }]}>Day</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d, i) => (
              <Pressable key={i} onPress={() => setDay(i)} style={[s.day, { backgroundColor: day === i ? CTA : t.surface }]}>
                <Text style={{ color: day === i ? ON_CTA : t.muted, fontSize: 11, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{i === 0 ? "TODAY" : d.toLocaleDateString([], { weekday: "short" }).toUpperCase()}</Text>
                <Text style={{ color: day === i ? ON_CTA : t.text, fontSize: 20, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.6 }}>{d.getDate()}</Text>
                <Text style={{ color: day === i ? ON_CTA : t.muted, fontSize: 11 }}>{d.toLocaleDateString([], { month: "short" })}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[s.label, { color: t.text }]}>Time</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {TIMES.map((m) => (
              <Pressable key={m} onPress={() => setMinutes(m)} style={[s.chip, { backgroundColor: minutes === m ? CTA : t.surface }]}>
                <Text style={{ color: minutes === m ? ON_CTA : t.text, fontWeight: "700" }}>{fmtTime(m)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {past && <Text style={{ color: t.bad, fontWeight: "600" }}>That time has already passed today.</Text>}

          <Text style={[s.label, { color: t.text }]}>Meeting point</Text>
        </View>
        <View style={{ height: 220 }}>
          {spot ? (
            <>
              <MapView provider={MAP_PROVIDER} customMapStyle={zappdStyle(scheme)} style={StyleSheet.absoluteFill} initialRegion={{ ...spot, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
                onRegionChangeComplete={(r: Region) => setSpot({ latitude: r.latitude, longitude: r.longitude })} showsUserLocation showsPointsOfInterest={false} />
              <View pointerEvents="none" style={s.pinWrap}>
                <View style={s.pin}><Icon name={EVENT_KINDS.find((k) => k.key === kind)!.icon} size={20} color="#1A1A1A" /></View>
                <View style={s.pinTip} />
              </View>
              <View style={s.hint}><Text style={s.hintText}>Move the map to set the meeting point</Text></View>
            </>
          ) : <ActivityIndicator style={{ flex: 1 }} />}
        </View>
        <View style={{ padding: 16, gap: 16 }}>
          <TextInput value={place} onChangeText={setPlace} placeholder="Place name, e.g. Statiq, KBR Park gate 3" placeholderTextColor={t.faint} style={input} maxLength={120} />
          {kind === "drive" && (
            <TextInput value={destination} onChangeText={setDestination} placeholder="Destination, e.g. Ananthagiri Hills" placeholderTextColor={t.faint} style={input} maxLength={120} />
          )}
          <Text style={[s.label, { color: t.text }]}>Spots</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {CAPS.map((c) => (
              <Pressable key={String(c)} onPress={() => setCap(c)} style={[s.chip, { backgroundColor: cap === c ? CTA : t.surface }]}>
                <Text style={{ color: cap === c ? ON_CTA : t.text, fontWeight: "700" }}>{c ? `${c} people` : "No limit"}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={[s.footer, { backgroundColor: t.bg, borderTopColor: t.line }]}>
        <Text style={{ color: t.muted, textAlign: "center", marginBottom: 8, fontWeight: "600" }}>
          {startsAt.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })} · {fmtTime(minutes)}
        </Text>
        <Pressable onPress={save} disabled={busy} style={[s.save, { opacity: ok ? 1 : 0.5 }]}>
          {busy ? <ActivityIndicator color={ON_CTA} /> : <Text style={s.saveText}>Create event</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  label: { fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 14 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  day: { width: 62, alignItems: "center", paddingVertical: 8, borderRadius: 14 },
  pinWrap: { position: "absolute", left: "50%", top: "50%", marginLeft: -22, marginTop: -52, alignItems: "center" },
  pin: { width: 44, height: 44, borderRadius: 22, backgroundColor: LEMON, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: INK },
  pinTip: { width: 4, height: 10, backgroundColor: INK },
  hint: { position: "absolute", bottom: 10, alignSelf: "center", backgroundColor: "rgba(26,26,26,0.85)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  hintText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 30, borderTopWidth: StyleSheet.hairlineWidth },
  save: { backgroundColor: CTA, height: 54, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  saveText: { color: ON_CTA, fontSize: 17, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
});
