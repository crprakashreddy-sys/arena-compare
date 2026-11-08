import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { Ionicons } from "../../components/SFIcon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth";
import { useTheme, CTA, ON_CTA } from "../../lib/theme";
import { useGarage } from "../../lib/vehicles";
import { activityLine, autoJoinFor, fetchActivity, fetchClubs, fetchMyClubs, joinClub, joinWithCode, type Activity, type Club, type MyClub } from "../../lib/clubs";
import { fetchInbox, type DmThread } from "../../lib/dms";
import { fetchFeed, fetchSuggestions, type Suggestion } from "../../lib/community";
import { timeAgo } from "../../lib/geo";
import { networkById } from "../../lib/networks";
import { ClubBadge } from "../../components/ClubBadge";
import { clubSuits, useMode } from "../../lib/mode";
import { ModeSwitch } from "../../components/ModeSwitch";
import { Icon } from "../../components/Icon";
import { NotifyCard } from "../../components/NotifyCard";
import { Avatar } from "../../components/ui";
import { StoriesRow, toStories, type Story } from "../../components/StoriesRow";
import { DriverDeck } from "../../components/DriverDeck";
import { previewOf } from "../../components/ChatMedia";
import SnapViewer from "../../components/SnapViewer";
import { useTabSpace } from "../../lib/tabspace";
import { tapHaptic } from "../../lib/motion";
import type { Checkin } from "../../lib/types";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";
const LIVE = "#2FBF71";

type Chat =
  | { kind: "club"; id: string; at: string; unread: number; c: MyClub }
  | { kind: "dm"; id: string; at: string; unread: number; d: DmThread };
type Filter = "all" | "unread" | "clubs" | "direct";

/**
 * Clubs, built like the apps people already love: stories of today's zings on top (Instagram),
 * one inbox for club chats and direct messages (WhatsApp), a swipe deck of drivers like you
 * (Bumble), and an explore grid of clubs that feel alive.
 */
