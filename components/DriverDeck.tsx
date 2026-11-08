import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../lib/auth";
import { interestById, openers } from "../lib/interests";
import { PersonalityBadge } from "./PersonalityBadge";
import { traitById } from "../lib/traits";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Avatar } from "./ui";
import { Ionicons } from "./SFIcon";
import { Icon } from "./Icon";
import { sendRequest, type Suggestion } from "../lib/community";
import { successHaptic, tapHaptic, tickHaptic } from "../lib/motion";

const LEMON = "#FCE38A", INK = "#1A1A1A";
const W = Dimensions.get("window").width;
const THROW = W * 0.28;
const SKIP_KEY = "deck.skipped.v1";

/**
 * Bumble-style deck of drivers like you. Swipe right (or ⚡) to connect, left (or ✕) to pass.
 * Passed drivers stay hidden on this phone; connecting sends a normal crew request.
 */
export function DriverDeck({ people, onEmpty }: { people: Suggestion[]; onEmpty?: () => void }) {
  const [skipped, setSkipped] = useState<Set<string> | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [opening, setOpening] = useState<Suggestion | null>(null);
  const [note, setNote] = useState("");
  const { profile } = useAuth();
  useEffect(() => { AsyncStorage.getItem(SKIP_KEY).then((v) => setSkipped(new Set(v ? JSON.parse(v) : []))).catch(() => setSkipped(new Set())); }, []);

  const deck = skipped ? people.filter((p) => !skipped.has(p.id) && !gone.has(p.id)) : [];
  useEffect(() => { if (skipped && !deck.length) onEmpty?.(); }, [deck.length, !!skipped]);

  const pos = useRef(new Animated.ValueXY()).current;
  const decide = (p: Suggestion, like: boolean) => {
    Animated.timing(pos, { toValue: { x: (like ? 1 : -1) * W * 1.4, y: 40 }, duration: 260, useNativeDriver: true }).start(() => {
      setGone((g) => new Set(g).add(p.id));
      pos.setValue({ x: 0, y: 0 });
    });
    if (like) {
      successHaptic();
      // Bumble's "opening move": say something with your request (or just send it).
      setNote(""); setOpening(p);
    } else {
      tickHaptic();
      const next = new Set(skipped ?? []); next.add(p.id); setSkipped(next);
      AsyncStorage.setItem(SKIP_KEY, JSON.stringify([...next].slice(-500))).catch(() => {});
    }
  };
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  if (!deck.length) return null;
  const top = deck[0], next = deck[1];

  const pan = Gesture.Pan().runOnJS(true)
    .onUpdate((e) => pos.setValue({ x: e.translationX, y: e.translationY * 0.25 }))
    .onEnd((e) => {
      if (Math.abs(e.translationX) > THROW || Math.abs(e.velocityX) > 900) decide(top, e.translationX > 0);
      else Animated.spring(pos, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 6 }).start();
    });

  const rotate = pos.x.interpolate({ inputRange: [-W, 0, W], outputRange: ["-14deg", "0deg", "14deg"] });
  const likeO = pos.x.interpolate({ inputRange: [20, THROW], outputRange: [0, 1], extrapolate: "clamp" });
  const nopeO = pos.x.interpolate({ inputRange: [-THROW, -20], outputRange: [1, 0], extrapolate: "clamp" });
  const behind = pos.x.interpolate({ inputRange: [-W, 0, W], outputRange: [1, 0.94, 1], extrapolate: "clamp" });

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={{ height: 390 }}>
        {next && (
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: behind }, { translateY: 10 }] }]}>
            <Card p={next} />
          </Animated.View>
        )}
        <GestureDetector gesture={pan}>
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }] }]}>
            <Card p={top} onOpen={() => router.push(`/driver/${top.id}`)} />
            <Animated.View style={[s.stamp, s.like, { opacity: likeO }]}><Text style={[s.stampText, { color: "#2FBF71" }]}>CONNECT</Text></Animated.View>
            <Animated.View style={[s.stamp, s.nope, { opacity: nopeO }]}><Text style={[s.stampText, { color: "#E5483D" }]}>PASS</Text></Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
      <View style={s.buttons}>
        <Pressable onPress={() => { tapHaptic(); decide(top, false); }} style={({ pressed }) => [s.round, { backgroundColor: "#fff", transform: [{ scale: pressed ? 0.9 : 1 }] }]} accessibilityLabel="Pass">
          <Ionicons name="close" size={30} color="#E5483D" />
        </Pressable>
        <Pressable onPress={() => router.push(`/driver/${top.id}`)} style={({ pressed }) => [s.small, { transform: [{ scale: pressed ? 0.9 : 1 }] }]} accessibilityLabel="View profile">
          <Ionicons name="person" size={20} color={INK} />
        </Pressable>
        <Pressable onPress={() => { tapHaptic(); decide(top, true); }} style={({ pressed }) => [s.round, { backgroundColor: LEMON, transform: [{ scale: pressed ? 0.9 : 1 }] }]} accessibilityLabel="Connect">
          <Ionicons name="flash" size={30} color={INK} />
        </Pressable>
      </View>
      <Modal visible={!!opening} transparent animationType="slide" onRequestClose={() => setOpening(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setOpening(null)} />
        {opening && (
          <View style={s.sheet}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={opening.display_name} photo={opening.avatar_path} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: INK, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 19 }}>Connect with {opening.display_name.split(" ")[0]}</Text>
                <Text style={{ color: "#666", fontSize: 13 }}>Add an opening move. Requests with a note get answered more.</Text>
              </View>
            </View>
            {openers(opening, profile ?? {}).map((o) => (
              <Pressable key={o} onPress={() => { tickHaptic(); setNote(o); }} style={[s.opener, note === o && { backgroundColor: LEMON }]}>
                <Text style={{ color: INK, fontWeight: "600" }}>{o}</Text>
              </Pressable>
            ))}
            <TextInput value={note} onChangeText={setNote} placeholder="Or write your own…" placeholderTextColor="#999" maxLength={140} multiline style={s.noteInput} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => { const p = opening; setOpening(null); sendRequest(p.id).then(() => flash(`Request sent to ${p.display_name.split(" ")[0]} ⚡`)).catch((e) => flash(e.message)); }}
                style={[s.sheetBtn, { backgroundColor: "#F3F1EA" }]}><Text style={{ color: INK, fontWeight: "800" }}>Just connect</Text></Pressable>
              <Pressable onPress={() => { const p = opening; setOpening(null); successHaptic(); sendRequest(p.id, note).then(() => flash(`Sent to ${p.display_name.split(" ")[0]} with your note ⚡`)).catch((e) => flash(e.message)); }}
                disabled={!note.trim()} style={[s.sheetBtn, { backgroundColor: INK, opacity: note.trim() ? 1 : 0.4 }]}><Text style={{ color: LEMON, fontWeight: "800" }}>Send with note</Text></Pressable>
            </View>
          </View>
        )}
      </Modal>
      {toast && <View style={s.toast}><Text style={{ color: LEMON, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{toast}</Text></View>}
    </View>
  );
}

