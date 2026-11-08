import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Stack, router, useFocusEffect } from "expo-router";
import { useAuth } from "../lib/auth";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { fetchMemories, zingStreak } from "../lib/community";
import { snapUrl } from "../lib/supabase";
import SnapViewer from "../components/SnapViewer";
import { ListSkeleton } from "../components/Skeleton";
import { IconTile } from "../components/Icon";
import type { Checkin } from "../lib/types";

type Mem = Checkin & { keep: boolean; chargers?: { name: string } | null };

/** Memories: every zing you've dropped, grouped by month. Only you see the expired ones. */
export default function Memories() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const me = session?.user.id;
  const [items, setItems] = useState<Mem[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [filter, setFilter] = useState<"all" | "kept">("all");
  const [viewer, setViewer] = useState<{ list: Checkin[]; start: number } | null>(null);

  const load = useCallback(() => {
    if (!me) return;
    fetchMemories(me).then((x) => setItems(x as Mem[])).catch(() => setItems([]));
    zingStreak(me).then(setStreak).catch(() => {});
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!items) return <View style={{ flex: 1, backgroundColor: t.bg, padding: 16 }}><Stack.Screen options={{ title: "Memories" }} /><ListSkeleton /></View>;

  const shown = items.filter((x) => filter === "all" || x.keep);
  // Month headers, then rows of three.
  type Row = { kind: "head"; key: string; label: string } | { kind: "row"; key: string; cells: Mem[] };
  const rows: Row[] = [];
  let month = "", buf: Mem[] = [];
  const flush = () => { if (buf.length) { rows.push({ kind: "row", key: buf[0].id, cells: buf }); buf = []; } };
  for (const m of shown) {
    const label = new Date(m.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    if (label !== month) { flush(); month = label; rows.push({ kind: "head", key: label, label }); }
    buf.push(m); if (buf.length === 3) flush();
  }
  flush();
  const cell = (width - 32 - 8) / 3;
  const now = Date.now();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: "Memories" }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 4 }}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 6 }}>
            <View style={[s.streak, { backgroundColor: streak ? "#1A1A1A" : t.surface }]}>
              <Text style={{ fontSize: 40 }}>{streak ? "🔥" : "🌱"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: streak ? "#FCE38A" : t.text, fontSize: 22, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold" }}>
                  {streak ? `${streak}-day streak` : "Start a streak"}
                </Text>
                <Text style={{ color: streak ? "#C9CED3" : t.muted, fontSize: 13 }}>
                  {streak ? "Drop a zing every day you charge to keep it alive." : "Drop a zing today, and again tomorrow."}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["all", "kept"] as const).map((f) => (
                <Pressable key={f} onPress={() => setFilter(f)} style={[s.filter, { backgroundColor: filter === f ? CTA : t.surface }]}>
                  <Text style={{ color: filter === f ? ON_CTA : t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>
                    {f === "all" ? `All · ${items.length}` : `♾ Kept · ${items.filter((x) => x.keep).length}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 30, gap: 10 }}>
            <IconTile name="camera" size={64} />
            <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17 }}>{filter === "kept" ? "Nothing kept yet" : "No zings yet"}</Text>
            <Text style={{ color: t.muted, textAlign: "center" }}>{filter === "kept" ? "Open a zing and tap Keep to save it to your profile." : "Your zings land here, even after their 24 hours are up."}</Text>
            {filter === "all" && <Pressable onPress={() => router.push("/zap/nearest")} style={[s.filter, { backgroundColor: CTA, marginTop: 6 }]}><Text style={{ color: ON_CTA, fontWeight: "800" }}>Drop a zing</Text></Pressable>}
          </View>
        }
        renderItem={({ item: r }) => r.kind === "head" ? (
          <Text style={[s.month, { color: t.text }]}>{r.label}</Text>
        ) : (
          <View style={{ flexDirection: "row", gap: 4 }}>
            {r.cells.map((m) => {
              const live = new Date(m.expires_at).getTime() > now;
              return (
                <Pressable key={m.id} onPress={() => setViewer({ list: shown, start: shown.findIndex((x) => x.id === m.id) })}
                  style={{ width: cell, height: cell * 1.33, borderRadius: 10, overflow: "hidden", backgroundColor: "#1A1A1A" }}>
                  {m.photo_path && <Image source={{ uri: snapUrl(m.photo_path) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />}
                  <View style={s.badges}>
                    {m.keep ? <Text style={s.badge}>♾</Text> : live ? <Text style={[s.badge, { backgroundColor: "#2FBF71" }]}>LIVE</Text> : null}
                  </View>
                  <Text style={s.place} numberOfLines={1}>{m.chargers?.name ?? m.place_name ?? ""}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      />
      {viewer && <SnapViewer snaps={viewer.list} start={Math.max(0, viewer.start)} onClose={() => setViewer(null)} onChanged={load} />}
    </View>
  );
}

const s = StyleSheet.create({
  streak: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 24 },
  filter: { height: 38, paddingHorizontal: 16, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  month: { fontSize: 17, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", marginTop: 14, marginBottom: 6 },
  badges: { position: "absolute", top: 6, left: 6, flexDirection: "row" },
  badge: { color: "#1A1A1A", backgroundColor: "#FCE38A", fontSize: 10.5, fontWeight: "900", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  place: { position: "absolute", left: 0, right: 0, bottom: 0, color: "#fff", fontSize: 11, fontWeight: "700", paddingHorizontal: 6, paddingTop: 12, paddingBottom: 5, backgroundColor: "rgba(0,0,0,0.45)" },
});
