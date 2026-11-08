import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, CTA, ON_CTA } from "../../lib/theme";
import { useAuth } from "../../lib/auth";
import { snapUrl } from "../../lib/supabase";
import { timeAgo } from "../../lib/geo";
import { blockUser, report } from "../../lib/community";
import { myRole } from "../../lib/clubs";
import {
  addReply, deleteIssue, deleteReply, fetchIssue, fetchReplies, hasMeToo, markSolved, setSolvedFlag, tagLabel, toggleMeToo, toggleVote,
  type Issue, type Reply,
} from "../../lib/issues";
import { pickAndUploadPhoto } from "../../lib/photos";
import { Avatar } from "../../components/ui";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";
const REASONS = ["Spam or scam", "Abuse or harassment", "Wrong or dangerous advice", "Something else"];

/** One issue: the problem, "me too", replies ranked by helpful votes, and the accepted fix pinned on top. */
export default function IssueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const me = session?.user.id;
  const [issue, setIssue] = useState<Issue | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [metoo, setMetoo] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const i = await fetchIssue(id!);
    setIssue(i);
    if (!i) return;
    setReplies(await fetchReplies(i.id, me));
    if (me) {
      setMetoo(await hasMeToo(i.id, me));
      setAdmin((await myRole(i.club_id, me)) === "admin");
    }
  }, [id, me]);
  useEffect(() => { load(); }, [load]);

  const canSolve = !!issue && (issue.user_id === me || admin);
  const sorted = useMemo(() => {
    const sol = replies.find((r) => r.id === issue?.solution_id);
    const rest = replies.filter((r) => r !== sol).sort((a, b) => b.votes - a.votes || a.created_at.localeCompare(b.created_at));
    return sol ? [sol, ...rest] : rest;
  }, [replies, issue]);

  const flipMeToo = async () => {
    if (!me || !issue) return router.push("/login");
    setMetoo(!metoo);
    setIssue({ ...issue, metoo: issue.metoo + (metoo ? -1 : 1) });
    await toggleMeToo(issue.id, me, !metoo);
  };

  const vote = async (r: Reply) => {
    if (!me) return router.push("/login");
    setReplies((cur) => cur.map((x) => (x.id === r.id ? { ...x, votedByMe: !r.votedByMe, votes: x.votes + (r.votedByMe ? -1 : 1) } : x)));
    await toggleVote(r.id, me, !r.votedByMe);
  };

  const send = async (photo: string | null = null) => {
    if (!me || !profile) return router.push("/login");
    if (!text.trim() && !photo) return;
    setBusy(true);
    try { await addReply(issue!.id, me, text, photo); setText(""); await load(); }
    catch (e: any) { Alert.alert("Not posted", e.message); }
    setBusy(false);
  };

  const sendPhoto = async () => {
    setBusy(true);
    try { const p = await pickAndUploadPhoto(); if (p) await send(p); }
    catch (e: any) { Alert.alert("Photo didn't upload", e?.message ?? "Try again."); }
    setBusy(false);
  };

  const replyMenu = (r: Reply) => {
    if (r.deleted) return;
    const mine = r.user_id === me;
    const name = r.profiles?.display_name ?? "this driver";
    const opts: { text: string; style?: "destructive" | "cancel"; onPress?: () => void }[] = [];
    if (canSolve) {
      opts.push(issue!.solution_id === r.id
        ? { text: "Unmark as the fix", onPress: () => markSolved(issue!.id, null).then(load) }
        : { text: "✅ Mark as the fix", onPress: () => markSolved(issue!.id, r.id).then(load) });
    }
    if (mine || admin) opts.push({ text: "Delete reply", style: "destructive", onPress: () => deleteReply(r.id).then(load) });
    if (!mine) {
      opts.push({ text: "Report", onPress: () => reportIt("club_reply", r.id) });
      opts.push({ text: `Block ${name}`, style: "destructive", onPress: () => blockUser(r.user_id).then(load) });
    }
    opts.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Reply", undefined, opts);
  };

  const issueMenu = () => {
    if (!issue) return;
    const mine = issue.user_id === me;
    const opts: { text: string; style?: "destructive" | "cancel"; onPress?: () => void }[] = [];
    if (canSolve) opts.push(issue.solved
      ? { text: "Mark as not solved", onPress: () => setSolvedFlag(issue.id, false).then(load) }
      : { text: "✅ Mark as solved", onPress: () => setSolvedFlag(issue.id, true).then(load) });
    if (mine || admin) opts.push({ text: "Delete issue", style: "destructive", onPress: () => deleteIssue(issue.id).then(() => router.back()) });
    if (!mine) opts.push({ text: "Report", onPress: () => reportIt("club_post", issue.id) });
    opts.push({ text: "Cancel", style: "cancel" });
    Alert.alert(issue.title, undefined, opts);
  };

  const reportIt = (kind: "club_post" | "club_reply", target: string) => Alert.alert("Why are you reporting this?", undefined, [
    ...REASONS.map((r) => ({ text: r, onPress: () => report(kind, target, r).then(() => Alert.alert("Reported", "Thanks. Posts reported by several people are hidden automatically.")).catch((e) => Alert.alert("Report didn't send", e.message)) })),
    { text: "Cancel", style: "cancel" as const },
  ]);

  if (!issue) return <ActivityIndicator style={{ flex: 1, backgroundColor: t.bg }} color={t.muted} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}>
      <Stack.Screen options={{
        title: issue.solved ? "Solved" : "Issue",
        headerRight: () => <Pressable onPress={issueMenu} hitSlop={10}><Ionicons name="ellipsis-horizontal-circle" size={26} color={t.text} /></Pressable>,
      }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 14 }} keyboardShouldPersistTaps="handled">
        {issue.solved && (
          <View style={s.solvedBanner}><Ionicons name="checkmark-circle" size={18} color={INK} /><Text style={{ color: INK, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Solved{issue.solution_id ? " · fix pinned below" : ""}</Text></View>
        )}
        <Text style={{ color: t.text, fontSize: 22, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", lineHeight: 28 }}>{issue.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Avatar name={issue.profiles?.display_name ?? "?"} photo={issue.profiles?.avatar_path} size={28} />
          <Text style={{ color: t.muted, flex: 1 }} numberOfLines={1}>
            {issue.profiles?.display_name ?? "Driver"}{issue.profiles?.car_model ? ` · ${issue.profiles.car_model}` : ""} · {timeAgo(issue.created_at)}
          </Text>
        </View>
        {!!issue.body && <Text style={{ color: t.text, fontSize: 16, lineHeight: 23 }}>{issue.body}</Text>}
        {issue.photo_path && <Image source={{ uri: snapUrl(issue.photo_path) }} style={{ width: "100%", height: 260, borderRadius: 14 }} contentFit="cover" />}
        {!!issue.tags.length && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {issue.tags.map((k) => <Text key={k} style={[s.tag, { backgroundColor: t.surface, color: t.muted }]}>{tagLabel(k)}</Text>)}
          </View>
        )}
        <Pressable onPress={flipMeToo} style={[s.metoo, { backgroundColor: metoo ? CTA : t.surface }]}>
          <Ionicons name="hand-left" size={16} color={metoo ? ON_CTA : t.text} />
          <Text style={{ color: metoo ? ON_CTA : t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>
            {metoo ? "You have this too" : "I have this too"} · {issue.metoo}
          </Text>
        </Pressable>

        <Text style={{ color: t.text, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17, marginTop: 6 }}>
          {replies.length ? `${replies.length} ${replies.length === 1 ? "reply" : "replies"}` : "No replies yet"}
        </Text>

        {sorted.map((r) => {
          const fix = r.id === issue.solution_id;
          return (
            <Pressable key={r.id} onLongPress={() => replyMenu(r)} delayLongPress={280}
              style={[s.reply, { backgroundColor: fix ? "#FFF6D1" : t.surface, borderColor: fix ? "#E8C64A" : "transparent" }]}>
              {fix && <View style={s.fixTag}><Ionicons name="checkmark-circle" size={14} color={INK} /><Text style={{ color: INK, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 12 }}>The fix</Text></View>}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Avatar name={r.profiles?.display_name ?? "?"} photo={r.profiles?.avatar_path} size={26} />
                <Text style={{ color: fix ? INK : t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", flex: 1 }} numberOfLines={1}>
                  {r.profiles?.display_name ?? "Driver"}<Text style={{ color: fix ? "#5a5a5a" : t.muted, fontWeight: "500" }}>{r.profiles?.car_model ? ` · ${r.profiles.car_model}` : ""}</Text>
                </Text>
                <Text style={{ color: fix ? "#5a5a5a" : t.faint, fontSize: 12 }}>{timeAgo(r.created_at)}</Text>
              </View>
              {r.deleted ? <Text style={{ color: t.faint, fontStyle: "italic", marginTop: 6 }}>Reply deleted</Text> : (
                <>
                  {!!r.body && <Text style={{ color: fix ? INK : t.text, fontSize: 15.5, lineHeight: 22, marginTop: 6 }}>{r.body}</Text>}
                  {r.photo_path && <Image source={{ uri: snapUrl(r.photo_path) }} style={{ width: "100%", height: 200, borderRadius: 12, marginTop: 8 }} contentFit="cover" />}
                </>
              )}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10, alignItems: "center" }}>
                <Pressable onPress={() => vote(r)} style={[s.vote, { backgroundColor: r.votedByMe ? CTA : fix ? "#fff" : t.bg }]}>
                  <Ionicons name="arrow-up" size={14} color={r.votedByMe ? ON_CTA : t.text} />
                  <Text style={{ color: r.votedByMe ? ON_CTA : t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 13 }}>Helpful · {r.votes}</Text>
                </Pressable>
                {canSolve && !fix && !r.deleted && (
                  <Pressable onPress={() => markSolved(issue.id, r.id).then(load)} hitSlop={8}>
                    <Text style={{ color: t.muted, fontWeight: "700", fontSize: 13 }}>✅ Mark as the fix</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[s.composer, { backgroundColor: t.bg, borderTopColor: t.line, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable onPress={sendPhoto} disabled={busy} style={[s.iconBtn, { backgroundColor: t.surface }]}>
          <Ionicons name="image" size={20} color={t.text} />
        </Pressable>
        <TextInput value={text} onChangeText={setText} placeholder="Share a fix or what you've tried" placeholderTextColor={t.faint}
          multiline maxLength={3000} style={[s.input, { backgroundColor: t.surface, color: t.text }]} />
        <Pressable onPress={() => send()} disabled={busy || !text.trim()} style={[s.send, { opacity: text.trim() || busy ? 1 : 0.35 }]}>
          {busy ? <ActivityIndicator color={ON_CTA} size="small" /> : <Ionicons name="arrow-up" size={20} color={ON_CTA} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  solvedBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: LEMON, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  tag: { fontSize: 12.5, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: "hidden" },
  metoo: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  reply: { padding: 14, borderRadius: 16, borderWidth: 1.5 },
  fixTag: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: LEMON, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginBottom: 8 },
  vote: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15.5 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: CTA, alignItems: "center", justifyContent: "center" },
});
