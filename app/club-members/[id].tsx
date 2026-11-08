import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "../../components/SFIcon";
import { useTheme, CTA, ON_CTA } from "../../lib/theme";
import { useAuth } from "../../lib/auth";
import { pickSquarePhoto } from "../../lib/photos";
import { acceptRequest, fetchConnectionMap, sendRequest, type Link } from "../../lib/community";
import { startDm } from "../../lib/dms";
import { fetchClub, fetchInfoStats, setClubPhoto, fetchMembers, myRole, removeMember, setRole, setRules, type Club, type ClubMember, type InfoStats } from "../../lib/clubs";
import { networkById } from "../../lib/networks";
import { Icon, type IconName } from "../../components/Icon";
import { successHaptic } from "../../lib/motion";
import { Avatar } from "../../components/ui";
import { ClubBadge } from "../../components/ClubBadge";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";

/** Club info: who it's for, how lively it is, the rules, and who's in it. Admins manage members and rules here. */
export default function ClubMembers() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const clubId = decodeURIComponent(id ?? "");
  const t = useTheme();
  const { session } = useAuth();
  const me = session?.user.id;
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [admin, setAdmin] = useState(false);
  const [stats, setStats] = useState<InfoStats | null>(null);
  const [editRules, setEditRules] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [links, setLinks] = useState<Record<string, Link>>({});

  const load = useCallback(async () => {
    const [c, m, r] = await Promise.all([fetchClub(clubId), fetchMembers(clubId), me ? myRole(clubId, me) : Promise.resolve(null)]);
    setClub(c); setMembers(m); setAdmin(r === "admin");
    fetchInfoStats(clubId).then(setStats);
    fetchConnectionMap().then(setLinks).catch(() => {});
  }, [clubId, me]);
  useEffect(() => { load(); }, [load]);

  const invite = () => club?.invite_code && Share.share({
    message: `Join "${club.name}" on zingd\nOpen zingd → Clubs → Have an invite code? → ${club.invite_code}`,
  });

  const act = (m: ClubMember) => {
    if (!admin || m.user_id === me) return router.push(`/driver/${m.user_id}`);
    const name = m.profiles?.display_name ?? "this member";
    Alert.alert(name, undefined, [
      { text: "View profile", onPress: () => router.push(`/driver/${m.user_id}`) },
      m.role === "admin"
        ? { text: "Remove as admin", onPress: () => setRole(clubId, m.user_id, "member").then(load).catch((e) => Alert.alert("Couldn't change", e.message)) }
        : { text: "Make admin", onPress: () => setRole(clubId, m.user_id, "admin").then(load).catch((e) => Alert.alert("Couldn't change", e.message)) },
      { text: "Remove from club", style: "destructive", onPress: () => removeMember(clubId, m.user_id).then(load).catch((e) => Alert.alert("Couldn't remove", e.message)) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const changePhoto = () => {
    const pick = async () => {
      setUploading(true);
      try { const p = await pickSquarePhoto(); if (p) { await setClubPhoto(clubId, p); successHaptic(); load(); } }
      catch (e: any) { Alert.alert("Photo not saved", e.message); }
      setUploading(false);
    };
    Alert.alert("Club photo", "Everyone in and outside the club sees this.", [
      { text: "Choose a photo", onPress: pick },
      ...(club?.photo_path ? [{ text: "Remove photo", style: "destructive" as const, onPress: () => setClubPhoto(clubId, null).then(load) }] : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const saveRules = async () => {
    try { await setRules(clubId, editRules ?? ""); successHaptic(); setEditRules(null); load(); }
    catch (e: any) { Alert.alert("Rules not saved", e.message); }
  };

  if (!club) return <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: "center" }}><ActivityIndicator color={t.muted} /></View>;

  const hero = club.kind === "custom" ? (club.color || LEMON) : (networkById(club.make.toLowerCase().replace("tata", "tataev")).id !== "other" ? networkById(club.make.toLowerCase().replace("tata", "tataev")).color : INK);
  const onHero = isLight(hero) ? INK : "#fff";
  const admins = members.filter((m) => m.role === "admin");
  const rest = members.filter((m) => m.role !== "admin");
  const tiles: [IconName, string, string][] = stats ? [
    ["people", String(stats.members), "members"],
    ["flame", String(stats.active_week), "active this week"],
    ["chat", String(stats.msgs_week), "messages this week"],
    ["check", String(stats.issues_solved), "issues solved"],
    ["wrench", String(stats.issues_open), "open questions"],
    ["calendar", String(stats.events_upcoming), "upcoming events"],
  ] : [];
  const since = stats?.since ? new Date(stats.since).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : null;

  // Add people to your crew right from the club: Connect → Requested → Message.
  const ConnectBtn = ({ uid }: { uid: string }) => {
    const l = links[uid];
    const go = async () => {
      try {
        if (!l) { await sendRequest(uid); setLinks((x) => ({ ...x, [uid]: "sent" })); successHaptic(); }
        else if (l === "received") { await acceptRequest(uid); setLinks((x) => ({ ...x, [uid]: "connected" })); successHaptic(); }
        else if (l === "connected") { const tid = await startDm(uid); router.push(`/dm/${tid}`); }
      } catch (e: any) { Alert.alert("Couldn't do that", e.message); }
    };
    const label = !l ? "Connect" : l === "sent" ? "Requested" : l === "received" ? "Accept" : "Message";
    const on = !l || l === "received";
    return (
      <Pressable onPress={go} disabled={l === "sent"} hitSlop={6}
        style={[s.conn, { backgroundColor: on ? CTA : t.surface, opacity: l === "sent" ? 0.6 : 1 }]}>
        <Text style={{ color: on ? ON_CTA : t.text, fontWeight: "800", fontSize: 13 }}>{label}</Text>
      </Pressable>
    );
  };

  const Member = ({ m }: { m: ClubMember }) => (
    <Pressable onPress={() => act(m)} style={({ pressed }) => [s.row, { borderTopColor: t.line }, pressed && { opacity: 0.6 }]}>
      <Avatar name={m.profiles?.display_name ?? "?"} photo={m.profiles?.avatar_path} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: "700", fontSize: 15.5 }}>{m.profiles?.display_name ?? "Driver"}{m.user_id === me ? " (you)" : ""}</Text>
        <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>
          {[m.profiles?.car_model, `joined ${new Date(m.joined_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {m.role === "admin" && <View style={s.admin}><Icon name="crown" size={12} color={INK} /><Text style={s.adminText}>Admin</Text></View>}
      {m.user_id !== me && <ConnectBtn uid={m.user_id} />}
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 48 }}>
      <Stack.Screen options={{ title: "Club info" }} />

      {/* Hero */}
      <View style={[s.hero, { backgroundColor: hero }]}>
        <Pressable onPress={admin ? changePhoto : undefined} disabled={!admin} accessibilityLabel={admin ? "Change club photo" : undefined}
          style={[s.ring, { borderColor: onHero === INK ? "rgba(26,26,26,0.15)" : "rgba(255,255,255,0.25)" }]}>
          <ClubBadge c={club} size={88} />
          {admin && (
            <View style={s.cam}>{uploading ? <ActivityIndicator size="small" color={LEMON} /> : <Ionicons name="camera" size={15} color={LEMON} />}</View>
          )}
        </Pressable>
        <Text style={[s.name, { color: onHero }]}>{club.name}</Text>
        {!!club.description && <Text style={{ color: onHero, opacity: 0.85, textAlign: "center", lineHeight: 21, fontSize: 15 }}>{club.description}</Text>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 4 }}>
          {[club.kind === "brand" ? "Brand club" : club.kind === "model" ? "Owners club" : "Driver-made", club.city, club.is_private ? "Invite only" : "Open to all", since ? `Since ${since}` : null]
            .filter(Boolean).map((x) => (
              <View key={x as string} style={[s.pill, { backgroundColor: onHero === INK ? "rgba(26,26,26,0.08)" : "rgba(255,255,255,0.16)" }]}>
                <Text style={{ color: onHero, fontWeight: "700", fontSize: 12.5 }}>{x}</Text>
              </View>
            ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          {admin && club.kind === "custom" && (
            <Pressable onPress={() => router.push({ pathname: "/club-edit", params: { id: club.id } })} style={[s.btn, { backgroundColor: onHero === INK ? "rgba(26,26,26,0.1)" : "rgba(255,255,255,0.2)" }]}>
              <Ionicons name="create-outline" size={16} color={onHero} /><Text style={{ color: onHero, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Edit</Text>
            </Pressable>
          )}
          {!!club.invite_code && (
            <Pressable onPress={invite} style={[s.btn, { backgroundColor: INK }]}>
              <Ionicons name="share-outline" size={16} color={LEMON} /><Text style={{ color: LEMON, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Invite · {club.invite_code}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Bento stats */}
      {stats && (
        <View style={s.grid}>
          {tiles.map(([icon, n, label], i) => (
            <View key={label} style={[s.tile, { backgroundColor: i === 1 && stats.active_week > 0 ? LEMON : t.surface }]}>
              <Icon name={icon} size={18} color={i === 1 && stats.active_week > 0 ? INK : t.muted} />
              <Text style={[s.tileN, { color: i === 1 && stats.active_week > 0 ? INK : t.text }]}>{n}</Text>
              <Text style={{ color: i === 1 && stats.active_week > 0 ? INK : t.muted, fontSize: 12 }} numberOfLines={1}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Rules */}
      <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[s.h, { color: t.text, flex: 1 }]}>Club rules</Text>
          {admin && editRules === null && (
            <Pressable onPress={() => setEditRules(club.rules ?? DEFAULT_RULES)} hitSlop={8}><Text style={{ color: t.text, fontWeight: "800" }}>{club.rules ? "Edit" : "Add"}</Text></Pressable>
          )}
        </View>
        {editRules !== null ? (
          <View style={{ gap: 8 }}>
            <TextInput value={editRules} onChangeText={setEditRules} multiline maxLength={1500}
              style={[s.rulesInput, { backgroundColor: t.surface, color: t.text }]} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => setEditRules(null)} style={[s.btn, { backgroundColor: t.surface, flex: 1, justifyContent: "center" }]}><Text style={{ color: t.text, fontWeight: "800" }}>Cancel</Text></Pressable>
              <Pressable onPress={saveRules} style={[s.btn, { backgroundColor: CTA, flex: 1, justifyContent: "center" }]}><Text style={{ color: ON_CTA, fontWeight: "800" }}>Save rules</Text></Pressable>
            </View>
          </View>
        ) : (
          <View style={[s.rules, { backgroundColor: t.surface }]}>
            {(club.rules ?? DEFAULT_RULES).split("\n").filter((l) => l.trim()).map((l, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                <Text style={[s.ruleN, { color: t.muted }]}>{i + 1}</Text>
                <Text style={{ color: t.text, flex: 1, lineHeight: 20 }}>{l.replace(/^\s*[-•\d.]+\s*/, "")}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Members */}
      <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
        {admins.length > 0 && <>
          <Text style={[s.h, { color: t.text, marginBottom: 4 }]}>Admins</Text>
          {admins.map((m) => <Member key={m.user_id} m={m} />)}
        </>}
        <Text style={[s.h, { color: t.text, marginTop: admins.length ? 18 : 0, marginBottom: 4 }]}>Members · {rest.length}</Text>
        {rest.length === 0 && <Text style={{ color: t.muted, paddingVertical: 8 }}>No one else yet. Share the club to get it going.</Text>}
        {rest.map((m) => <Member key={m.user_id} m={m} />)}
      </View>
    </ScrollView>
  );
}

const DEFAULT_RULES = "Be kind. Everyone was a new EV owner once.\nShare real experiences: photos, numbers and fixes help most.\nNo selling, spam or referral links.\nKeep it about EVs, charging and drives.";

function isLight(hex: string) {
  const h = hex.replace("#", "");
  if (h.length < 6) return true;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

const s = StyleSheet.create({
  hero: { alignItems: "center", gap: 6, paddingTop: 22, paddingBottom: 24, paddingHorizontal: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  ring: { padding: 4, borderRadius: 60, borderWidth: 3, marginBottom: 6 },
  name: { fontSize: 26, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", textAlign: "center", letterSpacing: -0.8 },
  cam: { position: "absolute", right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: INK, borderWidth: 2.5, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, height: 42, borderRadius: 999 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginTop: 16 },
  tile: { width: "31.8%", borderRadius: 18, padding: 12, gap: 4 },
  tileN: { fontSize: 24, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
  h: { fontSize: 18, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.3 },
  rules: { borderRadius: 18, padding: 14, gap: 10 },
  ruleN: { width: 16, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold" },
  rulesInput: { minHeight: 140, borderRadius: 16, padding: 14, fontSize: 15, lineHeight: 21, textAlignVertical: "top" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  conn: { height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: "center", marginLeft: 6 },
  admin: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: LEMON, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  adminText: { color: INK, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 12 },
});
