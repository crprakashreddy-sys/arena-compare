import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { timeAgo } from "../lib/geo";
import { ISSUE_TAGS, fetchIssues, tagLabel, type Issue } from "../lib/issues";
import { IconTile } from "./Icon";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";

/** A club's problems and fixes: search, filter by open/solved and topic, and ask a new one. */
export function IssuesBoard({ clubId }: { clubId: string }) {
  const t = useTheme();
  const [list, setList] = useState<Issue[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "solved">("all");
  const [tag, setTag] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setList(await fetchIssues(clubId, { q, filter, tag })); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }, [clubId, q, filter, tag]);
  useEffect(() => { const id = setTimeout(load, q ? 300 : 0); return () => clearTimeout(id); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <View style={[s.search, { backgroundColor: t.surface }]}>
              <Ionicons name="search" size={17} color={t.muted} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search problems and fixes" placeholderTextColor={t.faint}
                style={{ flex: 1, color: t.text, fontSize: 15 }} returnKeyType="search" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(["all", "open", "solved"] as const).map((f) => (
                <Chip key={f} on={filter === f} onPress={() => setFilter(f)} label={f === "all" ? "All" : f === "open" ? "Open" : "Solved"} t={t} />
              ))}
              <View style={{ width: 1, backgroundColor: t.line, marginHorizontal: 2 }} />
              {ISSUE_TAGS.map((x) => (
                <Chip key={x.key} on={tag === x.key} onPress={() => setTag(tag === x.key ? null : x.key)} label={x.label} t={t} />
              ))}
            </ScrollView>
            {err && <Text style={{ color: t.warn, fontWeight: "600" }}>{err}</Text>}
          </View>
        }
        ListEmptyComponent={busy ? <ActivityIndicator style={{ marginTop: 30 }} color={t.muted} /> : (
          <View style={{ alignItems: "center", padding: 30, gap: 8 }}>
            <IconTile name="wrench" size={64} />
            <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17 }}>{q || tag || filter !== "all" ? "Nothing matches" : "No issues yet"}</Text>
            <Text style={{ color: t.muted, textAlign: "center" }}>Got a problem with your EV? Ask the owners who've been there.</Text>
          </View>
        )}
        renderItem={({ item: p }) => (
          <Pressable onPress={() => router.push(`/issue/${p.id}`)} style={({ pressed }) => [s.card, { backgroundColor: t.surface, opacity: pressed ? 0.85 : 1 }]}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 16, flex: 1, lineHeight: 21 }} numberOfLines={2}>{p.title}</Text>
              {p.solved && <View style={s.solved}><Ionicons name="checkmark" size={13} color={INK} /><Text style={s.solvedText}>Solved</Text></View>}
            </View>
            {!!p.body && <Text style={{ color: t.muted, marginTop: 4, lineHeight: 19 }} numberOfLines={2}>{p.body}</Text>}
            {!!p.tags.length && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {p.tags.map((k) => <Text key={k} style={[s.tag, { backgroundColor: t.bg, color: t.muted }]}>{tagLabel(k)}</Text>)}
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 }}>
              <Text style={{ color: t.faint, fontSize: 12.5, flex: 1 }} numberOfLines={1}>
                {p.profiles?.display_name ?? "Driver"} · {timeAgo(p.last_activity_at)}
              </Text>
              <Stat icon="hand-left" n={p.metoo} label="me too" t={t} />
              <Stat icon="chatbubble" n={p.replies} t={t} />
            </View>
          </Pressable>
        )}
      />
      <Pressable onPress={() => router.push({ pathname: "/issue-new", params: { clubId } })} style={s.fab}>
        <Ionicons name="add" size={20} color={ON_CTA} />
        <Text style={{ color: ON_CTA, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 15 }}>Ask the club</Text>
      </Pressable>
    </View>
  );
}

function Chip({ label, on, onPress, t }: { label: string; on: boolean; onPress: () => void; t: ReturnType<typeof useTheme> }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, { backgroundColor: on ? CTA : t.surface }]}>
      <Text style={{ color: on ? ON_CTA : t.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function Stat({ icon, n, label, t }: { icon: keyof typeof Ionicons.glyphMap; n: number; label?: string; t: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Ionicons name={icon} size={14} color={t.muted} />
      <Text style={{ color: t.muted, fontSize: 12.5, fontWeight: "700" }}>{n}{label ? ` ${label}` : ""}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, borderRadius: 12, paddingHorizontal: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  card: { padding: 14, borderRadius: 18 },
  solved: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: LEMON, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  solvedText: { color: INK, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 12 },
  tag: { fontSize: 12, fontWeight: "700", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  fab: { position: "absolute", right: 16, bottom: 24, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: CTA,
    paddingHorizontal: 18, height: 50, borderRadius: 999, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
