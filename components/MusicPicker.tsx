import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Ionicons } from "./SFIcon";
import { TRACKS, trackById } from "../lib/music";
import { tapHaptic, tickHaptic } from "../lib/motion";

const LEMON = "#FCE38A";
const MOOD_COLOR: Record<string, string> = {
  Chill: "#7FD1B9", Upbeat: "#FFB547", "Desi chill": "#C98B5A", Bhangra: "#FF6B2C", Synthwave: "#B892FF",
  Hype: "#FF4F8B", Epic: "#5B9BFF", Acoustic: "#9BE15D", Dreamy: "#FF8FB1", Happy: "#FCE38A",
};

/** Pick a soundtrack for a zing. Tap a track to hear it; tap Use to pick it. */
export function MusicPicker({ visible, value, onClose, onPick }: {
  visible: boolean; value: string | null; onClose: () => void; onPick: (id: string | null) => void;
}) {
  const [playing, setPlaying] = useState<string | null>(null);
  const player = useAudioPlayer(null);
  useEffect(() => { setAudioModeAsync({ playsInSilentMode: true }).catch(() => {}); }, []);
  useEffect(() => { if (!visible) { player.pause(); setPlaying(null); } }, [visible]);

  const preview = (id: string) => {
    tickHaptic();
    if (playing === id) { player.pause(); setPlaying(null); return; }
    const t = trackById(id); if (!t) return;
    player.replace(t.source); player.seekTo(0); player.play(); setPlaying(id);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.grab} />
        <Text style={s.h}>Add music</Text>
        <Text style={s.sub}>Original zingd tracks, free to use. They play when people watch your zing.</Text>
        <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
          {value && (
            <Pressable onPress={() => { tapHaptic(); onPick(null); onClose(); }} style={[s.row, { justifyContent: "center" }]}>
              <Ionicons name="close-circle" size={18} color="#C9CED3" /><Text style={{ color: "#C9CED3", fontWeight: "700" }}>No music</Text>
            </Pressable>
          )}
          {TRACKS.map((t) => {
            const on = value === t.id, live = playing === t.id;
            return (
              <Pressable key={t.id} onPress={() => preview(t.id)} style={[s.row, on && { borderColor: LEMON }]}>
                <View style={[s.art, { backgroundColor: MOOD_COLOR[t.mood] ?? LEMON }]}>
                  <Ionicons name={live ? "pause" : "play"} size={18} color="#1A1A1A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 15.5 }}>{t.title}</Text>
                  <Text style={{ color: "#8A949D", fontSize: 12.5 }}>{t.mood} · {t.bpm} bpm{live ? "  ·  playing" : ""}</Text>
                </View>
                <Pressable onPress={() => { tapHaptic(); player.pause(); onPick(t.id); onClose(); }} style={[s.use, on && { backgroundColor: LEMON }]}>
                  <Text style={{ color: on ? "#1A1A1A" : "#fff", fontWeight: "800" }}>{on ? "Picked" : "Use"}</Text>
                </Pressable>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "72%", backgroundColor: "#0E1215", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, gap: 6 },
  grab: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "#2A3036", marginBottom: 6 },
  h: { color: "#fff", fontSize: 22, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: "#8A949D", fontSize: 13, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 18, backgroundColor: "#151A1F", borderWidth: 1.5, borderColor: "transparent" },
  art: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  use: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: "#262D33", justifyContent: "center" },
});
