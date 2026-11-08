import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { snapUrl } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { tapHaptic } from "../lib/motion";
import { Ionicons } from "./SFIcon";
import type { Checkin } from "../lib/types";

const LEMON = "#FCE38A", HOT = "#FF8A3D", INK = "#1A1A1A";
const SEEN_KEY = "stories.seen.v1";

export type Story = { userId: string; name: string; avatar?: string | null; zaps: Checkin[] };

/** Group the last 24 hours of zings by driver, newest first. */
export function toStories(zaps: Checkin[]): Story[] {
  const by = new Map<string, Story>();
  for (const z of zaps) {
    if (!z.photo_path) continue;
    const s = by.get(z.user_id) ?? { userId: z.user_id, name: z.profiles?.display_name ?? "Driver", avatar: z.profiles?.avatar_path, zaps: [] };
    s.zaps.push(z); by.set(z.user_id, s);
  }
  return [...by.values()];
}

/**
 * Instagram-style rings along the top: each driver who zinged nearby today.
 * Bright ring = new to you, grey = seen. Your own "+" comes first.
 */
export function StoriesRow({ stories, onOpen }: { stories: Story[]; onOpen: (s: Story) => void }) {
  const t = useTheme();
  const [seen, setSeen] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then((v) => v && setSeen(new Set(JSON.parse(v)))).catch(() => {});
  }, []);
  const open = (s: Story) => {
    tapHaptic();
    const next = new Set(seen); s.zaps.forEach((z) => next.add(z.id)); setSeen(next);
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-400))).catch(() => {});
    onOpen(s);
  };
  const sorted = [...stories].sort((a, b) => Number(a.zaps.every((z) => seen.has(z.id))) - Number(b.zaps.every((z) => seen.has(z.id))));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 16, paddingVertical: 6 }}>
      <Pressable onPress={() => { tapHaptic(); router.push("/zap/nearest"); }} style={s.item} accessibilityLabel="Drop a zing">
        <View style={[s.ring, { borderColor: t.line, borderStyle: "dashed" }]}>
          <View style={[s.inner, { backgroundColor: t.surface }]}><Ionicons name="camera" size={26} color={t.text} /></View>
          <View style={s.plus}><Ionicons name="add" size={14} color={INK} /></View>
        </View>
        <Text style={[s.name, { color: t.text }]} numberOfLines={1}>Your zing</Text>
      </Pressable>
      {sorted.map((st) => {
        const fresh = st.zaps.some((z) => !seen.has(z.id));
        const cover = st.zaps[0].photo_path!;
        return (
          <Pressable key={st.userId} onPress={() => open(st)} style={s.item} accessibilityLabel={`${st.name}'s zings`}>
            <View style={[s.ring, { borderColor: fresh ? LEMON : t.line }]}>
              {fresh && <View style={[StyleSheet.absoluteFill, s.glow]} />}
              <Image source={{ uri: snapUrl(cover) }} style={s.inner} contentFit="cover" transition={150} />
              {st.zaps.length > 1 && <View style={s.count}><Text style={s.countText}>{st.zaps.length}</Text></View>}
            </View>
            <Text style={[s.name, { color: fresh ? t.text : t.muted, fontWeight: fresh ? "800" : "600" }]} numberOfLines={1}>{st.name.split(" ")[0]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  item: { width: 72, alignItems: "center", gap: 5 },
  ring: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, padding: 3, alignItems: "center", justifyContent: "center" },
  glow: { borderRadius: 36, borderWidth: 3, borderColor: HOT, margin: -3, opacity: 0.55, transform: [{ rotate: "45deg" }], borderTopColor: "transparent", borderLeftColor: "transparent" },
  inner: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: INK },
  plus: { position: "absolute", right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: LEMON, borderWidth: 2.5, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  count: { position: "absolute", right: -4, top: -4, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, backgroundColor: INK, borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  countText: { color: LEMON, fontSize: 11, fontWeight: "900" },
  name: { fontSize: 12, maxWidth: 72 },
});
