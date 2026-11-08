import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image as RNImage, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import MapView, { Circle, Marker, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "../components/SFIcon";
import { Glass } from "../components/Glass";
import SnapViewer from "../components/SnapViewer";
import { fetchConnectionMap, fetchFeed } from "../lib/community";
import { snapUrl } from "../lib/supabase";
import { distanceM, fmtDistance, timeAgo } from "../lib/geo";
import { MAP_PROVIDER, USE_GOOGLE } from "../lib/maps";
import { NIGHT_STYLE } from "../lib/mapStyle";
import { useAuth } from "../lib/auth";
import { tapHaptic, tickHaptic } from "../lib/motion";
import type { Checkin } from "../lib/types";

const LEMON = "#FCE38A";
const HOT = "#FF6A3D";
const CREW = "#FF4F8B";
type Z = Checkin & { lat: number; lng: number };
type Spot = { key: string; lat: number; lng: number; items: Z[]; people: Z[]; crew: boolean; fresh: boolean; title: string };

const where = (z: Checkin): { lat: number; lng: number } | null => {
  const c: any = (z as any).chargers;
  if (c?.lat != null) return { lat: c.lat, lng: c.lng };
  if (z.place_lat != null && z.place_lng != null) return { lat: z.place_lat, lng: z.place_lng };
  return null;
};
const firstName = (z: Checkin) => (z.profiles?.display_name ?? "Driver").split(" ")[0];

/**
 * Zing Map: where the zings are right now. Friends show as their own faces, busy places glow
 * warmer the more zings they have, and tapping anything plays its zings. Last 24 hours only.
 */
export default function ZingMap() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { profile, session } = useAuth();
  const mapRef = useRef<MapView>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [zings, setZings] = useState<Z[] | null>(null);
  const [crewIds, setCrewIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "crew">("all");
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<{ list: Checkin[]; start: number } | null>(null);
  const [track, setTrack] = useState(true);

  const load = useCallback(async (lat: number, lng: number) => {
    const [feed, links] = await Promise.all([
      fetchFeed(lat, lng, 40).catch(() => [] as Checkin[]),
      session ? fetchConnectionMap().catch(() => ({})) : Promise.resolve({}),
    ]);
    setCrewIds(new Set(Object.entries(links as Record<string, string>).filter(([, v]) => v === "connected").map(([k]) => k)));
    setZings(feed.map((z) => { const p = where(z); return p ? { ...z, ...p } : null; }).filter(Boolean) as Z[]);
    // Let photos load into the markers, then freeze them for smooth panning.
    setTrack(true); setTimeout(() => setTrack(false), 2500);
  }, [session]);

  useEffect(() => {
    (async () => {
      let pos: { lat: number; lng: number } = { lat: 17.385, lng: 78.4867 };
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.granted) {
          const p = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
          if (p) pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        }
      } catch {}
      setMe(pos);
      load(pos.lat, pos.lng);
    })();
  }, [load]);

  // Group zings into spots that merge as you zoom out, so the map never gets cluttered.
  const spots = useMemo<Spot[]>(() => {
    if (!zings) return [];
    const list = filter === "crew" ? zings.filter((z) => crewIds.has(z.user_id) || z.user_id === session?.user.id) : zings;
    const cell = Math.max(0.0015, (region?.latitudeDelta ?? 0.12) / 9);
    const groups = new Map<string, Z[]>();
    for (const z of list) {
      const k = `${Math.round(z.lat / cell)}:${Math.round(z.lng / cell)}`;
      groups.set(k, [...(groups.get(k) ?? []), z]);
    }
    return [...groups.entries()].map(([key, items]) => {
      items.sort((a, b) => b.created_at.localeCompare(a.created_at));
      const people: Z[] = [];
      for (const z of items) if (!people.some((p) => p.user_id === z.user_id)) people.push(z);
      const c: any = (items[0] as any).chargers;
      return {
        key, items, people,
        lat: items.reduce((s, z) => s + z.lat, 0) / items.length,
        lng: items.reduce((s, z) => s + z.lng, 0) / items.length,
        crew: people.some((p) => crewIds.has(p.user_id)),
        fresh: Date.now() - new Date(items[0].created_at).getTime() < 3600e3,
        title: items[0].place_name ?? c?.name ?? "Nearby",
      };
    }).sort((a, b) => b.items.length - a.items.length);
  }, [zings, region?.latitudeDelta, filter, crewIds, session?.user.id]);

  const play = (s: Spot) => {
    tapHaptic();
    setSeen((x) => new Set(x).add(s.key));
    setViewer({ list: s.items, start: 0 });
  };
  const flyTo = (s: Spot) => {
    mapRef.current?.animateToRegion({ latitude: s.lat - 0.004, longitude: s.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 600);
    setTimeout(() => play(s), 650);
  };
  const recenter = () => {
    if (!me) return;
    tickHaptic();
    mapRef.current?.animateToRegion({ latitude: me.lat, longitude: me.lng, latitudeDelta: 0.12, longitudeDelta: 0.12 }, 500);
  };

  const total = spots.reduce((n, s) => n + s.items.length, 0);
  const hot = spots.slice(0, 10);
  const CARD_W = Math.min(220, width * 0.56);

  return (
    <View style={{ flex: 1, backgroundColor: "#0B0E12" }}>
      <Stack.Screen options={{ headerShown: false }} />
      {me && (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={MAP_PROVIDER}
          initialRegion={{ latitude: me.lat, longitude: me.lng, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
          mapType={USE_GOOGLE ? "standard" : "mutedStandard"}
          customMapStyle={USE_GOOGLE ? NIGHT_STYLE : undefined}
          userInterfaceStyle="dark"
          showsPointsOfInterest={false}
          showsBuildings
          showsCompass={false}
          pitchEnabled
          onRegionChangeComplete={setRegion}
        >
          {/* Heat: every spot glows; busy ones glow hotter and wider. */}
          {spots.map((s) => {
            const n = s.items.length;
            const r = 220 * Math.sqrt(n) * Math.max(1, (region?.latitudeDelta ?? 0.12) / 0.12);
            return (
              <React.Fragment key={`h-${s.key}`}>
                <Circle center={{ latitude: s.lat, longitude: s.lng }} radius={r * 1.9} strokeWidth={0} fillColor={n >= 3 ? "rgba(255,106,61,0.10)" : "rgba(252,227,138,0.08)"} />
                <Circle center={{ latitude: s.lat, longitude: s.lng }} radius={r} strokeWidth={0} fillColor={n >= 3 ? "rgba(255,106,61,0.18)" : "rgba(252,227,138,0.14)"} />
              </React.Fragment>
            );
          })}

          {/* Me */}
          <Marker coordinate={{ latitude: me.lat, longitude: me.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} zIndex={5}>
            <View style={st.meWrap}>
              <View style={st.meGlow} />
              <Face name={profile?.display_name ?? "You"} photo={profile?.avatar_path} size={40} ring="#4DA3FF" />
            </View>
          </Marker>

          {spots.map((s) => {
            const lead = s.people[0];
            const isSeen = seen.has(s.key);
            const ring = isSeen ? "rgba(255,255,255,0.35)" : s.crew ? CREW : LEMON;
            const solo = s.people.length === 1 && s.items.length <= 2;
            return (
              <Marker key={`${s.key}-${s.items.length}-${isSeen ? 1 : 0}`} coordinate={{ latitude: s.lat, longitude: s.lng }}
                anchor={{ x: 0.5, y: 0.9 }} tracksViewChanges={track} zIndex={s.crew ? 20 : 10 + Math.min(s.items.length, 9)}
                onPress={() => play(s)} accessibilityLabel={`${s.items.length} zings at ${s.title}`}>
                {solo ? (
                  <View style={{ alignItems: "center" }}>
                    <View>
                      <Face name={lead.profiles?.display_name ?? "?"} photo={lead.profiles?.avatar_path} size={s.crew ? 54 : 46} ring={ring} />
                      {!!lead.photo_path && <RNImage source={{ uri: snapUrl(lead.photo_path) }} style={st.peekThumb} />}
                      {s.fresh && !isSeen && <View style={st.newDot} />}
                    </View>
                    <View style={[st.label, s.crew && { backgroundColor: CREW }]}>
                      <Text style={st.labelText} numberOfLines={1}>{firstName(lead)} · {timeAgo(lead.created_at).replace(" ago", "")}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={{ alignItems: "center" }}>
                    <View style={[st.spot, { borderColor: s.items.length >= 3 && !isSeen ? HOT : ring }]}>
                      {!!s.items[0].photo_path && <RNImage source={{ uri: snapUrl(s.items[0].photo_path) }} style={StyleSheet.absoluteFill} />}
                      <View style={st.spotShade} />
                      <Text style={st.spotCount}>{s.items.length}</Text>
                    </View>
                    <View style={st.faces}>
                      {s.people.slice(0, 3).map((p, i) => (
                        <View key={p.user_id} style={{ marginLeft: i ? -9 : 0 }}>
                          <Face name={p.profiles?.display_name ?? "?"} photo={p.profiles?.avatar_path} size={22} ring={crewIds.has(p.user_id) ? CREW : "#0B0E12"} thin />
                        </View>
                      ))}
                      {s.people.length > 3 && <Text style={st.more}>+{s.people.length - 3}</Text>}
                    </View>
                  </View>
                )}
              </Marker>
            );
          })}
        </MapView>
      )}

      {/* Top: close, title, filter */}
      <View style={[st.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close map">
          <Glass style={st.round} interactive><Ionicons name="chevron-down" size={22} color="#fff" /></Glass>
        </Pressable>
        <Glass style={st.titlePill}>
          <Text style={st.title}>Zing Map</Text>
          <Text style={st.sub}>{zings ? `${total} zing${total === 1 ? "" : "s"} · last 24h` : "Finding zings…"}</Text>
        </Glass>
        <Pressable onPress={() => { tickHaptic(); setFilter((f) => (f === "all" ? "crew" : "all")); }} accessibilityLabel="Filter">
          <Glass style={[st.filter, filter === "crew" && { backgroundColor: CREW }]} interactive>
            <Ionicons name={filter === "crew" ? "people" : "globe"} size={16} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{filter === "crew" ? "Crew" : "Everyone"}</Text>
          </Glass>
        </Pressable>
      </View>

      <Pressable onPress={recenter} style={[st.recenter, { bottom: insets.bottom + (hot.length ? 190 : 30) }]} accessibilityLabel="Back to me">
        <Glass style={st.round} interactive><Ionicons name="locate" size={20} color="#fff" /></Glass>
      </Pressable>

      {/* Bottom: hottest spots right now */}
      {!zings ? (
        <View style={[st.empty, { bottom: insets.bottom + 30 }]}><ActivityIndicator color={LEMON} /></View>
      ) : hot.length === 0 ? (
        <Glass style={[st.empty, { bottom: insets.bottom + 30 }]}>
          <Text style={{ fontSize: 28 }}>🌙</Text>
          <Text style={st.emptyTitle}>{filter === "crew" ? "Your crew is quiet today" : "No zings around you yet"}</Text>
          <Text style={st.emptySub}>Be the first. Your zing lights up this map for everyone nearby.</Text>
          <Pressable onPress={() => router.replace("/(tabs)/feed")} style={st.cta}><Text style={st.ctaText}>Drop a zing</Text></Pressable>
        </Glass>
      ) : (
        <View style={[st.dock, { bottom: insets.bottom + 14 }]}>
          <Text style={st.dockTitle}>🔥 Hot right now</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={CARD_W + 10} decelerationRate="fast"
            contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
            {hot.map((s) => (
              <Pressable key={s.key} onPress={() => flyTo(s)} style={[st.card, { width: CARD_W }]}>
                {!!s.items[0].photo_path && <RNImage source={{ uri: snapUrl(s.items[0].photo_path) }} style={StyleSheet.absoluteFill} />}
                <View style={st.cardShade} />
                <View style={st.cardTop}>
                  <View style={[st.badge, s.items.length >= 3 && { backgroundColor: HOT }]}>
                    <Text style={[st.badgeText, s.items.length >= 3 && { color: "#fff" }]}>⚡ {s.items.length}</Text>
                  </View>
                  {s.crew && <View style={[st.badge, { backgroundColor: CREW }]}><Text style={[st.badgeText, { color: "#fff" }]}>Crew</Text></View>}
                </View>
                <View style={st.cardBottom}>
                  <Text style={st.cardTitle} numberOfLines={1}>{s.title}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ flexDirection: "row" }}>
                      {s.people.slice(0, 3).map((p, i) => (
                        <View key={p.user_id} style={{ marginLeft: i ? -7 : 0 }}>
                          <Face name={p.profiles?.display_name ?? "?"} photo={p.profiles?.avatar_path} size={20} ring="#000" thin />
                        </View>
                      ))}
                    </View>
                    <Text style={st.cardSub} numberOfLines={1}>
                      {me ? fmtDistance(distanceM(me.lat, me.lng, s.lat, s.lng)) : ""} · {timeAgo(s.items[0].created_at)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {viewer && <SnapViewer snaps={viewer.list} start={viewer.start} onClose={() => setViewer(null)} />}
    </View>
  );
}

/** A round face with a coloured story ring. Initials when there's no photo. */
function Face({ name, photo, size, ring, thin }: { name: string; photo?: string | null; size: number; ring: string; thin?: boolean }) {
  const b = thin ? 2 : 3;
  const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <View style={{ width: size + b * 2 + 4, height: size + b * 2 + 4, borderRadius: 999, borderWidth: b, borderColor: ring, padding: 2, backgroundColor: "#0B0E12" }}>
      {photo ? (
        <RNImage source={{ uri: snapUrl(photo) }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#2A3340", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.36 }}>{initials || "?"}</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  top: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  titlePill: { flex: 1, height: 48, borderRadius: 24, justifyContent: "center", paddingHorizontal: 16, backgroundColor: "rgba(0,0,0,0.45)" },
  title: { color: "#fff", fontWeight: "900", fontSize: 17, fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.3 },
  sub: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" },
  filter: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.45)" },
  recenter: { position: "absolute", right: 14 },
  meWrap: { alignItems: "center", justifyContent: "center", width: 80, height: 80 },
  meGlow: { position: "absolute", width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(77,163,255,0.22)" },
  peekThumb: { position: "absolute", right: -8, bottom: -4, width: 26, height: 34, borderRadius: 7, borderWidth: 2, borderColor: "#fff" },
  newDot: { position: "absolute", top: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: HOT, borderWidth: 2, borderColor: "#0B0E12" },
  label: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(11,14,18,0.85)", maxWidth: 120 },
  labelText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  spot: { width: 62, height: 62, borderRadius: 31, borderWidth: 3, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#1A2029" },
  spotShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.3)" },
  spotCount: { color: "#fff", fontWeight: "900", fontSize: 20, fontFamily: "SpaceGrotesk_700Bold", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 },
  faces: { flexDirection: "row", alignItems: "center", marginTop: -10 },
  more: { color: "#fff", fontWeight: "800", fontSize: 11, marginLeft: 4, backgroundColor: "rgba(11,14,18,0.85)", paddingHorizontal: 5, borderRadius: 8, overflow: "hidden" },
  dock: { position: "absolute", left: 0, right: 0, gap: 8 },
  dockTitle: { color: "#fff", fontWeight: "900", fontSize: 15, fontFamily: "SpaceGrotesk_700Bold", paddingHorizontal: 18, textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 8 },
  card: { height: 150, borderRadius: 22, overflow: "hidden", backgroundColor: "#1A2029", justifyContent: "space-between" },
  cardShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.32)" },
  cardTop: { flexDirection: "row", gap: 6, padding: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: LEMON },
  badgeText: { color: "#1A1A1A", fontWeight: "900", fontSize: 12 },
  cardBottom: { padding: 12, gap: 4 },
  cardTitle: { color: "#fff", fontWeight: "900", fontSize: 15, fontFamily: "SpaceGrotesk_700Bold" },
  cardSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600", flexShrink: 1 },
  empty: { position: "absolute", left: 16, right: 16, alignItems: "center", gap: 6, padding: 18, borderRadius: 24, backgroundColor: "rgba(11,14,18,0.8)" },
  emptyTitle: { color: "#fff", fontWeight: "900", fontSize: 16, fontFamily: "SpaceGrotesk_700Bold" },
  emptySub: { color: "rgba(255,255,255,0.75)", textAlign: "center", lineHeight: 19 },
  cta: { marginTop: 6, height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: LEMON, alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#1A1A1A", fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold" },
});
