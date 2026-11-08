import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View, useColorScheme } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, CTA, ON_CTA } from "../../lib/theme";
import { useAuth } from "../../lib/auth";
import { report } from "../../lib/community";
import { myRole } from "../../lib/clubs";
import { cancelEvent, fetchEvent, fetchRsvps, fmtWhen, kindOf, openDirections, rsvp, type ClubEvent, type Rsvp } from "../../lib/events";
import { Avatar } from "../../components/ui";
import { ClubBadge } from "../../components/ClubBadge";
import { MAP_PROVIDER, zappdStyle } from "../../lib/maps";
import { Icon, IconTile } from "../../components/Icon";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";

/** One event: when, where, who's going, and I'm in / Interested. */
export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const scheme = useColorScheme();
  const { session, profile } = useAuth();
  const me = session?.user.id;
  const [e, setE] = useState<ClubEvent | null>(null);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const ev = await fetchEvent(id!);
    if (!ev) { setMissing(true); return; }
    setE(ev);
    setRsvps(await fetchRsvps(ev.id));
    if (me) setAdmin((await myRole(ev.club_id, me)) === "admin");
  }, [id, me]);
  useEffect(() => { load(); }, [load]);

  if (missing) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}><Text style={{ color: t.muted }}>This event isn't available.</Text></View>;
  if (!e) return <ActivityIndicator style={{ flex: 1, backgroundColor: t.bg }} color={t.muted} />;

  const mine = rsvps.find((r) => r.user_id === me)?.status ?? null;
  const going = rsvps.filter((r) => r.status === "going");
  const interested = rsvps.filter((r) => r.status === "interested");
  const host = e.user_id === me;
  const full = !!e.max_people && going.length >= e.max_people && mine !== "going";
  const k = kindOf(e.kind);

  const set = async (status: "going" | "interested" | null) => {
    if (!me || !profile) return router.push("/login");
    setBusy(true);
    try { await rsvp(e.id, me, status); await load(); } catch (x: any) { Alert.alert("Couldn't update", x.message); }
    setBusy(false);
  };

  const menu = () => {
    const opts: { text: string; style?: "destructive" | "cancel"; onPress?: () => void }[] = [
      { text: "Share", onPress: () => Share.share({ message: `${e.title}\n${fmtWhen(e.starts_at)}${e.place_name ? `\nAt ${e.place_name}` : ""}\n\nJoin on zingd (${e.club_name})` }) },
    ];
    if (host || admin) opts.push(e.cancelled
      ? { text: "Un-cancel event", onPress: () => cancelEvent(e.id, false).then(load) }
      : { text: "Cancel event", style: "destructive", onPress: () => Alert.alert("Cancel this event?", "Everyone going will see it's cancelled.", [
          { text: "Keep it", style: "cancel" }, { text: "Cancel event", style: "destructive", onPress: () => cancelEvent(e.id).then(load) }]) });
    if (!host) opts.push({ text: "Report", onPress: () => report("club_event", e.id, "Inappropriate event").then(() => Alert.alert("Reported", "Thanks for letting us know.")).catch(() => {}) });
    opts.push({ text: "Cancel", style: "cancel" });
    Alert.alert(e.title, undefined, opts);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{
        title: k.label,
        headerRight: () => <Pressable onPress={menu} hitSlop={10}><Ionicons name="ellipsis-horizontal-circle" size={26} color={t.text} /></Pressable>,
      }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={s.hero}>
          <IconTile name={k.icon} size={72} bg="#1A1A1A" color="#FCE38A" round />
          {e.cancelled && <View style={s.cancelled}><Text style={{ color: "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>CANCELLED</Text></View>}
          <Text style={s.title}>{e.title}</Text>
          <Text style={s.when}>{fmtWhen(e.starts_at)}</Text>
          <Pressable onPress={() => router.push(`/club/${encodeURIComponent(e.club_id)}`)} style={s.clubPill}>
            <ClubBadge c={{ kind: e.club_kind, make: e.club_make, emoji: e.club_emoji, color: e.club_color }} size={22} />
            <Text style={{ color: INK, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }} numberOfLines={1}>{e.club_name}</Text>
          </Pressable>
        </View>

        <View style={{ padding: 16, gap: 16 }}>
          {!!e.description && <Text style={{ color: t.text, fontSize: 16, lineHeight: 23 }}>{e.description}</Text>}

          <View style={[s.mapCard, { backgroundColor: t.surface }]}>
            <MapView provider={MAP_PROVIDER} customMapStyle={zappdStyle(scheme)} style={{ height: 160 }} pointerEvents="none" scrollEnabled={false} zoomEnabled={false}
              initialRegion={{ latitude: e.lat, longitude: e.lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }}>
              <Marker coordinate={{ latitude: e.lat, longitude: e.lng }} tracksViewChanges={false}>
                <View style={s.pin}><Icon name={k.icon} size={18} color="#1A1A1A" /></View>
              </Marker>
            </MapView>
            <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }} numberOfLines={1}>{e.place_name || "Meeting point"}</Text>
                {!!e.destination && <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>Heading to {e.destination}</Text>}
              </View>
              <Pressable onPress={() => openDirections(e)} style={[s.small, { backgroundColor: CTA }]}>
                <Ionicons name="navigate" size={14} color={ON_CTA} /><Text style={{ color: ON_CTA, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Directions</Text>
              </Pressable>
            </View>
          </View>

          <Text style={{ color: t.text, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17 }}>
            {going.length} going{e.max_people ? ` · ${Math.max(0, e.max_people - going.length)} spots left` : ""}
          </Text>
          {going.length > 0 ? (
            <View style={{ gap: 10 }}>
              {going.map((r) => (
                <Pressable key={r.user_id} onPress={() => router.push(`/driver/${r.user_id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Avatar name={r.profiles?.display_name ?? "?"} photo={r.profiles?.avatar_path} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontWeight: "700" }}>{r.profiles?.display_name ?? "Driver"}{r.user_id === e.user_id ? "  · host" : ""}</Text>
                    {!!r.profiles?.car_model && <Text style={{ color: t.muted, fontSize: 13 }}>{r.profiles.car_model}</Text>}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : <Text style={{ color: t.muted }}>Be the first to say you're in.</Text>}
          {interested.length > 0 && <Text style={{ color: t.muted }}>{interested.length} interested</Text>}
        </View>
      </ScrollView>

      {!e.cancelled && (
        <View style={[s.footer, { backgroundColor: t.bg, borderTopColor: t.line }]}>
          <Pressable onPress={() => set(mine === "going" ? null : "going")} disabled={busy || full}
            style={[s.big, { flex: 2, backgroundColor: mine === "going" ? LEMON : INK, opacity: full ? 0.5 : 1 }]}>
            {busy ? <ActivityIndicator color={mine === "going" ? INK : LEMON} /> : (
              <Text style={{ color: mine === "going" ? INK : LEMON, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 16 }}>
                {mine === "going" ? "You're in" : full ? "Full" : "I'm in"}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={() => set(mine === "interested" ? null : "interested")} disabled={busy}
            style={[s.big, { flex: 1, backgroundColor: mine === "interested" ? CTA : t.surface }]}>
            <Text style={{ color: mine === "interested" ? ON_CTA : t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{mine === "interested" ? "Interested ✓" : "Interested"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: LEMON, padding: 24, paddingTop: 20, alignItems: "center", gap: 6 },
  title: { fontSize: 26, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", color: INK, textAlign: "center", letterSpacing: -0.5, lineHeight: 31 },
  when: { fontSize: 16, fontWeight: "700", color: INK, opacity: 0.75 },
  clubPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.6)", paddingLeft: 4, paddingRight: 12, paddingVertical: 4, borderRadius: 999, marginTop: 6, maxWidth: "90%" },
  cancelled: { backgroundColor: "#C5221F", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  mapCard: { borderRadius: 18, overflow: "hidden" },
  pin: { width: 38, height: 38, borderRadius: 19, backgroundColor: LEMON, borderWidth: 3, borderColor: INK, alignItems: "center", justifyContent: "center" },
  small: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, padding: 16, paddingBottom: 30, borderTopWidth: StyleSheet.hairlineWidth },
  big: { height: 54, borderRadius: 999, alignItems: "center", justifyContent: "center" },
});
