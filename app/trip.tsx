import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Stack, router } from "expo-router";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";
import { searchPlaces, type PlaceHit } from "../lib/places";
import { planTrip, mapsUrl, type Plan } from "../lib/trip";
import { fmtMinutes, useGarage, vehicleName } from "../lib/vehicles";
import { networkById } from "../lib/networks";

type Place = { label: string; lat: number; lng: number };

/** Plan a trip: where to, battery now, and the charging stops on the way. */
export default function Trip() {
  const t = useTheme();
  const { active: v } = useGarage();
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [battery, setBattery] = useState(80);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const map = useRef<MapView | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setFrom({ label: "My location", lat: p.coords.latitude, lng: p.coords.longitude });
    })();
  }, []);

  useEffect(() => {
    if (!query.trim() || query === to?.label) { setHits([]); return; }
    let live = true;
    const id = setTimeout(async () => {
      const res = await searchPlaces(query, from ?? undefined);
      if (live) setHits(res.slice(0, 6));
    }, 300);
    return () => { live = false; clearTimeout(id); };
  }, [query]);

  const go = async (dest = to) => {
    if (!v) return router.push("/garage");
    if (!from) return setError("Turn on location so we know where you're starting.");
    if (!dest) return setError("Choose where you're going.");
    setBusy(true); setError(null); setPlan(null);
    try {
      const p = await planTrip({ from, to: dest, vehicle: v, startPct: battery });
      setPlan(p);
      setTimeout(() => map.current?.fitToCoordinates(p.route.coords, { edgePadding: { top: 40, bottom: 40, left: 40, right: 40 }, animated: true }), 300);
    } catch (e: any) {
      setError(e.message ?? "Couldn't plan this trip. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const pickDest = (h: PlaceHit) => {
    Keyboard.dismiss();
    const p = { label: h.title, lat: h.lat, lng: h.lng };
    setTo(p); setQuery(h.title); setHits([]);
    go(p);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Plan a trip" }} />
      <View style={{ padding: 16, gap: 12 }}>
        <Pressable onPress={() => router.push("/garage")} style={[styles.vehicle, { backgroundColor: t.surface }]}>
          <Ionicons name={v?.kind === "car" || !v ? "car-sport" : "bicycle"} size={20} color={t.accent} />
          <Text style={{ color: t.text, flex: 1, fontWeight: "600" }}>
            {v ? `${vehicleName(v)} · ${v.rangeKm} km range` : "Add your EV to plan a trip"}
          </Text>
          <Text style={{ color: t.accent, fontWeight: "600" }}>{v ? "Change" : "Add"}</Text>
        </Pressable>

        <View style={[styles.box, { borderColor: t.line }]}>
          <View style={styles.line}>
            <View style={[styles.pt, { backgroundColor: t.accent }]} />
            <Text style={{ color: t.text, flex: 1 }}>{from ? from.label : "Finding your location…"}</Text>
          </View>
          <View style={[styles.line, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
            <Ionicons name="location" size={14} color={t.bad} />
            <TextInput value={query} onChangeText={(s) => { setQuery(s); if (to && s !== to.label) setTo(null); }}
              placeholder="Where to? Vijayawada, Bengaluru…" placeholderTextColor={t.faint}
              style={{ flex: 1, color: t.text, fontSize: 16, height: 44 }} returnKeyType="search" />
          </View>
        </View>
        {hits.length > 0 && (
          <View style={[styles.box, { borderColor: t.line }]}>
            {hits.map((h, i) => (
              <Pressable key={h.id} onPress={() => pickDest(h)} style={[styles.hit, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
                <Text style={{ color: t.text, fontWeight: "600" }} numberOfLines={1}>{h.title}</Text>
                <Text style={{ color: t.muted, fontSize: 12.5 }} numberOfLines={1}>{h.subtitle}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ gap: 6 }}>
          <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600" }}>Battery now</Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Pressable onPress={() => setBattery((b) => Math.max(10, b - 5))} style={[styles.step, { backgroundColor: t.surface }]} accessibilityLabel="Less battery">
              <Ionicons name="remove" size={20} color={t.text} />
            </Pressable>
            <View style={[styles.track, { backgroundColor: t.surface }]}>
              <View style={{ width: `${battery}%`, height: "100%", borderRadius: 10, backgroundColor: battery > 30 ? t.good : t.bad }} />
              <Text style={styles.pct}>{battery}%</Text>
            </View>
            <Pressable onPress={() => setBattery((b) => Math.min(100, b + 5))} style={[styles.step, { backgroundColor: t.surface }]} accessibilityLabel="More battery">
              <Ionicons name="add" size={20} color={t.text} />
            </Pressable>
          </View>
        </View>

        <Pressable onPress={() => go()} disabled={busy} style={[styles.cta, { backgroundColor: t.accent, opacity: busy ? 0.7 : 1 }]}>
          {busy ? <ActivityIndicator color={t.bg} /> : <Text style={{ color: t.bg, fontWeight: "800", fontSize: 16 }}>Plan my charging stops</Text>}
        </Pressable>
        {error && <Text style={{ color: t.bad }}>{error}</Text>}
      </View>

      {plan && (
        <View style={{ gap: 12 }}>
          <MapView ref={map} style={{ height: 300 }} mapType="hybrid"
            initialRegion={{ latitude: plan.route.coords[0].latitude, longitude: plan.route.coords[0].longitude, latitudeDelta: 2, longitudeDelta: 2 }}>
            <Polyline coordinates={plan.route.coords} strokeColor="#FFD60A" strokeWidth={5} />
            <Marker coordinate={plan.route.coords[0]} title="Start" pinColor="green" />
            <Marker coordinate={plan.route.coords[plan.route.coords.length - 1]} title={to?.label ?? "Destination"} />
            {plan.stops.map((s, i) => (
              <Marker key={s.charger.id} coordinate={{ latitude: s.charger.lat, longitude: s.charger.lng }}
                onCalloutPress={() => router.push(`/charger/${encodeURIComponent(s.charger.id)}`)}
                title={`Stop ${i + 1}: ${s.charger.name}`} description={`${s.arrivePct}% → ${s.leavePct}% · ${fmtMinutes(s.chargeMin)}`}>
                <View style={[styles.stopPin, { backgroundColor: networkById(s.charger.network).color }]}>
                  <Text style={{ color: "#fff", fontWeight: "900" }}>{i + 1}</Text>
                </View>
              </Marker>
            ))}
          </MapView>

          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[
                [`${Math.round(plan.route.km)} km`, "Distance"],
                [fmtMinutes(Math.round(plan.route.minutes + plan.chargeMin)), "With charging"],
                [`${plan.stops.length}`, plan.stops.length === 1 ? "Stop" : "Stops"],
              ].map(([a, b]) => (
                <View key={b} style={[styles.stat, { backgroundColor: t.surface }]}>
                  <Text style={{ color: t.text, fontWeight: "800", fontSize: 18, fontVariant: ["tabular-nums"] }}>{a}</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{b}</Text>
                </View>
              ))}
            </View>

            {!plan.ok && <Text style={{ color: t.bad }}>{plan.problem}</Text>}

            <Leg icon="radio-button-on" title={from?.label ?? "Start"} sub={`Leave with ${battery}%`} />
            {plan.stops.map((s, i) => (
              <Pressable key={s.charger.id} onPress={() => router.push(`/charger/${encodeURIComponent(s.charger.id)}`)}>
                <Leg icon="flash" color={networkById(s.charger.network).color} title={`Stop ${i + 1} · ${s.charger.name}`}
                  sub={`At km ${Math.round(s.atKm)}${s.detourKm > 0.5 ? ` · ${s.detourKm.toFixed(1)} km off the road` : ""} · ${networkById(s.charger.network).short}`}
                  detail={`Arrive ${s.arrivePct}%, charge to ${s.leavePct}% · about ${fmtMinutes(s.chargeMin)} at ${Math.round(s.powerKW)} kW`} />
              </Pressable>
            ))}
            {plan.ok && <Leg icon="location" color={t.bad} title={to?.label ?? "Destination"} sub={`Arrive with about ${Math.max(0, plan.arrivePct)}%`} />}

            <Pressable onPress={() => from && to && Linking.openURL(mapsUrl(from, to, plan.stops))} style={[styles.cta, { backgroundColor: "#1A73E8" }]}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Start in Google Maps</Text>
            </Pressable>
            <Text style={{ color: t.muted, fontSize: 12.5, lineHeight: 18 }}>
              Estimates assume highway driving and keep at least 15% in reserve. Check each stop's latest zaps before you go; broken chargers are skipped automatically.
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function Leg({ icon, title, sub, detail, color }: { icon: any; title: string; sub: string; detail?: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 8 }}>
      <View style={{ width: 30, alignItems: "center" }}><Ionicons name={icon} size={20} color={color ?? t.accent} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontWeight: "700" }} numberOfLines={2}>{title}</Text>
        <Text style={{ color: t.muted, fontSize: 12.5 }}>{sub}</Text>
        {detail && <Text style={{ color: t.text, fontSize: 13 }}>{detail}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  vehicle: { flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderRadius: 12 },
  box: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  line: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, minHeight: 48 },
  pt: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 2 },
  hit: { padding: 12, gap: 2 },
  step: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  track: { flex: 1, height: 44, borderRadius: 12, overflow: "hidden", justifyContent: "center", padding: 3 },
  pct: { position: "absolute", alignSelf: "center", color: "#fff", fontWeight: "800", textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 4 },
  cta: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stat: { flex: 1, padding: 12, borderRadius: 12 },
  stopPin: { width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
});
