import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import {
  acceptRequest, badgeFor, connectionState, fetchConnectionCount, fetchPoints, fetchProfile, fetchUserStats, fetchUserZaps,
  removeConnection, sendRequest,
} from "../../lib/community";
import { snapUrl } from "../../lib/supabase";
import { timeAgo } from "../../lib/geo";
import { STATUS_LABEL, useTheme } from "../../lib/theme";
import { useAuth, canPost } from "../../lib/auth";
import { Avatar, Button, VerifiedBadge } from "../../components/ui";
import { openSafetyMenu } from "../../components/SafetyMenu";
import type { ConnectionState, Profile } from "../../lib/types";

export default function DriverProfile() {
  const t = useTheme();
  const auth = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id);
  const isMe = auth.session?.user.id === userId;

  const [p, setP] = useState<(Profile & { created_at: string }) | null | undefined>(undefined);
  const [points, setPoints] = useState(0);
  const [conns, setConns] = useState(0);
  const [stats, setStats] = useState({ zaps: 0, reviews: 0 });
  const [state, setState] = useState<ConnectionState>("none");
  const [zaps, setZaps] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [pr, pts, cc, st, z, cs] = await Promise.all([
      fetchProfile(userId), fetchPoints(userId), fetchConnectionCount(userId), fetchUserStats(userId), fetchUserZaps(userId), connectionState(userId),
    ]);
    setP(pr); setPoints(pts); setConns(cc); setStats(st); setZaps(z); setState(cs);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  if (p === undefined) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={t.accent} /></View>;
  if (p === null) return <View style={{ flex: 1, padding: 24 }}><Text style={{ color: t.muted }}>This driver's profile isn't available.</Text></View>;

  const act = async () => {
    if (!canPost(auth)) return router.push("/login");
    setBusy(true);
    if (state === "none") await sendRequest(userId);
    else if (state === "received") await acceptRequest(userId);
    else await removeConnection(userId);
    await load();
    setBusy(false);
  };
  const label = { none: "Connect", sent: "Request sent · Cancel", received: "Accept request", connected: "Connected · Remove" }[state];

  return (
    <>
      <Stack.Screen options={{ title: p.display_name }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ alignItems: "center", gap: 6, padding: 24 }}>
          <Avatar name={p.display_name} size={92} />
          <Text style={{ color: t.text, fontSize: 24, fontWeight: "800", marginTop: 6 }}>{p.display_name}</Text>
          <Text style={{ color: t.muted }}>{[p.car_model, p.city].filter(Boolean).join(" · ")}</Text>
          <VerifiedBadge verified={p.vehicle_verified} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12, alignSelf: "stretch" }}>
            {[[String(points), "Zap Score"], [String(conns), "Connections"], [badgeFor(points), "Badge"]].map(([v, l]) => (
              <View key={l} style={[styles.stat, { backgroundColor: t.surface }]}>
                <Text style={{ color: t.text, fontWeight: "800", fontSize: v.length > 6 ? 14 : 20 }} numberOfLines={1}>{v}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>{l}</Text>
              </View>
            ))}
          </View>
          {!isMe && (
            <>
              <Button title={label} kind={state === "none" || state === "received" ? "primary" : "secondary"} busy={busy} onPress={act} style={{ alignSelf: "stretch", marginTop: 10 }} />
              <Pressable onPress={() => openSafetyMenu({ kind: "user", targetId: userId, userId, userName: p.display_name, onDone: () => router.back() })} style={{ padding: 10 }}>
                <Text style={{ color: t.muted }}>Report or block</Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <Text style={{ color: t.muted, fontWeight: "600", fontSize: 13 }}>{stats.zaps} zaps · {stats.reviews} reviews</Text>
          {zaps.length === 0 && <Text style={{ color: t.muted }}>No zaps yet.</Text>}
          {zaps.map((z) => (
            <Pressable key={z.id} onPress={() => router.push(`/charger/${encodeURIComponent(z.charger_id)}`)} style={[styles.row, { borderColor: t.line }]}>
              <View style={styles.thumb}>
                {z.photo_path ? <Image source={{ uri: snapUrl(z.photo_path) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "600" }} numberOfLines={1}>{z.chargers?.name ?? "Charger"}</Text>
                <Text style={{ color: t.muted, fontSize: 12.5 }}>{STATUS_LABEL[z.status as keyof typeof STATUS_LABEL]} · {timeAgo(z.created_at)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 6, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 44, height: 58, borderRadius: 8, overflow: "hidden", backgroundColor: "#14202B" },
});
