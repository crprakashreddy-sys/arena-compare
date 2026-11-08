import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth";
import { useTheme, CTA, ON_CTA } from "../../lib/theme";
import { useGarage } from "../../lib/vehicles";
import { autoJoinFor, fetchClubs, fetchMyClubs, joinClub, joinWithCode, type Club, type MyClub } from "../../lib/clubs";
import { timeAgo } from "../../lib/geo";
import { ClubBadge } from "../../components/ClubBadge";
import { clubSuits, useMode } from "../../lib/mode";
import { ModeSwitch } from "../../components/ModeSwitch";
import { Icon } from "../../components/Icon";
import { NotifyCard } from "../../components/NotifyCard";
import { unreadDms } from "../../lib/dms";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";

/** Clubs: owner communities for each brand and model, with live group chat. */
export default function Clubs() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { vehicles } = useGarage();
  const [mine, setMine] = useState<MyClub[]>([]);
  const [all, setAll] = useState<Club[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [mode] = useMode();
  const [dmUnread, setDmUnread] = useState(0);

  const load = useCallback(async () => {
    setErr(null);
    try {
      if (session) await autoJoinFor(vehicles, session.user.id).catch(() => {});
      const [a, m] = await Promise.all([fetchClubs(), session ? fetchMyClubs(session.user.id) : Promise.resolve([])]);
      setAll(a); setMine(m);
      if (session) unreadDms().then(setDmUnread).catch(() => {});
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }, [session, vehicles]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const mineIds = useMemo(() => new Set(mine.map((c) => c.id)), [mine]);
  const discover = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((c) => !mineIds.has(c.id) && clubSuits(c, mode) && (!s || c.name.toLowerCase().includes(s)));
  }, [all, mineIds, q, mode]);
  const community = discover.filter((c) => c.kind === "custom");
  const mineShown = mine.filter((c) => clubSuits(c, mode));
  const brands = discover.filter((c) => c.kind === "brand");
  const models = discover.filter((c) => c.kind === "model");

  const askCode = () => {
    if (Platform.OS !== "ios") return Alert.alert("Invite codes", "Joining with a code is coming to Android soon.");
    Alert.prompt("Join with a code", "Ask the club admin for their 6-letter code.", async (code) => {
      if (!code?.trim()) return;
      try { const id = await joinWithCode(code); router.push(`/club/${encodeURIComponent(id)}`); }
      catch (e: any) { Alert.alert("Couldn't join", e.message); }
    });
  };

  const join = async (c: Club) => {
    if (!session) return router.push("/login");
    await joinClub(c.id, session.user.id);
    router.push(`/club/${encodeURIComponent(c.id)}`);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />} keyboardShouldPersistTaps="handled">
      <View style={{ paddingHorizontal: 16, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.h1, { color: t.text }]}>Clubs</Text>
          <Text style={{ color: t.muted, marginTop: 2 }}>Your EV crew. Fixes, tips, drives and meetups.</Text>
        </View>
        {session && (
          <Pressable onPress={() => router.push("/messages")} style={[s.dmBtn, { backgroundColor: t.surface }]} accessibilityLabel="Messages">
            <Ionicons name="chatbubble-ellipses" size={19} color={t.text} />
            {dmUnread > 0 && <View style={s.dmDot}><Text style={s.dmDotText}>{dmUnread > 9 ? "9+" : dmUnread}</Text></View>}
          </Pressable>
        )}
        <Pressable onPress={() => (session ? router.push("/club-edit") : router.push("/login"))} style={s.newBtn} accessibilityLabel="Start a club">
          <Ionicons name="add" size={18} color={ON_CTA} />
          <Text style={s.newBtnText}>New</Text>
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}><ModeSwitch /></View>
      <NotifyCard />
      {session && (
        <Pressable onPress={askCode} style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="key" size={15} color={t.muted} /><Text style={{ color: t.muted, fontWeight: "700" }}>Have an invite code?</Text></View>
        </Pressable>
      )}

      {!session && (
        <View style={[s.hero, { marginTop: 16 }]}>
          <Ionicons name="people" size={28} color={INK} />
          <Text style={s.heroTitle}>Find your EV crew</Text>
          <Text style={s.heroBody}>Sign in to chat with owners of your car, sort out issues and plan drives together.</Text>
          <Pressable onPress={() => router.push("/login")} style={s.heroBtn}><Text style={s.heroBtnText}>Sign in to join</Text></Pressable>
        </View>
      )}

      {err && (
        <View style={{ margin: 16, padding: 14, borderRadius: 14, backgroundColor: t.warnSoft }}>
          <Text style={{ color: t.warn, fontWeight: "600" }}>{err}</Text>
        </View>
      )}

      {busy && !all.length && !err && <ActivityIndicator style={{ marginTop: 40 }} color={t.muted} />}

      {!!mineShown.length && (
        <>
          <Text style={[s.h2, { color: t.text }]}>Your clubs</Text>
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {mineShown.map((c) => <MyClubRow key={c.id} c={c} />)}
          </View>
        </>
      )}

      {session && !mine.length && !busy && !err && (
        <View style={[s.hero, { marginTop: 16 }]}>
          <Ionicons name="car-sport" size={28} color={INK} />
          <Text style={s.heroTitle}>Add your EV to auto-join its club</Text>
          <Text style={s.heroBody}>We'll put you in your brand and model clubs. Or pick any club below.</Text>
          <Pressable onPress={() => router.push("/garage")} style={s.heroBtn}><Text style={s.heroBtnText}>Add my EV</Text></Pressable>
        </View>
      )}

      {!!all.length && (
        <>
          <Text style={[s.h2, { color: t.text }]}>Discover</Text>
          <View style={[s.search, { backgroundColor: t.surface, marginHorizontal: 16 }]}>
            <Ionicons name="search" size={17} color={t.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search Nexon, Ather, BYD…" placeholderTextColor={t.faint}
              style={{ flex: 1, color: t.text, fontSize: 15 }} />
          </View>
          {!!community.length && (
            <>
              <Text style={[s.h3, { color: t.muted }]}>STARTED BY DRIVERS</Text>
              <View style={{ paddingHorizontal: 16, gap: 10 }}>
                {community.map((c) => (
                  <Pressable key={c.id} onPress={() => router.push(`/club/${encodeURIComponent(c.id)}`)} style={[s.community, { backgroundColor: t.surface }]}>
                    <ClubBadge c={c} size={48} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 15.5 }} numberOfLines={1}>{c.name}</Text>
                      {!!c.description && <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={2}>{c.description}</Text>}
                      <Text style={{ color: t.faint, fontSize: 12, marginTop: 2 }}>{[c.city, `${c.members} members`].filter(Boolean).join(" · ")}</Text>
                    </View>
                    <Pressable onPress={() => join(c)} style={[s.join, { backgroundColor: t.bg }]}>
                      <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Join</Text>
                    </Pressable>
                  </Pressable>
                ))}
              </View>
              <Text style={[s.h3, { color: t.muted }]}>BRANDS & MODELS</Text>
            </>
          )}
          {!!brands.length && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingVertical: 12 }}>
              {brands.map((c) => <BrandCard key={c.id} c={c} onJoin={() => join(c)} />)}
            </ScrollView>
          )}
          <View style={{ paddingHorizontal: 16 }}>
            {models.map((c) => (
              <View key={c.id} style={[s.row, { borderBottomColor: t.line }]}>
                <ClubBadge c={c} size={42} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ color: t.muted, fontSize: 12.5 }}>{c.members} {c.members === 1 ? "member" : "members"}</Text>
                </View>
                <Pressable onPress={() => join(c)} style={[s.join, { backgroundColor: t.surface }]}>
                  <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Join</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function MyClubRow({ c }: { c: MyClub }) {
  const t = useTheme();
  const last = c.last;
  const preview = !last ? "Say hi to the crew" : last.deleted ? "Message deleted"
    : `${last.profiles?.display_name?.split(" ")[0] ?? "Someone"}: ${last.body ?? "Photo"}`;
  return (
    <Pressable onPress={() => router.push(`/club/${encodeURIComponent(c.id)}`)}
      style={({ pressed }) => [s.mine, { backgroundColor: t.surface, opacity: pressed ? 0.8 : 1 }]}>
      <ClubBadge c={c} size={50} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 16, flexShrink: 1 }} numberOfLines={1}>{c.name}</Text>
          {last && <Text style={{ color: c.unread ? t.text : t.faint, fontSize: 12 }}>{timeAgo(last.created_at)}</Text>}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
          <Text style={{ color: t.muted, flex: 1 }} numberOfLines={1}>{preview}</Text>
          {c.muted && <Ionicons name="notifications-off" size={14} color={t.faint} />}
          {c.unread > 0 && (
            <View style={s.unread}><Text style={s.unreadText}>{c.unread > 99 ? "99+" : c.unread}</Text></View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function BrandCard({ c, onJoin }: { c: Club; onJoin: () => void }) {
  return (
    <View style={s.brand}>
      <ClubBadge c={c} size={44} />
      <Text style={s.brandName} numberOfLines={1}>{c.make}</Text>
      <Text style={s.brandMeta}>{c.members} {c.members === 1 ? "member" : "members"}</Text>
      <Pressable onPress={onJoin} style={s.brandJoin}><Text style={s.brandJoinText}>Join</Text></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 32, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -1 },
  h3: { fontSize: 12, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: 0.6, paddingHorizontal: 16, marginTop: 16, marginBottom: 8 },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: CTA, paddingHorizontal: 14, height: 38, borderRadius: 999, marginTop: 6 },
  dmBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginTop: 6 },
  dmDot: { position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: "#FF3B5C", alignItems: "center", justifyContent: "center" },
  dmDotText: { color: "#fff", fontSize: 10.5, fontWeight: "800" },
  newBtnText: { color: ON_CTA, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
  community: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 18 },
  h2: { fontSize: 18, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", marginTop: 24, marginBottom: 10, paddingHorizontal: 16 },
  hero: { marginHorizontal: 16, padding: 18, borderRadius: 20, backgroundColor: LEMON, gap: 6 },
  heroTitle: { fontSize: 20, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", color: INK, marginTop: 4, letterSpacing: -0.6 },
  heroBody: { fontSize: 14.5, color: INK, opacity: 0.75, lineHeight: 20 },
  heroBtn: { alignSelf: "flex-start", backgroundColor: INK, paddingHorizontal: 18, height: 44, borderRadius: 999, justifyContent: "center", marginTop: 8 },
  heroBtnText: { color: LEMON, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
  mine: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 18 },
  unread: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: CTA, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  unreadText: { color: ON_CTA, fontSize: 12, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, borderRadius: 12, paddingHorizontal: 12 },
  brand: { width: 120, padding: 12, borderRadius: 18, backgroundColor: LEMON, alignItems: "center", gap: 4 },
  brandName: { fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", color: INK, fontSize: 15, marginTop: 4 },
  brandMeta: { color: INK, opacity: 0.6, fontSize: 12 },
  brandJoin: { marginTop: 6, backgroundColor: INK, paddingHorizontal: 18, paddingVertical: 7, borderRadius: 999 },
  brandJoinText: { color: LEMON, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  join: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
});
