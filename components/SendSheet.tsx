import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "./SFIcon";
import { Avatar } from "./ui";
import { fetchMyNetwork, type DriverLite } from "../lib/community";
import { fetchZingStreaks, fetchInbox } from "../lib/dms";
import { tickHaptic } from "../lib/motion";

const LEMON = "#FCE38A", INK = "#1A1A1A";
export type SendChoice = { story: "public" | "crew" | null; friends: string[] };

/**
 * Snapchat's "Send To": post to your story (everyone or just your crew) and/or send straight to
 * friends. Friends you have a 🔥 streak with float to the top.
 */
export function SendSheet({ visible, busy, onClose, onSend }: {
  visible: boolean; busy: boolean; onClose: () => void; onSend: (c: SendChoice) => void;
}) {
  const insets = useSafeAreaInsets();
  const [story, setStory] = useState<"public" | "crew" | null>("public");
  const [picked, setPicked] = useState<string[]>([]);
  const [crew, setCrew] = useState<DriverLite[] | null>(null);
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!visible || crew) return;
    fetchMyNetwork().then((n) => setCrew(n.connections)).catch(() => setCrew([]));
    // Map thread streaks to people.
    Promise.all([fetchZingStreaks(), fetchInbox()]).then(([s, inbox]) => {
      const byPerson: Record<string, number> = {};
      inbox.forEach((t) => { if (s[t.id]) byPerson[t.other_id] = s[t.id]; });
      setStreaks(byPerson);
    }).catch(() => {});
  }, [visible]);

  const list = useMemo(() => (crew ?? [])
    .filter((d) => !q.trim() || d.display_name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (streaks[b.id] ?? 0) - (streaks[a.id] ?? 0)), [crew, q, streaks]);
  const toggle = (id: string) => { tickHaptic(); setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); };
  const nothing = !story && !picked.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 10 }]}>
        <View style={s.grab} />
        <Text style={s.h}>Send to</Text>

        <View style={{ gap: 8 }}>
          {([["public", "My Story", "Everyone nearby · 24h", "globe"], ["crew", "Crew Story", "Only drivers you're connected with", "people"]] as const).map(([k, title, sub, icon]) => {
            const on = story === k;
            return (
              <Pressable key={k} onPress={() => { tickHaptic(); setStory(on ? null : k); }} style={[s.row, on && s.rowOn]}>
                <View style={[s.ic, { backgroundColor: on ? INK : "#262D33" }]}><Ionicons name={icon as any} size={18} color={on ? LEMON : "#fff"} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.title, on && { color: INK }]}>{title}</Text>
                  <Text style={[s.sub, on && { color: "#3C3410" }]}>{sub}</Text>
                </View>
                <View style={[s.check, on && s.checkOn]}>{on && <Ionicons name="checkmark" size={15} color={LEMON} />}</View>
              </Pressable>
            );
          })}
        </View>

        <Text style={[s.sub, { marginTop: 6, fontWeight: "800", letterSpacing: 0.8 }]}>FRIENDS</Text>
        {crew && crew.length > 6 && (
          <View style={s.search}><Ionicons name="search" size={15} color="#8A949D" />
            <TextInput value={q} onChangeText={setQ} placeholder="Search your crew" placeholderTextColor="#6E7882" style={{ flex: 1, color: "#fff" }} />
          </View>
        )}
        <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 4 }}>
          {!crew ? <ActivityIndicator color="#8A949D" style={{ marginTop: 14 }} /> : list.length === 0 ? (
            <Text style={[s.sub, { padding: 10 }]}>Connect with drivers in Clubs → Discover to send them zings.</Text>
          ) : list.map((d) => {
            const on = picked.includes(d.id);
            return (
              <Pressable key={d.id} onPress={() => toggle(d.id)} style={[s.friend, on && { backgroundColor: "#262D33" }]}>
                <Avatar name={d.display_name} photo={d.avatar_path} size={40} />
                <Text style={[s.title, { flex: 1 }]} numberOfLines={1}>{d.display_name}</Text>
                {!!streaks[d.id] && <Text style={s.streak}>🔥{streaks[d.id]}</Text>}
                <View style={[s.check, on && s.checkOn]}>{on && <Ionicons name="checkmark" size={15} color={LEMON} />}</View>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable onPress={() => onSend({ story, friends: picked })} disabled={busy || nothing} style={[s.send, nothing && { opacity: 0.4 }]}>
          {busy ? <ActivityIndicator color={INK} /> : (
            <>
              <Text style={s.sendText} numberOfLines={1}>
                {[story === "public" ? "My Story" : story === "crew" ? "Crew Story" : null, picked.length ? `${picked.length} friend${picked.length > 1 ? "s" : ""}` : null].filter(Boolean).join(" + ") || "Pick where to send"}
              </Text>
              <Ionicons name="paper-plane" size={18} color={INK} />
            </>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#0E1215", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, gap: 10 },
  grab: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "#2A3036" },
  h: { color: "#fff", fontSize: 22, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, backgroundColor: "#151A1F" },
  rowOn: { backgroundColor: LEMON },
  ic: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 15.5 },
  sub: { color: "#8A949D", fontSize: 12.5 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: "#3A424A", alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: INK, borderColor: INK },
  friend: { flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderRadius: 16 },
  streak: { color: "#FFB547", fontWeight: "900", fontSize: 14 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 40, borderRadius: 20, paddingHorizontal: 12, backgroundColor: "#151A1F" },
  send: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 56, borderRadius: 28, backgroundColor: LEMON, marginTop: 4 },
  sendText: { color: INK, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17, flexShrink: 1 },
});
