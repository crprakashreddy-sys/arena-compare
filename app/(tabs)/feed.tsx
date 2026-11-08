import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "../../components/SFIcon";
import { fetchFeed } from "../../lib/community";
import { suits, useMode } from "../../lib/mode";
import { ModeSwitch } from "../../components/ModeSwitch";
import { snapUrl } from "../../lib/supabase";
import { timeAgo } from "../../lib/geo";
import { STATUS_LABEL } from "../../lib/theme";
import { ScoreChip } from "../../components/ZapScore";
import SnapViewer from "../../components/SnapViewer";
import type { Checkin } from "../../lib/types";
import { Glass } from "../../components/Glass";
import { useTabSpace } from "../../lib/tabspace";
import { tapHaptic } from "../../lib/motion";

const BG = "#0B1117";
const STATUS_STYLE = {
  working: { fg: "#6DD39A", bg: "#173524" },
  busy: { fg: "#F2B860", bg: "#3A2A10" },
  broken: { fg: "#F28B82", bg: "#3D1C1A" },
} as const;

/** Zings near you: a dark, full-bleed feed of live charger photos from the last 24 hours. */
export default function ZapsFeed() {
  const insets = useSafeAreaInsets();
  const tabSpace = useTabSpace();
  const { width } = useWindowDimensions();
  const [zaps, setZaps] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [where, setWhere] = useState<{ lat: number; lng: number } | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [mode] = useMode();
  const shownZ = useMemo(() => zaps.filter((z) => !z.chargers || suits({ connectors: z.chargers.connectors ?? [], network: z.chargers.network }, mode)), [zaps, mode]);

  const load = useCallback(async (p = where) => {
    if (!p) return;
    setLoading(true);
    setZaps(await fetchFeed(p.lat, p.lng, 25));
    setLoading(false);
  }, [where]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setLoading(false); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setWhere(p);
      load(p);
    })();
  }, []);

  const cardW = width - 24;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <FlatList
        data={shownZ}
        keyExtractor={(z) => z.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: tabSpace + 90, paddingTop: insets.top + 12, gap: 14 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor="#FCE38A" />}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 4, paddingBottom: 6 }}>
            <Text style={{ color: "#fff", fontSize: 40, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.5 }}>Zings near you</Text>
            <View style={{ marginTop: 10, marginBottom: 4 }}><ModeSwitch dark /></View>
            <Text style={{ color: "#A9B3BC" }}>Live from chargers within 25 km · gone in 24 hours</Text>
            <Pressable onPress={() => router.push("/leaderboard")} style={styles.board} accessibilityRole="button">
              <Ionicons name="trophy" size={18} color="#FCE38A" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Zing Score leaderboard</Text>
                <Text style={{ color: "#A9B3BC", fontSize: 12.5 }}>Zings taken right at the charger score the most</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#A9B3BC" />
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={{ alignItems: "center", gap: 10, paddingVertical: 60 }}>
              <Ionicons name="flash-outline" size={40} color="#FCE38A" />
              <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>
                {where ? "No zings near you today" : "Turn on location to see zings near you"}
              </Text>
              <Text style={{ color: "#A9B3BC", textAlign: "center", paddingHorizontal: 30 }}>
                Drop the first one at your next charge. Your photo helps the next driver.
              </Text>
              <Pressable onPress={() => router.push("/zap/nearest")} style={styles.cta}>
                <Text style={{ color: "#1A1A1A", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Drop a zing</Text>
              </Pressable>
            </View>
          )
        }
        renderItem={({ item: z, index }) => {
          const name = z.profiles?.display_name ?? "Driver";
          const sc = STATUS_STYLE[z.status];
          return (
            <View style={styles.card}>
              <Pressable onPress={() => setViewer(index)} accessibilityLabel={`Zing by ${name} at ${z.chargers?.name ?? "a charger"}`}>
                {z.photo_path && (
                  <Image source={{ uri: snapUrl(z.photo_path) }} style={{ width: cardW, height: Math.min(cardW * 4 / 3, 520) }} contentFit="cover" transition={200} />
                  {(z.video_path || z.music) && (
                    <View style={{ position: "absolute", top: 12, right: 12, flexDirection: "row", gap: 6 }}>
                      {!!z.video_path && <View style={styles.mediaBadge}><Ionicons name="play" size={13} color="#fff" /><Text style={styles.mediaText}>Video</Text></View>}
                      {!!z.music && <View style={styles.mediaBadge}><Ionicons name="musical-note" size={13} color="#FCE38A" /></View>}
                    </View>
                  )}
                )}
                <View style={{ position: "absolute", top: 10, left: 10 }}>
                  <ScoreChip points={z.zap_score} distanceM={z.distance_m} />
                </View>
                {!!z.note && (
                  <Text style={styles.note} numberOfLines={3}>{z.note}</Text>
                )}
              </Pressable>
              <View style={styles.meta}>
                <Pressable onPress={() => router.push(`/driver/${z.user_id}`)} style={styles.avatar} accessibilityLabel={`${name}'s profile`}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</Text>
                </Pressable>
                <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => router.push(`/charger/${encodeURIComponent(z.charger_id)}`)}>
                  <Text style={{ color: "#fff" }} numberOfLines={1}>
                    <Text style={{ fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{name}</Text>
                    <Text style={{ color: "#A9B3BC" }}> · {timeAgo(z.created_at)}</Text>
                  </Text>
                  <Text style={{ color: "#A9B3BC", fontSize: 13 }} numberOfLines={1}>{z.chargers?.name ?? "Charger"}</Text>
                </Pressable>
                <Text style={[styles.status, { color: sc.fg, backgroundColor: sc.bg }]}>{STATUS_LABEL[z.status].split(" ")[0]}</Text>
              </View>
            </View>
          );
        }}
      />
      {shownZ.length > 0 && <Pressable onPress={() => { tapHaptic(); router.push("/zap/nearest"); }} accessibilityLabel="Drop a zing"
        style={({ pressed }) => ({ position: "absolute", right: 16, bottom: tabSpace + 14, transform: [{ scale: pressed ? 0.93 : 1 }] })}>
        <Glass style={styles.fab} tint="#FCE38A" interactive>
          <Ionicons name="camera" size={22} color="#1A1A1A" />
          <Text style={{ color: "#1A1A1A", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 16 }}>Drop a zing</Text>
        </Glass>
      </Pressable>}
      {viewer !== null && <SnapViewer snaps={shownZ} start={viewer} onClose={() => setViewer(null)} onChanged={() => load()} />}
    </View>
  );
}

const styles = StyleSheet.create({
  mediaBadge: { flexDirection: "row", alignItems: "center", gap: 4, height: 28, paddingHorizontal: 9, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.55)" },
  mediaText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  fab: { flexDirection: "row", alignItems: "center", gap: 8, height: 56, paddingHorizontal: 22, borderRadius: 28,
    shadowColor: "#FCE38A", shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  board: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, padding: 14, borderRadius: 14, backgroundColor: "#151E26" },
  card: { borderRadius: 20, overflow: "hidden", backgroundColor: "#151C23" },
  note: { position: "absolute", left: 14, right: 14, bottom: 14, color: "#fff", fontSize: 15, lineHeight: 21, textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 8 },
  meta: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: "#FCE38A", backgroundColor: "#1F2A35", alignItems: "center", justifyContent: "center" },
  status: { fontSize: 12, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, overflow: "hidden" },
  cta: { marginTop: 8, backgroundColor: "#FCE38A", paddingHorizontal: 22, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
});
