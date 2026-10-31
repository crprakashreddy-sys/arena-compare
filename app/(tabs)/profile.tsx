import React, { useCallback, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import {
  acceptRequest, badgeFor, fetchMyNetwork, fetchPoints, fetchUserStats, removeConnection, type DriverLite,
} from "../../lib/community";
import { useTheme } from "../../lib/theme";
import { Avatar, Button, VerifiedBadge } from "../../components/ui";
import { useGarage, vehicleName } from "../../lib/vehicles";
import { useSessions } from "../../lib/sessions";

const GUIDELINES_URL = "https://YOUR-SITE/zappd/community-guidelines";
const PRIVACY_URL = "https://YOUR-SITE/zappd/privacy";

export default function You() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { session, profile, signOut } = useAuth();
  const [points, setPoints] = useState(0);
  const [stats, setStats] = useState({ zaps: 0, reviews: 0 });
  const [requests, setRequests] = useState<DriverLite[]>([]);
  const [connections, setConnections] = useState<DriverLite[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    const [p, s, net] = await Promise.all([fetchPoints(profile.id), fetchUserStats(profile.id), fetchMyNetwork()]);
    setPoints(p); setStats(s); setRequests(net.requests); setConnections(net.connections);
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!session || !profile) {
    return (
      <View style={{ flex: 1, padding: 24, paddingTop: insets.top + 40, gap: 14 }}>
        <Ionicons name="flash" size={40} color={t.accent} />
        <Text style={{ color: t.text, fontSize: 26, fontWeight: "800" }}>Join the EV crew</Text>
        <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>
          Sign in to drop zaps, review chargers, mark facilities and connect with other drivers. The map works without an account.
        </Text>
        <Button title="Sign in or join" kind="primary" onPress={() => router.push("/login")} />
        <View style={{ marginHorizontal: -16, marginTop: 10 }}><Tools /></View>
      </View>
    );
  }

  const deleteAccount = () =>
    Alert.alert("Delete your account?", "This removes your profile, zaps, reviews and connections for good.", [
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

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16 }}>
        <Avatar name={profile.display_name} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.text, fontSize: 23, fontWeight: "800" }}>{profile.display_name}</Text>
          <Text style={{ color: t.muted }}>{[profile.car_model, profile.city].filter(Boolean).join(" · ") || "Add your EV"}</Text>
          <VerifiedBadge verified={profile.vehicle_verified} />
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8, padding: 16 }}>
        {[[String(stats.zaps), "Zaps"], [String(stats.reviews), "Reviews"], [String(connections.length), "Connections"], [String(points), `Zap Score · ${badgeFor(points)}`]].map(([v, l]) => (
          <View key={l} style={[styles.stat, { backgroundColor: t.surface }]}>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{v}</Text>
            <Text style={{ color: t.muted, fontSize: 11.5 }} numberOfLines={1}>{l}</Text>
          </View>
        ))}
      </View>

      <Tools />
      <View style={{ height: 16 }} />

      <View style={[styles.section, { borderTopColor: t.line }]}>
        <Text style={[styles.h, { color: t.muted }]}>Connection requests</Text>
        {requests.length === 0 && <Text style={{ color: t.muted }}>No new requests.</Text>}
        {requests.map((d) => (
          <View key={d.id} style={styles.person}>
            <Pressable onPress={() => router.push(`/driver/${d.id}`)}><Avatar name={d.display_name} size={40} /></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>{d.display_name}</Text>
              <Text style={{ color: t.muted, fontSize: 12.5 }}>{d.car_model ?? "EV driver"}{d.vehicle_verified ? " · Verified EV" : ""}</Text>
            </View>
            <Button title="Accept" kind="primary" onPress={async () => { await acceptRequest(d.id); load(); }} style={{ height: 36, paddingHorizontal: 14 }} />
            <Button title="Decline" onPress={async () => { await removeConnection(d.id); load(); }} style={{ height: 36, paddingHorizontal: 12 }} />
          </View>
        ))}
      </View>

      <View style={[styles.section, { borderTopColor: t.line }]}>
        <Text style={[styles.h, { color: t.muted }]}>Your EV crew</Text>
        {connections.length === 0 && <Text style={{ color: t.muted }}>Tap a driver's name on any zap or review to connect.</Text>}
        {connections.map((d) => (
          <Pressable key={d.id} style={styles.person} onPress={() => router.push(`/driver/${d.id}`)}>
            <Avatar name={d.display_name} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>{d.display_name}</Text>
              <Text style={{ color: t.muted, fontSize: 12.5 }}>{d.car_model ?? "EV driver"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.faint} />
          </Pressable>
        ))}
      </View>

      <View style={[styles.section, { borderTopColor: t.line, gap: 0 }]}>
        {[
          ["Edit profile and my EV", () => router.push("/edit-profile")],
          ["Community guidelines", () => Linking.openURL(GUIDELINES_URL)],
          ["Privacy policy", () => Linking.openURL(PRIVACY_URL)],
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
  );
}

const styles = StyleSheet.create({
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
  const items: [string, string, string, () => void][] = [
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
