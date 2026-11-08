import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "../../components/SFIcon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import {
  acceptRequest, badgeProgress, fetchMyNetwork, updateProfileExtras, fetchPoints, fetchUserStats, removeConnection, type DriverLite,
} from "../../lib/community";
import { useTheme, CTA, ON_CTA, dyn } from "../../lib/theme";
import { Avatar, Button, VerifiedBadge } from "../../components/ui";
import { reachKm, useGarage, vehicleName } from "../../lib/vehicles";
import { fetchMyClubs, type MyClub } from "../../lib/clubs";
import { pickAndUploadPhoto } from "../../lib/photos";
import { ClubBadge } from "../../components/ClubBadge";
import { useSessions } from "../../lib/sessions";
import { Icon, IconTile } from "../../components/Icon";
import { NotifyCard, NotifySettings } from "../../components/NotifyCard";
import { unreadDms } from "../../lib/dms";
import { zingStreak } from "../../lib/community";
import { personalityById } from "../../lib/personality";
import { PersonalityBadge } from "../../components/PersonalityBadge";
import { profileScore } from "../../lib/profileScore";
import { useTabSpace } from "../../lib/tabspace";
import { ChargingCard } from "../../components/ChargingCard";

const GUIDELINES_URL = "https://crprakashreddy-sys.github.io/zingd/terms.html";
const PRIVACY_URL = "https://crprakashreddy-sys.github.io/zingd/privacy.html";

