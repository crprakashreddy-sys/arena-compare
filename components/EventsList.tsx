import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "./SFIcon";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { fetchClubEvents, kindOf, type ClubEvent } from "../lib/events";
import { Icon, IconTile } from "./Icon";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";

/** Upcoming events in a club, soonest first, with a button to plan one. */
export function EventsList({ clubId }: { clubId: string }) {
  const t = useTheme();
  const [list, setList] = useState<ClubEvent[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setList(await fetchClubEvents(clubId)); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }, [clubId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 12 }}
        ListHeaderComponent={err ? <Text style={{ color: t.warn, fontWeight: "600" }}>{err}</Text> : null}
        ListEmptyComponent={busy ? <ActivityIndicator style={{ marginTop: 30 }} color={t.muted} /> : (
          <View style={{ alignItems: "center", padding: 30, gap: 8 }}>
            <IconTile name="calendar" size={64} />
            <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17 }}>Nothing planned yet</Text>
            <Text style={{ color: t.muted, textAlign: "center" }}>Plan a Sunday drive, a chai meetup at a charger, or a road trip.</Text>
          </View>
        )}
        renderItem={({ item: e }) => <EventCard e={e} />}
      />
      <Pressable onPress={() => router.push({ pathname: "/event-new", params: { clubId } })} style={s.fab}>
        <Ionicons name="add" size={20} color={ON_CTA} />
        <Text style={{ color: ON_CTA, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 15 }}>Plan an event</Text>
      </Pressable>
    </View>
  );
}

export function EventCard({ e, showClub }: { e: ClubEvent; showClub?: boolean }) {
  const t = useTheme();
  const d = new Date(e.starts_at);
  const k = kindOf(e.kind);
  return (
    <Pressable onPress={() => router.push(`/event/${e.id}`)} style={({ pressed }) => [s.card, { backgroundColor: t.surface, opacity: pressed ? 0.85 : 1 }]}>
      <View style={s.date}>
        <Text style={s.month}>{d.toLocaleDateString([], { month: "short" }).toUpperCase()}</Text>
        <Text style={s.day}>{d.getDate()}</Text>
        <Text style={s.wday}>{d.toLocaleDateString([], { weekday: "short" })}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ color: t.muted, fontSize: 12, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{k.label.toUpperCase()} · {d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text>
        <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 16, textDecorationLine: e.cancelled ? "line-through" : "none" }} numberOfLines={2}>{e.title}</Text>
        {!!e.place_name && <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="pin" size={13} color={t.muted} /><Text style={{ color: t.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>{e.place_name}{e.destination ? ` → ${e.destination}` : ""}</Text></View>}
        {showClub && <Text style={{ color: t.faint, fontSize: 12 }} numberOfLines={1}>{e.club_name}</Text>}
        <Text style={{ color: e.cancelled ? t.bad : t.text, fontSize: 13, fontWeight: "700", marginTop: 2 }}>
          {e.cancelled ? "Cancelled" : `${e.going} going${e.max_people ? ` / ${e.max_people}` : ""}${e.interested ? ` · ${e.interested} interested` : ""}`}
        </Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: "row", gap: 14, padding: 12, borderRadius: 18, alignItems: "center" },
  date: { width: 62, borderRadius: 14, backgroundColor: LEMON, alignItems: "center", paddingVertical: 8 },
  month: { color: INK, fontSize: 11, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: 0.5 },
  day: { color: INK, fontSize: 26, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", lineHeight: 30, letterSpacing: -0.6 },
  wday: { color: INK, fontSize: 11, fontWeight: "700", opacity: 0.6 },
  fab: { position: "absolute", right: 16, bottom: 24, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: CTA,
    paddingHorizontal: 18, height: 50, borderRadius: 999, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
