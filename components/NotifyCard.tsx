import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useAuth } from "../lib/auth";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { enablePush, fetchNotifyPrefs, pushAllowed, saveNotifyPref, type NotifyPrefs } from "../lib/push";
import { IconTile } from "./Icon";
import { successHaptic } from "../lib/motion";

/** Friendly ask before the iPhone permission prompt. Hides itself once notifications are on. */
export function NotifyCard() {
  const t = useTheme();
  const { session } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { pushAllowed().then(setAllowed).catch(() => setAllowed(false)); }, []);
  if (!session || allowed !== false) return null;
  return (
    <View style={[s.card, { backgroundColor: t.surface }]}>
      <IconTile name="chat" size={44} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 15 }}>Don't miss your crew</Text>
        <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }}>Club messages, replies to your issues and drive reminders.</Text>
      </View>
      <Pressable onPress={async () => { const ok = await enablePush(session.user.id); if (ok) successHaptic(); setAllowed(ok ? true : false); }}
        style={[s.btn, { backgroundColor: CTA }]}>
        <Text style={{ color: ON_CTA, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Turn on</Text>
      </Pressable>
    </View>
  );
}

const ROWS: { key: keyof NotifyPrefs; label: string; sub: string }[] = [
  { key: "notify_dms", label: "Messages", sub: "Direct messages from your crew" },
  { key: "notify_clubs", label: "Club messages", sub: "New messages in your clubs (mute single clubs inside the club)" },
  { key: "notify_replies", label: "Replies", sub: "When someone answers your issue" },
  { key: "notify_events", label: "Events", sub: "New drives and meetups, and a reminder 1 hour before" },
  { key: "notify_crew", label: "Crew", sub: "Connection requests and accepts" },
];

/** Notification switches for the You tab. */
export function NotifySettings() {
  const t = useTheme();
  const { session } = useAuth();
  const [p, setP] = useState<NotifyPrefs | null>(null);
  useEffect(() => { if (session) fetchNotifyPrefs(session.user.id).then(setP); }, [session?.user.id]);
  if (!session || !p) return null;
  return (
    <View style={{ marginHorizontal: 16, borderRadius: 16, backgroundColor: t.surface, overflow: "hidden" }}>
      {ROWS.map((r, i) => (
        <View key={r.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: t.line }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "600", fontSize: 15 }}>{r.label}</Text>
            <Text style={{ color: t.muted, fontSize: 12.5 }}>{r.sub}</Text>
          </View>
          <Switch value={p[r.key]} onValueChange={(v) => { setP({ ...p, [r.key]: v }); saveNotifyPref(session.user.id, r.key, v); }} />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginTop: 14, padding: 14, borderRadius: 18 },
  btn: { paddingHorizontal: 14, height: 38, borderRadius: 999, justifyContent: "center" },
});