export default function You() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [scrolled, setScrolled] = useState(false);
  const tabSpace = useTabSpace();
  const { active: charging } = useSessions();
  const { session, profile, signOut, refreshProfile } = useAuth();
  const [points, setPoints] = useState(0);
  const [stats, setStats] = useState({ zaps: 0, reviews: 0 });
  const [requests, setRequests] = useState<DriverLite[]>([]);
  const [connections, setConnections] = useState<DriverLite[]>([]);
  const [clubs, setClubs] = useState<MyClub[]>([]);
  const [uploading, setUploading] = useState(false);
  const { active } = useGarage();

  const load = useCallback(async () => {
    if (!profile) return;
    const [p, s, net] = await Promise.all([fetchPoints(profile.id), fetchUserStats(profile.id), fetchMyNetwork()]);
    setPoints(p); setStats(s); setRequests(net.requests); setConnections(net.connections);
    fetchMyClubs(profile.id).then(setClubs).catch(() => {});
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!session || !profile) {
    return (
      <View style={{ flex: 1, padding: 24, paddingTop: insets.top + 40, gap: 14 }}>
        <Ionicons name="flash" size={40} color={t.accent} />
        <Text style={{ color: t.text, fontSize: 26, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.6 }}>Join the EV crew</Text>
        <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
          Sign in to drop zings, review chargers, mark facilities and connect with other drivers. The map works without an account.
        </Text>
        <Button title="Sign in or join" kind="primary" onPress={() => router.push("/login")} />
        <View style={{ marginHorizontal: -16, marginTop: 10 }}><Tools /></View>
      </View>
    );
  }

  const deleteAccount = () =>
    Alert.alert("Delete your account?", "This removes your profile, zings, reviews and connections for good.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete account",
        style: "destructive",
        onPress: async () => {
          const { data: files } = await supabase.storage.from("snaps").list(profile.id, { limit: 1000 });
          if (files?.length) await supabase.storage.from("snaps").remove(files.map((f) => `${profile.id}/${f.name}`));
          const { error } = await supabase.rpc("delete_my_account");
          if (error) return Alert.alert("Couldn't delete your account", "Try again, or contact support from the guidelines page.");
          await signOut();
        },
      },
    ]);

  const prog = badgeProgress(points);
  const changePhoto = () => Alert.alert("Profile photo", undefined, [
    { text: "Cartoon of my car (from a photo)", onPress: () => router.push("/car-toon") },
    { text: "Make my cartoon (with my EV)", onPress: () => router.push("/avatar-maker") },
    { text: "Choose a photo", onPress: pickPhoto },
    { text: "Cancel", style: "cancel" },
  ]);
  const pickPhoto = async () => {
    setUploading(true);
    try {
      const path = await pickAndUploadPhoto();
      if (path) { await updateProfileExtras(profile.id, { avatar_path: path }); await refreshProfile(); }
    } catch (e: any) { Alert.alert("Photo didn't save", e?.message ?? "Try again."); }
    setUploading(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: tabSpace + 28 }}
      scrollEventThrottle={32} onScroll={(e) => { const y = e.nativeEvent.contentOffset.y > 160; if (y !== scrolled) setScrolled(y); }}>
      {/* Hero */}
      <View style={[styles.hero, { paddingTop: insets.top + 18 }]}>
        <Pressable onPress={changePhoto} accessibilityLabel="Change profile photo">
          <View style={styles.avatarRing}><Avatar name={profile.display_name} photo={profile.avatar_path} size={96} /></View>
          <View style={styles.cam}>{uploading ? <ActivityIndicator size="small" color="#FCE38A" /> : <Ionicons name="camera" size={15} color="#FCE38A" />}</View>
        </Pressable>
        <Text style={styles.name}>{profile.display_name}</Text>
        {(() => {
          const sc = profileScore(profile);
          if (sc.pct >= 100) return null;
          const next = sc.missing[0];
          return (
            <Pressable onPress={() => router.push(next.go as any)} style={styles.complete}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: "#1A1A1A", fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold" }}>Profile {sc.pct}% complete</Text>
                <Text style={{ color: "#1A1A1A", fontWeight: "700", fontSize: 12.5 }}>Next: {next.label} ›</Text>
              </View>
              <View style={styles.completeTrack}><View style={[styles.completeFill, { width: `${sc.pct}%` }]} /></View>
              <Text style={{ color: "#3C3410", fontSize: 11.5 }}>Some clubs only let complete profiles join.</Text>
            </Pressable>
          );
        })()}
        {profile.personality ? (
          <Pressable onPress={() => router.push("/personality")} style={{ marginTop: 6 }}><PersonalityBadge id={profile.personality} size="md" /></Pressable>
        ) : (
          <Pressable onPress={() => router.push("/personality")} style={{ marginTop: 6, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(26,26,26,0.35)" }}>
            <Text style={{ color: "#1A1A1A", fontWeight: "800", fontSize: 13 }}>✨ What kind of EV driver are you?</Text>
          </Pressable>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {!!profile.city && <Text style={styles.sub}>{profile.city} ·</Text>}
          <Icon name={prog.cur.icon} size={14} color="#1A1A1A" /><Text style={styles.sub}>{prog.cur.name}</Text>
        </View>
        <VerifiedBadge verified={profile.vehicle_verified} />
        {profile.bio
          ? <Text style={styles.bio}>{profile.bio}</Text>
          : <Pressable onPress={() => router.push("/edit-profile")}><Text style={[styles.bio, { opacity: 0.55 }]}>+ Add a short bio</Text></Pressable>}
        <View style={styles.statRow}>
          {[[String(stats.zaps), "Zings"], [String(stats.reviews), "Reviews"], [String(connections.length), "Crew"]].map(([v, l]) => (
            <View key={l} style={{ alignItems: "center", flex: 1 }}>
              <Text style={styles.statNum}>{v}</Text>
              <Text style={styles.statLbl}>{l}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Zing Score and badge progress */}
      <Pressable onPress={() => router.push("/leaderboard")} style={[styles.scoreCard, { backgroundColor: t.surface }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconTile name={prog.cur.icon} size={48} bg="#FCE38A" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.muted, fontSize: 12, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: 0.5 }}>ZING SCORE</Text>
            <Text style={{ color: t.text, fontSize: 28, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.5 }}>{points.toLocaleString("en-IN")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.faint} />
        </View>
        <View style={[styles.bar, { backgroundColor: t.line }]}>
          <View style={[styles.barFill, { width: `${Math.max(4, Math.round(prog.pct * 100))}%` }]} />
        </View>
        <Text style={{ color: t.muted, fontSize: 12.5 }}>
          {prog.next ? `${(prog.next.min - points).toLocaleString("en-IN")} points to ${prog.next.name}` : "Top badge. Legend status."}
        </Text>
      </Pressable>

      {/* My ride */}
      <Pressable onPress={() => router.push("/garage")} style={styles.ride}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#FCE38A", fontSize: 12, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: 0.5 }}>MY RIDE</Text>
          {active ? (
            <>
              <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", marginTop: 2, letterSpacing: -0.6 }} numberOfLines={1}>{vehicleName(active)}</Text>
              <Text style={{ color: "#B9B9B9", fontSize: 13, marginTop: 2 }}>
                {active.batteryKWh} kWh · ~{active.rangeKm} km range{active.maxDcKW ? ` · ${active.maxDcKW} kW DC` : ""}
              </Text>
              <View style={styles.battery}>
                <View style={[styles.batteryFill, { width: `${active.batteryPct ?? 60}%` }]} />
                <Text style={[styles.batteryText, { color: (active.batteryPct ?? 60) > 40 ? "#1A1A1A" : "#fff" }]}>{active.batteryPct ?? 60}% · ≈{Math.round(reachKm(active))} km</Text>
              </View>
            </>
          ) : (
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", marginTop: 4 }}>Add your EV →</Text>
          )}
        </View>
        <Ionicons name={active?.kind === "car" || !active ? "car-sport" : "bicycle"} size={46} color="#FCE38A" />
      </Pressable>

      {/* My clubs */}
      {clubs.length > 0 && (
        <View style={{ marginTop: 18 }}>
          <Text style={[styles.h, { color: t.muted, paddingHorizontal: 16, marginBottom: 8 }]}>My clubs</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
            {clubs.map((c) => (
              <Pressable key={c.id} onPress={() => router.push(`/club/${encodeURIComponent(c.id)}`)} style={[styles.clubChip, { backgroundColor: t.surface }]}>
                <ClubBadge c={c} size={34} />
                <Text style={{ color: t.text, fontWeight: "700", maxWidth: 150 }} numberOfLines={1}>{c.name}</Text>
                {c.unread > 0 && <View style={styles.unread}><Text style={{ color: ON_CTA, fontSize: 11, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{c.unread}</Text></View>}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ height: 18 }} />
      {charging && <View style={{ marginHorizontal: 16, marginBottom: 14 }}><ChargingCard s={charging} /></View>}
      <Tools />
      <View style={{ height: 16 }} />

      <View style={[styles.section, { borderTopColor: t.line }]}>
        <Text style={[styles.h, { color: t.muted }]}>Connection requests</Text>
        {requests.length === 0 && <Text style={{ color: t.muted }}>No new requests.</Text>}
        {requests.map((d) => (
          <View key={d.id} style={styles.person}>
            <Pressable onPress={() => router.push(`/driver/${d.id}`)}><Avatar name={d.display_name} photo={d.avatar_path} size={40} /></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>{d.display_name}</Text>
              <Text style={{ color: t.muted, fontSize: 12.5 }}>{d.car_model ?? "EV driver"}{d.vehicle_verified ? " · Verified EV" : ""}</Text>
              {!!d.note && <Text style={{ color: t.text, fontSize: 13, fontStyle: "italic" }} numberOfLines={2}>“{d.note}”</Text>}
            </View>
            <Button title="Accept" kind="primary" onPress={async () => { await acceptRequest(d.id); load(); }} style={{ height: 36, paddingHorizontal: 14 }} />
            <Button title="Decline" onPress={async () => { await removeConnection(d.id); load(); }} style={{ height: 36, paddingHorizontal: 12 }} />
          </View>
        ))}
      </View>

      <View style={[styles.section, { borderTopColor: t.line }]}>
        <Text style={[styles.h, { color: t.muted }]}>Your EV crew</Text>
        {connections.length === 0 && <Text style={{ color: t.muted }}>Tap a driver's name on any zing or review to connect.</Text>}
        {connections.map((d) => (
          <Pressable key={d.id} style={styles.person} onPress={() => router.push(`/driver/${d.id}`)}>
            <Avatar name={d.display_name} photo={d.avatar_path} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>{d.display_name}</Text>
              <Text style={{ color: t.muted, fontSize: 12.5 }}>{d.car_model ?? "EV driver"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.faint} />
          </Pressable>
        ))}
      </View>

      <Text style={[styles.h, { color: t.muted, paddingHorizontal: 16, marginBottom: 8, marginTop: 6 }]}>Notifications</Text>
      <NotifyCard />
      <View style={{ height: 8 }} />
      <NotifySettings />
      <View style={{ height: 16 }} />

      <View style={[styles.section, { borderTopColor: t.line, gap: 0 }]}>
        {[
          ["Edit profile and my EV", () => router.push("/edit-profile")],
          ["Community guidelines", () => Linking.openURL(GUIDELINES_URL)],
          ["Privacy policy", () => Linking.openURL(PRIVACY_URL)],
          ["Help & support", () => Linking.openURL("mailto:zingd.support@gmail.com?subject=zingd%20help")],
          ["Sign out", signOut],
        ].map(([label, fn]) => (
          <Pressable key={label as string} onPress={fn as () => void} style={[styles.rowBtn, { borderBottomColor: t.line }]}>
            <Text style={{ color: t.text, fontSize: 15 }}>{label as string}</Text>
          </Pressable>
        ))}
        <Pressable onPress={deleteAccount} style={styles.rowBtn}>
          <Text style={{ color: t.bad, fontSize: 15 }}>Delete account</Text>
        </Pressable>
      </View>
    </ScrollView>
    {/* Keeps the clock and battery readable when the page scrolls under them */}
    {scrolled && <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: t.bg, opacity: 0.94 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  complete: { alignSelf: "stretch", marginHorizontal: 20, marginTop: 10, padding: 12, gap: 6, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.55)" },
  completeTrack: { height: 8, borderRadius: 4, backgroundColor: "rgba(26,26,26,0.12)", overflow: "hidden" },
  completeFill: { height: 8, borderRadius: 4, backgroundColor: "#1A1A1A" },
  hero: { backgroundColor: "#FCE38A", alignItems: "center", paddingHorizontal: 20, paddingBottom: 20, gap: 4, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  avatarRing: { padding: 4, borderRadius: 60, backgroundColor: "#1A1A1A" },
  cam: { position: "absolute", right: 0, bottom: 2, width: 32, height: 32, borderRadius: 16, backgroundColor: "#1A1A1A", borderWidth: 3, borderColor: "#FCE38A", alignItems: "center", justifyContent: "center" },
  name: { color: "#1A1A1A", fontSize: 26, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.5, marginTop: 8 },
  sub: { color: "#1A1A1A", opacity: 0.7, fontWeight: "700" },
  bio: { color: "#1A1A1A", textAlign: "center", lineHeight: 20, marginTop: 6, maxWidth: 320 },
  statRow: { flexDirection: "row", alignSelf: "stretch", marginTop: 14, backgroundColor: "rgba(255,255,255,0.55)", borderRadius: 18, paddingVertical: 12 },
  statNum: { color: "#1A1A1A", fontSize: 20, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.6 },
  statLbl: { color: "#1A1A1A", opacity: 0.6, fontSize: 12, fontWeight: "700" },
  scoreCard: { margin: 16, marginBottom: 0, padding: 16, borderRadius: 20, gap: 10 },
  bar: { height: 10, borderRadius: 5, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 5, backgroundColor: CTA },
  ride: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 20, backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: dyn("#1A1A1A", "#3A3A3A") },
  battery: { height: 22, borderRadius: 11, backgroundColor: "#333", marginTop: 10, overflow: "hidden", justifyContent: "center" },
  batteryFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "#FCE38A", borderRadius: 11 },
  batteryText: { color: "#1A1A1A", fontSize: 11.5, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", paddingHorizontal: 10 },
  clubChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 6, paddingRight: 12, paddingVertical: 6, borderRadius: 999 },
  unread: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: CTA, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  stat: { flex: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4, alignItems: "center" },
  section: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  h: { fontSize: 13, fontWeight: "600" },
  person: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowBtn: { height: 52, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth },
});

function Tools() {
  const t = useTheme();
  const { active } = useGarage();
  const { active: charging } = useSessions();
  const { session: authed, profile: me } = useAuth();
  const session = authed && me ? authed : null;
  const [dm, setDm] = useState(0);
  const [streak, setStreak] = useState(0);
  useFocusEffect(useCallback(() => {
    if (session) { unreadDms().then(setDm).catch(() => {}); zingStreak(session.user.id).then(setStreak).catch(() => {}); }
  }, [session]));
  const items: [string, string, string, () => void][] = [
    ...(session ? [["chatbubble-ellipses-outline", "Messages", dm ? `${dm} unread` : "Chats with your crew", () => router.push("/messages")] as [string, string, string, () => void]] : []),
    ...(session ? [["sparkles", "My EV personality", personalityById(me?.personality)?.name ? `${personalityById(me?.personality)!.emoji} ${personalityById(me?.personality)!.name}` : "Take the 1-minute quiz", () => router.push("/personality")] as [string, string, string, () => void]] : []),
    ["car-sport-outline", "Auto-detect my car", "Knows when you're in your EV", () => router.push("/auto-detect")],
    ...(session ? [["albums-outline", "Memories", streak ? `🔥 ${streak}-day streak · all your zings` : "Every zing you've dropped", () => router.push("/memories")] as [string, string, string, () => void]] : []),
    ["car-sport-outline", "My vehicles", active ? vehicleName(active) : "Add your EV", () => router.push("/garage")],
    ["map-outline", "Plan a trip", "Charging stops on the way", () => router.push("/trip")],
    ["timer-outline", "Charging log", charging ? "Charging now" : "Track charges and spend", () => router.push("/log")],
    ["trending-down-outline", "Savings", "EV versus petrol or diesel", () => router.push("/savings")],
  ];
  return (
    <View style={{ marginHorizontal: 16, borderRadius: 14, backgroundColor: t.surface, overflow: "hidden" }}>
      {items.map(([icon, label, sub, fn], i) => (
        <Pressable key={label} onPress={fn} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: t.line }}>
          <Ionicons name={icon as any} size={20} color={t.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "600", fontSize: 15 }}>{label}</Text>
            <Text style={{ color: t.muted, fontSize: 12.5 }}>{sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.faint} />
        </Pressable>
      ))}
    </View>
  );
}
