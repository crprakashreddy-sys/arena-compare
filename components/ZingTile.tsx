import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { fetchCheckin } from "../lib/community";
import { snapUrl } from "../lib/supabase";
import type { Checkin } from "../lib/types";
import SnapViewer from "./SnapViewer";
import { tapHaptic } from "../lib/motion";

/**
 * A zing sent straight into a chat. Shows a soft, blurred teaser until tapped, then opens it
 * full screen in the story viewer. Expired or deleted zings say so instead of breaking.
 */
export function ZingTile({ zingId, mine, caption }: { zingId: string; mine: boolean; caption?: string }) {
  const [z, setZ] = useState<Checkin | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    let live = true;
    fetchCheckin(zingId).then((c) => live && setZ(c)).catch(() => live && setZ(null));
    return () => { live = false; };
  }, [zingId]);

  if (z === undefined) {
    return <View style={[st.tile, st.center]}><ActivityIndicator color="#fff" /></View>;
  }
  if (z === null) {
    return (
      <View style={[st.tile, st.center, { backgroundColor: "#2A2A2E" }]}>
        <Text style={st.big}>⌛</Text>
        <Text style={st.sub}>This zing has disappeared</Text>
      </View>
    );
  }
  const isVideo = z.media === "video";
  return (
    <>
      <Pressable onPress={() => { tapHaptic(); setOpen(true); setSeen(true); }} style={st.tile} accessibilityRole="button" accessibilityLabel="Open zing">
        {z.photo_path ? (
          <Image source={{ uri: snapUrl(z.photo_path) }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={mine || seen ? 0 : 28} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#FF9F45" }]} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.28)" }]} />
        <View style={st.center}>
          <View style={st.play}><Text style={{ fontSize: 22 }}>{isVideo ? "▶︎" : "⚡"}</Text></View>
        </View>
        <View style={st.foot}>
          <Text style={st.label}>{caption ?? (mine ? "You sent a zing" : seen ? "Opened" : isVideo ? "Tap to watch" : "Tap to view")}</Text>
          {!!z.place_name && <Text style={st.sub} numberOfLines={1}>📍 {z.place_name}</Text>}
        </View>
      </Pressable>
      {open && <SnapViewer snaps={[z]} start={0} onClose={() => setOpen(false)} />}
    </>
  );
}

const st = StyleSheet.create({
  tile: { width: 190, height: 250, borderRadius: 20, overflow: "hidden", backgroundColor: "#111" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  play: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(255,255,255,0.22)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)", alignItems: "center", justifyContent: "center" },
  foot: { position: "absolute", left: 12, right: 12, bottom: 12 },
  label: { color: "#fff", fontWeight: "800", fontSize: 14, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2, textAlign: "center" },
  big: { fontSize: 30 },
});