function Card({ p, onOpen }: { p: Suggestion; onOpen?: () => void }) {
  return (
    <Pressable onPress={onOpen} style={s.card}>
      <View style={s.top}>
        <View style={s.blobA} /><View style={s.blobB} />
        <View style={s.avatarRing}><Avatar name={p.display_name} photo={p.avatar_path} size={112} /></View>
        {p.vehicle_verified && <View style={s.verified}><Ionicons name="checkmark-circle" size={14} color={INK} /><Text style={s.verifiedText}>Verified owner</Text></View>}
      </View>
      <View style={{ padding: 16, gap: 6 }}>
        {(p.same_car || p.same_personality) && (
          <View style={s.match}>
            <Text style={s.matchText}>
              {p.same_car && p.same_personality ? "⚡ Twin match · same car & same vibe" : p.same_car ? "🚗 Same car as you" : "🧬 Same EV personality as you"}
            </Text>
          </View>
        )}
        <Text style={s.name} numberOfLines={1}>{p.display_name}</Text>
        {!!p.personality && <PersonalityBadge id={p.personality} />}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {!!p.car_model && <View style={s.chip}><Icon name="car" size={13} color={INK} /><Text style={s.chipText}>{p.car_model}</Text></View>}
          {!!p.city && <View style={s.chip}><Icon name="pin" size={13} color={INK} /><Text style={s.chipText}>{p.city}</Text></View>}
        </View>
        {!!p.reason && <Text style={s.reason} numberOfLines={1}>✨ {p.reason}</Text>}
        {!!p.shared_traits?.length && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
            <Text style={{ color: "#8A7A3A", fontSize: 11.5, fontWeight: "800", alignSelf: "center" }}>YOU'RE BOTH</Text>
            {p.shared_traits.slice(0, 3).map((id) => traitById(id)).filter(Boolean).map((tr) => (
              <View key={tr!.id} style={[s.chip, { backgroundColor: "#FFF3C4" }]}><Text style={{ fontSize: 12 }}>{tr!.emoji}</Text><Text style={s.chipText}>{tr!.label}</Text></View>
            ))}
          </View>
        )}
        {!!p.shared_interests?.length && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
            {p.shared_interests.slice(0, 3).map((id) => interestById(id)).filter(Boolean).map((i) => (
              <View key={i!.id} style={[s.chip, { backgroundColor: LEMON }]}><Text style={{ fontSize: 12 }}>{i!.emoji}</Text><Text style={s.chipText}>{i!.label}</Text></View>
            ))}
          </View>
        )}
        {p.prompts?.[0] ? (
          <View style={s.prompt}><Text style={s.promptQ}>{p.prompts[0].q}</Text><Text style={s.promptA} numberOfLines={2}>{p.prompts[0].a}</Text></View>
        ) : !!p.bio && <Text style={s.bio} numberOfLines={2}>{p.bio}</Text>}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, borderRadius: 28, backgroundColor: "#fff", overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  top: { height: 140, backgroundColor: LEMON, alignItems: "center", justifyContent: "flex-end", overflow: "hidden" },
  blobA: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "#FFD45C", top: -110, left: -60 },
  blobB: { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: "#FFF3C4", bottom: -70, right: -30 },
  avatarRing: { padding: 4, borderRadius: 64, backgroundColor: "#fff", marginBottom: -44 },
  verified: { position: "absolute", top: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.8)", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  verifiedText: { color: INK, fontSize: 11.5, fontWeight: "800" },
  name: { color: INK, fontSize: 24, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.6, marginTop: 40, textAlign: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#F3F1EA", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  chipText: { color: INK, fontWeight: "700", fontSize: 12.5 },
  reason: { color: "#6B5A00", fontWeight: "700", fontSize: 13 },
  match: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "#1A1A1A" },
  matchText: { color: "#FCE38A", fontWeight: "800", fontSize: 12 },
  bio: { color: "#555", fontSize: 13.5, lineHeight: 19 },
  stamp: { position: "absolute", top: 22, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 3, backgroundColor: "rgba(255,255,255,0.85)" },
  like: { left: 18, borderColor: "#2FBF71", transform: [{ rotate: "-12deg" }] },
  nope: { right: 18, borderColor: "#E5483D", transform: [{ rotate: "12deg" }] },
  stampText: { fontSize: 22, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: 1 },
  buttons: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 22, marginTop: 14 },
  round: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  small: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#F3F1EA", alignItems: "center", justifyContent: "center" },
  prompt: { backgroundColor: "#F7F5EF", borderRadius: 14, padding: 10, gap: 2 },
  promptQ: { color: "#8A7A3A", fontSize: 11.5, fontWeight: "800" },
  promptA: { color: INK, fontSize: 15, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, gap: 10 },
  opener: { backgroundColor: "#F3F1EA", borderRadius: 16, padding: 12 },
  noteInput: { minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: "#E5E1D6", padding: 12, color: INK, fontSize: 15 },
  sheetBtn: { flex: 1, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  toast: { alignSelf: "center", marginTop: 12, backgroundColor: INK, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
});