export default function Clubs() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabSpace();
  const { session, profile } = useAuth();
  const { vehicles } = useGarage();
  const [mine, setMine] = useState<MyClub[]>([]);
  const [dms, setDms] = useState<DmThread[]>([]);
  const [all, setAll] = useState<Club[]>([]);
  const [act, setAct] = useState<Record<string, Activity>>({});
  const [zaps, setZaps] = useState<Checkin[]>([]);
  const [people, setPeople] = useState<Suggestion[]>([]);
  const [viewer, setViewer] = useState<Checkin[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [mode] = useMode();
  const signedIn = !!session && !!profile;

  const load = useCallback(async () => {
    setErr(null);
    try {
      if (signedIn) await autoJoinFor(vehicles, session!.user.id).catch(() => {});
      const [a, m, d] = await Promise.all([
        fetchClubs(),
        signedIn ? fetchMyClubs(session!.user.id) : Promise.resolve([]),
        signedIn ? fetchInbox().catch(() => []) : Promise.resolve([]),
      ]);
      setAll(a); setMine(m); setDms(d);
      fetchActivity().then(setAct).catch(() => {});
      if (signedIn) fetchSuggestions(20).then(setPeople).catch(() => {});
      loadStories();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }, [signedIn, vehicles]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadStories = async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
      if (pos) setZaps(await fetchFeed(pos.coords.latitude, pos.coords.longitude, 25));
    } catch {}
  };
  const stories = useMemo(() => toStories(zaps), [zaps]);

  // One inbox: club chats and direct messages, newest first.
  const chats: Chat[] = useMemo(() => {
    const c: Chat[] = mine.filter((x) => clubSuits(x, mode)).map((x) => ({ kind: "club", id: x.id, at: x.last?.created_at ?? "", unread: x.muted ? 0 : x.unread, c: x }));
    const d: Chat[] = dms.map((x) => ({ kind: "dm", id: x.id, at: x.last?.created_at ?? x.last_at, unread: x.unread, d: x }));
    return [...c, ...d].sort((a, b) => b.at.localeCompare(a.at));
  }, [mine, dms, mode]);
  const shownChats = chats.filter((x) => filter === "all" || (filter === "unread" ? x.unread > 0 : filter === "clubs" ? x.kind === "club" : x.kind === "dm"));
  const unreadTotal = chats.reduce((n, x) => n + x.unread, 0);

  const mineIds = useMemo(() => new Set(mine.map((c) => c.id)), [mine]);
  const discover = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all
      .filter((c) => !mineIds.has(c.id) && clubSuits(c, mode) && (!s || c.name.toLowerCase().includes(s)))
      .sort((a, b) => (act[b.id]?.active_week ?? 0) - (act[a.id]?.active_week ?? 0) || b.members - a.members);
  }, [all, mineIds, q, mode, act]);
  const trending = discover.filter((c) => (act[c.id]?.msgs_today ?? 0) > 0).slice(0, 6);

  const askCode = () => {
    if (Platform.OS !== "ios") return Alert.alert("Invite codes", "Joining with a code is coming to Android soon.");
    Alert.prompt("Join with a code", "Ask the club admin for their 6-letter code.", async (code) => {
      if (!code?.trim()) return;
      try { const id = await joinWithCode(code); router.push(`/club/${encodeURIComponent(id)}`); }
      catch (e: any) { Alert.alert("Couldn't join", e.message); }
    });
  };
  const join = async (c: Club) => {
    if (!signedIn) return router.push("/login");
    tapHaptic();
    await joinClub(c.id, session!.user.id);
    router.push(`/club/${encodeURIComponent(c.id)}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: tabSpace + 28 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.header}>
          <Text style={[s.h1, { color: t.text }]}>Clubs</Text>
          {signedIn && (
            <Pressable onPress={() => router.push("/messages")} style={[s.iconBtn, { backgroundColor: t.surface }]} accessibilityLabel="Messages">
              <Ionicons name="paper-plane" size={19} color={t.text} />
              {dms.some((d) => d.unread) && <View style={s.dot} />}
            </Pressable>
          )}
          <Pressable onPress={() => (signedIn ? router.push("/club-edit") : router.push("/login"))} style={s.newBtn} accessibilityLabel="Start a club">
            <Ionicons name="add" size={18} color={ON_CTA} />
            <Text style={s.newBtnText}>New</Text>
          </Pressable>
        </View>

        {/* Stories */}
        {(signedIn || stories.length > 0) && <StoriesRow stories={stories} onOpen={(st: Story) => setViewer(st.zaps)} />}

        {!signedIn && (
          <View style={[s.hero, { marginTop: 12 }]}>
            <View style={s.heroBlob} />
            <Icon name="people" size={30} color={INK} />
            <Text style={s.heroTitle}>Find your EV crew</Text>
            <Text style={s.heroBody}>Chat with owners of your car, get real answers to issues, and plan drives together.</Text>
            <Pressable onPress={() => router.push("/login")} style={s.heroBtn}><Text style={s.heroBtnText}>Join in 30 seconds</Text></Pressable>
          </View>
        )}

        {err && <View style={{ margin: 16, padding: 14, borderRadius: 14, backgroundColor: t.warnSoft }}><Text style={{ color: t.warn, fontWeight: "600" }}>{err}</Text></View>}
        {busy && !all.length && !err && <ActivityIndicator style={{ marginTop: 40 }} color={t.muted} />}

        {/* Chats */}
        {signedIn && (
          <>
            <View style={s.sectionHead}>
              <Text style={[s.h2, { color: t.text }]}>Chats</Text>
              {unreadTotal > 0 && <View style={s.pillDark}><Text style={s.pillDarkText}>{unreadTotal} new</Text></View>}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 6 }}>
              {(["all", "unread", "clubs", "direct"] as Filter[]).map((f) => (
                <Pressable key={f} onPress={() => { tapHaptic(); setFilter(f); }} style={[s.filter, { backgroundColor: filter === f ? CTA : t.surface }]}>
                  <Text style={{ color: filter === f ? ON_CTA : t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>
                    {f === "all" ? "All" : f === "unread" ? `Unread${unreadTotal ? ` ${unreadTotal}` : ""}` : f === "clubs" ? "Clubs" : "Direct"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {shownChats.length === 0 ? (
              <View style={[s.emptyChats, { backgroundColor: t.surface }]}>
                <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>
                  {filter === "unread" ? "All caught up ✨" : filter === "direct" ? "No direct chats yet" : "No chats yet"}
                </Text>
                <Text style={{ color: t.muted, fontSize: 13, textAlign: "center" }}>
                  {filter === "direct" ? "Connect with a driver below, then say hi." : vehicles.length ? "Join a club below to start talking." : "Add your EV and we'll put you in its clubs."}
                </Text>
                {!vehicles.length && filter !== "direct" && (
                  <Pressable onPress={() => router.push("/garage")} style={[s.filter, { backgroundColor: CTA, marginTop: 6 }]}><Text style={{ color: ON_CTA, fontWeight: "800" }}>Add my EV</Text></Pressable>
                )}
              </View>
            ) : (
              <View style={{ paddingHorizontal: 8 }}>
                {(showAll ? shownChats : shownChats.slice(0, 6)).map((x) => <ChatRow key={`${x.kind}-${x.id}`} x={x} act={x.kind === "club" ? act[x.id] : undefined} me={session!.user.id} />)}
                {shownChats.length > 6 && (
                  <Pressable onPress={() => setShowAll((v) => !v)} style={{ alignItems: "center", paddingVertical: 10 }}>
                    <Text style={{ color: t.muted, fontWeight: "800" }}>{showAll ? "Show less" : `Show all ${shownChats.length}`}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}

        {/* Drivers like you */}
        {signedIn && people.length > 0 && (
          <>
            <View style={s.sectionHead}>
              <View style={{ flex: 1 }}>
                <Text style={[s.h2, { color: t.text }]}>Drivers like you</Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>Swipe right to connect, left to pass</Text>
              </View>
            </View>
            <DriverDeck people={people} onEmpty={() => setPeople([])} />
          </>
        )}

        {/* Trending now */}
        {trending.length > 0 && (
          <>
            <View style={s.sectionHead}><Text style={[s.h2, { color: t.text }]}>Buzzing today 🔥</Text></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
              {trending.map((c) => (
                <Pressable key={c.id} onPress={() => router.push(`/club/${encodeURIComponent(c.id)}`)} style={[s.trend, { backgroundColor: tint(c) }]}>
                  <ClubBadge c={c} size={40} />
                  <Text style={s.trendName} numberOfLines={2}>{c.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><View style={s.live} /><Text style={s.trendMeta}>{act[c.id].msgs_today} today</Text></View>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* Explore */}
        {!!all.length && (
          <>
            <View style={s.sectionHead}><Text style={[s.h2, { color: t.text }]}>Explore clubs</Text></View>
            <View style={{ paddingHorizontal: 16, gap: 10 }}>
              <ModeSwitch />
              <View style={[s.search, { backgroundColor: t.surface }]}>
                <Ionicons name="search" size={17} color={t.muted} />
                <TextInput value={q} onChangeText={setQ} placeholder="Search Nexon, Ather, BYD…" placeholderTextColor={t.faint}
                  style={{ flex: 1, color: t.text, fontSize: 15 }} />
              </View>
            </View>
            <View style={s.grid}>
              {discover.map((c) => <ExploreTile key={c.id} c={c} a={act[c.id]} onJoin={() => join(c)} />)}
            </View>
            {discover.length === 0 && <Text style={{ color: t.muted, textAlign: "center", padding: 20 }}>No clubs match "{q}". Start one with + New.</Text>}
          </>
        )}

        {signedIn && (
          <Pressable onPress={askCode} style={{ paddingHorizontal: 16, paddingTop: 18, alignSelf: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="key" size={15} color={t.muted} /><Text style={{ color: t.muted, fontWeight: "700" }}>Have an invite code?</Text></View>
          </Pressable>
        )}
        <NotifyCard />
      </ScrollView>
      {viewer && <SnapViewer snaps={viewer} start={0} onClose={() => setViewer(null)} />}
    </View>
  );
}

/** One row in the inbox, WhatsApp-style: big avatar, bold when unread, time and a count. */
function ChatRow({ x, act, me }: { x: Chat; act?: Activity; me: string }) {
  const t = useTheme();
  const unread = x.unread > 0;
  let title = "", preview = "", avatar: React.ReactNode, muted = false;
  if (x.kind === "club") {
    const c = x.c, last = c.last;
    title = c.name; muted = c.muted;
    preview = !last ? "Say hi to the crew 👋" : last.deleted ? "Message deleted"
      : `${last.user_id === me ? "You" : last.profiles?.display_name?.split(" ")[0] ?? "Someone"}: ${previewOf(last)}`;
    avatar = <View><ClubBadge c={c} size={54} />{!!act?.msgs_today && <View style={s.onlineDot} />}</View>;
  } else {
    const d = x.d, last = d.last;
    title = d.other?.display_name ?? "Driver";
    preview = !last ? "Say hi 👋" : last.deleted ? "Message deleted" : `${last.user_id === me ? "You: " : ""}${previewOf(last)}`;
    avatar = <Avatar name={title} photo={d.other?.avatar_path} size={54} />;
  }
  return (
    <Pressable onPress={() => router.push(x.kind === "club" ? `/club/${encodeURIComponent(x.id)}` : `/dm/${x.id}`)}
      style={({ pressed }) => [s.chat, pressed && { backgroundColor: t.surface }]}>
      {avatar}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 16, flexShrink: 1 }} numberOfLines={1}>{title}</Text>
          {x.kind === "dm" && <View style={[s.tag, { backgroundColor: t.surface }]}><Text style={{ color: t.muted, fontSize: 10.5, fontWeight: "800" }}>DM</Text></View>}
          <View style={{ flex: 1 }} />
          {!!x.at && <Text style={{ color: unread ? t.text : t.faint, fontSize: 12, fontWeight: unread ? "800" : "500" }}>{timeAgo(x.at).replace(" ago", "")}</Text>}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: unread ? t.text : t.muted, fontWeight: unread ? "600" : "400", flex: 1 }} numberOfLines={1}>{preview}</Text>
          {muted && <Ionicons name="notifications-off" size={14} color={t.faint} />}
          {unread && <View style={s.unread}><Text style={s.unreadText}>{x.unread > 99 ? "99+" : x.unread}</Text></View>}
        </View>
      </View>
    </Pressable>
  );
}

/** A club in the explore grid: tinted with its brand colour, alive with activity. */
function ExploreTile({ c, a, onJoin }: { c: Club; a?: Activity; onJoin: () => void }) {
  const live = !!a?.msgs_today;
  return (
    <Pressable onPress={() => router.push(`/club/${encodeURIComponent(c.id)}`)} style={({ pressed }) => [s.tile, { backgroundColor: tint(c), transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <ClubBadge c={c} size={46} />
        {c.kind === "custom" && <View style={s.kind}><Text style={s.kindText}>BY DRIVERS</Text></View>}
      </View>
      <Text style={s.tileName} numberOfLines={2}>{c.kind === "brand" ? `${c.make} owners` : c.name}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        {live && <View style={s.live} />}
        <Text style={s.tileMeta} numberOfLines={1}>{activityLine(a, c.members)}</Text>
      </View>
      <Pressable onPress={onJoin} hitSlop={6} style={({ pressed }) => [s.tileJoin, pressed && { transform: [{ scale: 0.94 }] }]}>
        <Text style={s.tileJoinText}>Join</Text>
      </Pressable>
    </Pressable>
  );
}

/** Soft pastel version of the club's colour, so the grid feels varied but calm. */
function tint(c: Pick<Club, "kind" | "make" | "color">) {
  const base = c.kind === "custom" ? (c.color || LEMON) : networkById(c.make.toLowerCase().replace("tata", "tataev")).color;
  const h = (base || LEMON).replace("#", "");
  if (h.length < 6) return "#FFF6D6";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (v: number) => Math.round(v + (255 - v) * 0.84);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  h1: { flex: 1, fontSize: 34, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -1.2 },
  h2: { fontSize: 20, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.5 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, marginTop: 24, marginBottom: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 6, right: 7, width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF3B5C", borderWidth: 2, borderColor: "#fff" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: CTA, paddingHorizontal: 14, height: 40, borderRadius: 999 },
  newBtnText: { color: ON_CTA, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
  hero: { marginHorizontal: 16, padding: 20, borderRadius: 26, backgroundColor: LEMON, gap: 6, overflow: "hidden" },
  heroBlob: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: "#FFD45C", right: -60, top: -80 },
  heroTitle: { fontSize: 24, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", color: INK, marginTop: 4, letterSpacing: -0.8 },
  heroBody: { fontSize: 15, color: INK, opacity: 0.75, lineHeight: 21 },
  heroBtn: { alignSelf: "flex-start", backgroundColor: INK, paddingHorizontal: 20, height: 46, borderRadius: 999, justifyContent: "center", marginTop: 10 },
  heroBtnText: { color: LEMON, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 15 },
  pillDark: { backgroundColor: INK, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillDarkText: { color: LEMON, fontWeight: "800", fontSize: 12 },
  filter: { height: 36, paddingHorizontal: 16, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  emptyChats: { marginHorizontal: 16, marginTop: 4, padding: 18, borderRadius: 20, alignItems: "center", gap: 4 },
  chat: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 18 },
  onlineDot: { position: "absolute", right: 1, bottom: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: LIVE, borderWidth: 2.5, borderColor: "#fff" },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  unread: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: CTA, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  unreadText: { color: ON_CTA, fontSize: 12, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
  trend: { width: 140, padding: 12, borderRadius: 22, gap: 6 },
  trendName: { color: INK, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 14.5, letterSpacing: -0.3 },
  trendMeta: { color: INK, opacity: 0.65, fontSize: 12, fontWeight: "700" },
  live: { width: 8, height: 8, borderRadius: 4, backgroundColor: LIVE },
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 46, borderRadius: 23, paddingHorizontal: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16, marginTop: 12 },
  tile: { width: "48.5%", padding: 14, borderRadius: 24, gap: 8, minHeight: 168 },
  kind: { backgroundColor: "rgba(26,26,26,0.08)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  kindText: { color: INK, fontSize: 9.5, fontWeight: "900", letterSpacing: 0.5 },
  tileName: { color: INK, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 16, letterSpacing: -0.4, flex: 1 },
  tileMeta: { color: INK, opacity: 0.6, fontSize: 12, fontWeight: "600", flexShrink: 1 },
  tileJoin: { alignSelf: "flex-start", backgroundColor: INK, paddingHorizontal: 18, height: 34, borderRadius: 17, justifyContent: "center" },
  tileJoinText: { color: LEMON, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
});
