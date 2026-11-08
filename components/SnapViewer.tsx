import React, { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "./SFIcon";
import { router } from "expo-router";
import { snapUrl } from "../lib/supabase";
import { timeAgo } from "../lib/geo";
import { STATUS_LABEL } from "../lib/theme";
import { useAuth } from "../lib/auth";
import {
  ZING_REACTIONS, deleteCheckin, issueLabel, markZingViewed, reactToZing, setZingKeep, zingReactions, zingViewers, type ZingReaction,
} from "../lib/community";
import { openSafetyMenu } from "./SafetyMenu";
import { ScoreChip } from "./ZapScore";
import { Avatar } from "./ui";
import { successHaptic, tapHaptic, tickHaptic } from "../lib/motion";
import type { Checkin } from "../lib/types";

const SHOW_MS = 5000;

/**
 * Full-screen zing stories, Snapchat-style: each plays for 5 seconds with a moving progress bar;
 * hold to pause, tap right for next and left for previous. Viewers can react; owners see who
 * watched and can keep a zing past its 24 hours.
 */
export default function SnapViewer({ snaps, start, onClose, onChanged }: {
  snaps: Checkin[]; start: number; onClose: () => void; onChanged?: () => void;
}) {
  const [i, setI] = useState(start);
  const { width, height } = useWindowDimensions();
  const { session } = useAuth();
  const me = session?.user.id;
  const s = snaps[i];
  const mine = !!s && me === s.user_id;
  const [reacts, setReacts] = useState<{ user_id: string; emoji: ZingReaction }[]>([]);
  const [views, setViews] = useState<any[] | null>(null);
  const [showViews, setShowViews] = useState(false);
  const [kept, setKept] = useState(!!s?.keep);
  const [burst, setBurst] = useState<string | null>(null);
  const prog = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const paused = useRef(false);

  const next = () => (i < snaps.length - 1 ? setI(i + 1) : onClose());
  const run = (from = 0) => {
    anim.current?.stop();
    prog.setValue(from);
    anim.current = Animated.timing(prog, { toValue: 1, duration: SHOW_MS * (1 - from), easing: Easing.linear, useNativeDriver: false });
    anim.current.start(({ finished }) => { if (finished && !paused.current) next(); });
  };

  useEffect(() => {
    if (!s) return;
    setKept(!!s.keep); setViews(null); setShowViews(false);
    markZingViewed(s, me);
    zingReactions(s.id).then(setReacts).catch(() => setReacts([]));
    if (me === s.user_id) zingViewers(s.id).then(setViews).catch(() => {});
    run(0);
    return () => anim.current?.stop();
  }, [i]);

  if (!s) return null;
  const name = s.profiles?.display_name ?? "Driver";
  const pause = () => { paused.current = true; anim.current?.stop(); };
  const resume = () => { paused.current = false; prog.stopAnimation((v) => run(v)); };

  const react = (e: ZingReaction) => {
    if (!me) return router.push("/login");
    const on = !reacts.some((r) => r.user_id === me && r.emoji === e);
    tickHaptic();
    setReacts((cur) => (on ? [...cur, { user_id: me, emoji: e }] : cur.filter((r) => !(r.user_id === me && r.emoji === e))));
    if (on) { setBurst(e); setTimeout(() => setBurst(null), 900); }
    reactToZing(s.id, me, e, on).catch(() => {});
  };
  const toggleKeep = async () => {
    try { await setZingKeep(s.id, !kept); setKept(!kept); successHaptic(); onChanged?.(); }
    catch (e: any) { Alert.alert("Didn't change", e.message); }
  };
  const counts = ZING_REACTIONS.map((e) => [e, reacts.filter((r) => r.emoji === e).length] as const).filter(([, n]) => n > 0);
  const live = new Date(s.expires_at).getTime() > Date.now();

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {s.photo_path && <Image source={{ uri: snapUrl(s.photo_path) }} style={{ width, height }} contentFit="contain" transition={150} />}

        {/* Tap zones: left = back, right = next, hold anywhere = pause */}
        <Pressable style={{ position: "absolute", left: 0, top: 140, bottom: 170, width: width * 0.33 }}
          onPress={() => setI((x) => Math.max(0, x - 1))} onLongPress={pause} onPressOut={() => paused.current && resume()} delayLongPress={180} accessibilityLabel="Previous zing" />
        <Pressable style={{ position: "absolute", right: 0, top: 140, bottom: 170, width: width * 0.67 }}
          onPress={next} onLongPress={pause} onPressOut={() => paused.current && resume()} delayLongPress={180} accessibilityLabel="Next zing" />

        <View style={{ position: "absolute", top: 54, left: 12, right: 12, gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {snaps.map((_, j) => (
              <View key={j} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)", overflow: "hidden" }}>
                {j < i ? <View style={{ flex: 1, backgroundColor: "#fff" }} />
                  : j === i ? <Animated.View style={{ height: 3, backgroundColor: "#fff", width: prog.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} /> : null}
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable onPress={() => { onClose(); router.push(`/driver/${s.user_id}`); }} style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
              <Avatar name={name} photo={s.profiles?.avatar_path} size={36} />
              <View style={{ flexShrink: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 15 }}>{name}</Text>
                <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12.5 }} numberOfLines={1}>
                  {[STATUS_LABEL[s.status], issueLabel(s.issue), timeAgo(s.created_at), kept ? "♾ kept" : live ? "⏱ 24h" : "memory"].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </Pressable>
            <View style={{ flexDirection: "row", gap: 18 }}>
              {mine ? (
                <Pressable accessibilityLabel="Delete my zing" hitSlop={10}
                  onPress={() => { pause(); Alert.alert("Delete this zing?", "It's removed for everyone.", [
                    { text: "Cancel", style: "cancel", onPress: resume },
                    { text: "Delete", style: "destructive", onPress: async () => { await deleteCheckin(s); onChanged?.(); onClose(); } }]); }}>
                  <Ionicons name="trash-outline" size={24} color="#fff" />
                </Pressable>
              ) : (
                <Pressable accessibilityLabel="Report or block" hitSlop={10}
                  onPress={() => { pause(); openSafetyMenu({ kind: "checkin", targetId: s.id, userId: s.user_id, userName: name, onDone: () => { onChanged?.(); onClose(); } }); }}>
                  <Ionicons name="flag-outline" size={23} color="#fff" />
                </Pressable>
              )}
              <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10}><Ionicons name="close" size={28} color="#fff" /></Pressable>
            </View>
          </View>
          <View style={{ alignSelf: "flex-start" }}><ScoreChip points={s.zap_score} distanceM={s.distance_m} /></View>
        </View>

        {burst && (
          <View pointerEvents="none" style={{ position: "absolute", top: height * 0.38, alignSelf: "center" }}>
            <Text style={{ fontSize: 96 }}>{burst}</Text>
          </View>
        )}

        <View style={{ position: "absolute", bottom: 36, left: 16, right: 16, gap: 12 }}>
          {!!s.note && (
            <View style={{ backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 14, padding: 12 }}>
              <Text style={{ color: "#fff", fontSize: 15, lineHeight: 21 }}>{s.note}</Text>
            </View>
          )}
          {mine ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => { tapHaptic(); pause(); setShowViews(true); }} style={chip}>
                <Ionicons name="eye-outline" size={18} color="#fff" />
                <Text style={chipText}>{views ? views.length : "…"} {views?.length === 1 ? "view" : "views"}</Text>
                {counts.map(([e, n]) => <Text key={e} style={{ color: "#fff", fontSize: 13 }}>{e}{n}</Text>)}
              </Pressable>
              <Pressable onPress={toggleKeep} style={[chip, kept && { backgroundColor: "#FCE38A" }]}>
                <Ionicons name={kept ? "bookmark" : "bookmark-outline"} size={17} color={kept ? "#1A1A1A" : "#fff"} />
                <Text style={[chipText, kept && { color: "#1A1A1A" }]}>{kept ? "Kept" : "Keep"}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
              {ZING_REACTIONS.map((e) => {
                const on = reacts.some((r) => r.user_id === me && r.emoji === e);
                const n = reacts.filter((r) => r.emoji === e).length;
                return (
                  <Pressable key={e} onPress={() => react(e)} style={({ pressed }) => [{ alignItems: "center", justifyContent: "center", width: 54, height: 54, borderRadius: 27,
                    backgroundColor: on ? "rgba(252,227,138,0.35)" : "rgba(0,0,0,0.45)", transform: [{ scale: pressed ? 1.2 : 1 }] }]}>
                    <Text style={{ fontSize: 26 }}>{e}</Text>
                    {n > 0 && <Text style={{ position: "absolute", bottom: -2, right: -2, color: "#fff", fontSize: 11, fontWeight: "900" }}>{n}</Text>}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {showViews && (
          <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => { setShowViews(false); resume(); }}>
            <View style={{ backgroundColor: "#111", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, maxHeight: height * 0.55, gap: 10 }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 18 }}>👀 {views?.length ?? 0} watched</Text>
              <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
                {(views ?? []).length === 0 && <Text style={{ color: "#8A949D" }}>No views yet. They'll show here as drivers watch.</Text>}
                {(views ?? []).map((v) => {
                  const r = reacts.filter((x) => x.user_id === v.viewer_id).map((x) => x.emoji).join(" ");
                  return (
                    <View key={v.viewer_id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Avatar name={v.profiles?.display_name ?? "?"} photo={v.profiles?.avatar_path} size={36} />
                      <Text style={{ color: "#fff", fontWeight: "700", flex: 1 }}>{v.profiles?.display_name ?? "Driver"}</Text>
                      {!!r && <Text style={{ fontSize: 18 }}>{r}</Text>}
                      <Text style={{ color: "#8A949D", fontSize: 12 }}>{timeAgo(v.viewed_at)}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const chip = { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, height: 42, paddingHorizontal: 14, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.55)" };
const chipText = { color: "#fff", fontWeight: "800" as const, fontFamily: "SpaceGrotesk_700Bold" };
