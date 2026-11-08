import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../lib/auth";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { fetchInbox, subscribeInbox, type DmThread } from "../lib/dms";
import { timeAgo } from "../lib/geo";
import { Avatar } from "../components/ui";
import { IconTile } from "../components/Icon";
import { ListSkeleton } from "../components/Skeleton";

/** Inbox: every one-to-one chat, newest first, with unread counts. */
export default function Messages() {
  const t = useTheme();
  const { session } = useAuth();
  const me = session?.user.id;
  const [rows, setRows] = useState<DmThread[] | null>(null);

  const load = useCallback(() => { fetchInbox().then(setRows).catch(() => setRows([])); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => (me ? subscribeInbox(load) : undefined), [me, load]);

  if (!rows) return <View style={{ flex: 1, backgroundColor: t.bg, padding: 16 }}><ListSkeleton /></View>;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: t.bg }}
      data={rows}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      contentContainerStyle={{ paddingVertical: 6, flexGrow: 1 }}
      ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginLeft: 82 }} />}
      ListEmptyComponent={
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 }}>
          <IconTile name="mail" size={72} />
          <Text style={{ color: t.text, fontSize: 20, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.4 }}>No chats yet</Text>
          <Text style={{ color: t.muted, textAlign: "center", lineHeight: 20 }}>Connect with drivers you meet at chargers or in clubs, then tap Message on their profile.</Text>
          <Pressable onPress={() => router.push("/leaderboard")} style={s.cta}><Text style={s.ctaText}>Find drivers</Text></Pressable>
        </View>
      }
      renderItem={({ item: r }) => {
        const name = r.other?.display_name ?? "Driver";
        const last = r.last;
        const preview = !last ? "Say hi" : last.deleted ? "Message deleted" : last.body ?? "Photo";
        const unread = r.unread > 0;
        return (
          <Pressable onPress={() => router.push(`/dm/${r.id}`)} style={({ pressed }) => [s.row, pressed && { backgroundColor: t.surface }]}>
            <Avatar name={name} photo={r.other?.avatar_path} size={54} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }} numberOfLines={1}>{name}</Text>
                <Text style={{ color: unread ? t.text : t.faint, fontSize: 12, fontWeight: unread ? "700" : "500" }}>{timeAgo(last?.created_at ?? r.last_at)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, color: unread ? t.text : t.muted, fontWeight: unread ? "600" : "400", fontStyle: last?.deleted ? "italic" : "normal" }} numberOfLines={1}>
                  {last && last.user_id === me ? "You: " : ""}{preview}
                </Text>
                {unread && <View style={s.badge}><Text style={s.badgeText}>{r.unread > 99 ? "99+" : r.unread}</Text></View>}
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 11 },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: CTA, alignItems: "center", justifyContent: "center" },
  badgeText: { color: ON_CTA, fontSize: 12, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
  cta: { backgroundColor: CTA, paddingHorizontal: 24, height: 48, borderRadius: 999, justifyContent: "center", marginTop: 8 },
  ctaText: { color: ON_CTA, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 15.5 },
});
