import React, { useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS, ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "../../components/SFIcon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth";
import { useTheme, CTA, ON_CTA, MY_BUBBLE_TEXT } from "../../lib/theme";
import { snapUrl } from "../../lib/supabase";
import { blockUser, report, uploadSnap } from "../../lib/community";
import {
  deleteDm, fetchDm, fetchDmMessages, fetchThread, markDmRead, otherReadAt, sendDm, subscribeDm, type DmMessage, type DmPerson,
} from "../../lib/dms";
import { Avatar } from "../../components/ui";
import { IconTile } from "../../components/Icon";
import { tapHaptic } from "../../lib/motion";

const LEMON = "#FCE38A";
const REASONS = ["Spam or scam", "Abuse or harassment", "Hate speech", "Sexual content", "Something else"];

function sheet(title: string, options: string[], destructive: number, act: (i: number) => void) {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions({ title, options: [...options, "Cancel"], cancelButtonIndex: options.length, destructiveButtonIndex: destructive }, (i) => {
      if (i < options.length) act(i);
    });
  } else {
    Alert.alert(title, undefined, [...options.map((o, i) => ({ text: o, onPress: () => act(i) })), { text: "Cancel", style: "cancel" as const }]);
  }
}

function dayLabel(iso: string) {
  const d = new Date(iso); const now = new Date();
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: days < 7 ? "long" : undefined, day: "numeric", month: "short" });
}

/** One-to-one chat with a driver in your crew. */
export default function DirectMessage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const threadId = String(id);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const me = session?.user.id;

  const [other, setOther] = useState<DmPerson | null>(null);
  const [canSend, setCanSend] = useState(true);
  const [msgs, setMsgs] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(true);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<DmMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [seenAt, setSeenAt] = useState<string | null>(null);

  const byId = useMemo(() => new Map(msgs.map((m) => [m.id, m])), [msgs]);
  const myLatest = msgs.find((m) => m.user_id === me && !m.deleted)?.id;
  const nameOf = (uid: string) => (uid === me ? "You" : other?.display_name ?? "Driver");

  useEffect(() => {
    if (!me) return;
    let alive = true;
    fetchThread(threadId, me).then((r) => { if (alive) { setOther(r.other); setCanSend(r.canSend); setSeenAt(r.seenAt); } });
    fetchDmMessages(threadId).then((m) => { if (alive) { setMsgs(m); setOlder(m.length === 50); setLoading(false); } })
      .catch(() => alive && setLoading(false));
    markDmRead(threadId);
    const off = subscribeDm(threadId,
      async (newId) => {
        const m = await fetchDm(newId);
        if (!m || !alive) return;
        setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [m, ...cur]));
        markDmRead(threadId);
      },
      async (chId) => {
        const m = await fetchDm(chId);
        if (!alive) return;
        setMsgs((cur) => (m ? cur.map((x) => (x.id === chId ? m : x)) : cur.filter((x) => x.id !== chId)));
      },
      (row) => { if (alive) setSeenAt(otherReadAt(row, me)); });
    return () => { alive = false; off(); markDmRead(threadId); };
  }, [threadId, me]);

  const loadOlder = async () => {
    if (!older || !msgs.length) return;
    const more = await fetchDmMessages(threadId, msgs[msgs.length - 1].created_at);
    setOlder(more.length === 50);
    setMsgs((cur) => [...cur, ...more.filter((m) => !cur.some((x) => x.id === m.id))]);
  };

  const send = async (photoPath: string | null = null) => {
    if (!me) return router.push("/login");
    if (!text.trim() && !photoPath) return;
    setSending(true);
    try {
      const m = await sendDm(threadId, me, text, photoPath, reply?.id ?? null);
      tapHaptic();
      setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [m, ...cur]));
      setText(""); setReply(null);
    } catch (e: any) { Alert.alert("Not sent", e.message); }
    setSending(false);
  };

  const sendPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    setSending(true);
    try {
      const img = await ImageManipulator.manipulate(res.assets[0].uri).resize({ width: 1280 }).renderAsync();
      const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
      const path = await uploadSnap(out.base64!);
      await send(path);
    } catch (e: any) { Alert.alert("Photo not sent", e?.message ?? "Try again."); setSending(false); }
  };

  const block = () => {
    if (!other) return;
    Alert.alert(`Block ${other.display_name}?`, "You won't get messages from them or see their zings, reviews and club posts.", [
      { text: "Cancel", style: "cancel" },
      { text: "Block", style: "destructive", onPress: async () => { await blockUser(other.id); router.back(); } },
    ]);
  };

  const menu = () => {
    if (!other) return;
    sheet(other.display_name, ["View profile", `Block ${other.display_name}`], 1, (i) => {
      if (i === 0) router.push(`/driver/${other.id}`);
      else block();
    });
  };

  const longPress = (m: DmMessage) => {
    if (m.deleted) return;
    if (m.user_id === me) {
      sheet("Your message", ["Reply", "Delete for both"], 1, (i) => {
        if (i === 0) setReply(m);
        else Alert.alert("Delete this message?", "It's removed for both of you.", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => {
            deleteDm(m.id);
            setMsgs((c) => c.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null, photo_path: null } : x)));
          } },
        ]);
      });
      return;
    }
    sheet(other?.display_name ?? "Message", ["Reply", "Report", "Block"], 2, (i) => {
      if (i === 0) setReply(m);
      else if (i === 1) Alert.alert("Why are you reporting this?", "The message is hidden right away and our team reviews it.", [
        ...REASONS.map((r) => ({
          text: r,
          onPress: () => report("dm_message", m.id, r)
            .then(() => { setMsgs((c) => c.filter((x) => x.id !== m.id)); Alert.alert("Reported", "Thanks. We've hidden it."); })
            .catch((e) => Alert.alert("Report didn't send", e.message)),
        })),
        { text: "Cancel", style: "cancel" as const },
      ]);
      else block();
    });
  };

  const header = (
    <Stack.Screen options={{
      headerTitle: () => (
        <Pressable onPress={() => other && router.push(`/driver/${other.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 8, maxWidth: 240 }}>
          <Avatar name={other?.display_name ?? "?"} photo={other?.avatar_path} size={32} />
          <View style={{ flexShrink: 1 }}>
            <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 15 }} numberOfLines={1}>{other?.display_name ?? "Message"}</Text>
            {!!other?.car_model && <Text style={{ color: t.muted, fontSize: 11.5 }} numberOfLines={1}>{other.car_model}</Text>}
          </View>
        </Pressable>
      ),
      headerRight: () => (
        <Pressable onPress={menu} hitSlop={10}><Ionicons name="ellipsis-horizontal-circle" size={26} color={t.text} /></Pressable>
      ),
    }} />
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}>
      {header}
      {loading ? <ActivityIndicator style={{ flex: 1 }} color={t.muted} /> : (
        <FlatList
          inverted
          data={msgs}
          keyExtractor={(m) => m.id}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ padding: 12, gap: 3, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 30, gap: 10, transform: [{ scaleY: -1 }] }}>
              <Avatar name={other?.display_name ?? "?"} photo={other?.avatar_path} size={84} />
              <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 19, letterSpacing: -0.4 }}>Say hi to {other?.display_name ?? "your crew mate"}</Text>
              <Text style={{ color: t.muted, textAlign: "center", lineHeight: 20 }}>Swap charging spots, plan a drive, or ask how their {other?.car_model || "EV"} is doing.</Text>
            </View>
          }
          renderItem={({ item: m, index }) => {
            const prev = msgs[index + 1];
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            const grouped = !newDay && !!prev && prev.user_id === m.user_id &&
              new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60e3;
            return (
              <View>
                {newDay && (
                  <View style={[s.day, { backgroundColor: t.bg }]}><Text style={{ color: t.muted, fontSize: 11.5, fontWeight: "700" }}>{dayLabel(m.created_at)}</Text></View>
                )}
                <Bubble m={m} mine={m.user_id === me} tight={grouped}
                  replyTo={m.reply_to ? byId.get(m.reply_to) : undefined} replyName={(uid) => nameOf(uid)} onLongPress={() => longPress(m)} />
                {m.id === myLatest && (
                  <Receipt seen={!!seenAt && seenAt >= m.created_at} />
                )}
              </View>
            );
          }}
        />
      )}

      {reply && (
        <View style={[s.replyBar, { backgroundColor: t.bg, borderTopColor: t.line }]}>
          <View style={{ width: 3, alignSelf: "stretch", backgroundColor: CTA, borderRadius: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 12.5 }}>Replying to {nameOf(reply.user_id)}</Text>
            <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>{reply.body ?? "Photo"}</Text>
          </View>
          <Pressable onPress={() => setReply(null)} hitSlop={10}><Ionicons name="close-circle" size={22} color={t.muted} /></Pressable>
        </View>
      )}

      {canSend ? (
        <View style={[s.composer, { backgroundColor: t.bg, borderTopColor: t.line, paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable onPress={sendPhoto} disabled={sending} hitSlop={8} style={[s.iconBtn, { backgroundColor: t.surface }]}>
            <Ionicons name="image" size={20} color={t.text} />
          </Pressable>
          <TextInput value={text} onChangeText={setText} placeholder="Message" placeholderTextColor={t.faint}
            multiline maxLength={2000} style={[s.input, { backgroundColor: t.surface, color: t.text }]} />
          <Pressable onPress={() => send()} disabled={sending || !text.trim()} style={[s.send, { opacity: text.trim() || sending ? 1 : 0.35 }]}>
            {sending ? <ActivityIndicator color={ON_CTA} size="small" /> : <Ionicons name="arrow-up" size={20} color={ON_CTA} />}
          </Pressable>
        </View>
      ) : (
        <View style={[s.locked, { backgroundColor: t.bg, borderTopColor: t.line, paddingBottom: Math.max(insets.bottom, 14) }]}>
          <IconTile name="lock" size={36} />
          <Text style={{ color: t.muted, flex: 1, lineHeight: 19 }}>You're no longer connected, so this chat is read-only. Reconnect from their profile to keep talking.</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function Receipt({ seen }: { seen: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignSelf: "flex-end", alignItems: "center", gap: 3, marginTop: 3, marginRight: 4 }}>
      <Ionicons name={seen ? "checkmark-done" : "checkmark"} size={13} color={seen ? "#B8860B" : t.faint} />
      <Text style={{ color: seen ? t.text : t.faint, fontSize: 11, fontWeight: "700" }}>{seen ? "Seen" : "Sent"}</Text>
    </View>
  );
}

function Bubble({ m, mine, tight, replyTo, replyName, onLongPress }: {
  m: DmMessage; mine: boolean; tight: boolean; replyTo?: DmMessage; replyName: (uid: string) => string; onLongPress: () => void;
}) {
  const t = useTheme();
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const pad = m.photo_path ? { paddingHorizontal: 8 } : null;
  return (
    <View style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start", marginTop: tight ? 0 : 8 }}>
      <Pressable onLongPress={onLongPress} delayLongPress={280}
        style={[s.bubble, mine ? s.mine : [s.theirs, { backgroundColor: t.bg }], m.photo_path ? { padding: 4 } : null]}>
        {replyTo && (
          <View style={[s.quote, { backgroundColor: mine ? "rgba(252,227,138,0.15)" : t.surface }]}>
            <Text style={{ color: mine ? ON_CTA : t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 12 }}>{replyName(replyTo.user_id)}</Text>
            <Text style={{ color: mine ? MY_BUBBLE_TEXT : t.muted, fontSize: 12.5 }} numberOfLines={2}>
              {replyTo.deleted ? "Message deleted" : replyTo.body ?? "Photo"}
            </Text>
          </View>
        )}
        {m.deleted ? (
          <Text style={{ color: mine ? "#aaa" : t.faint, fontStyle: "italic" }}>Message deleted</Text>
        ) : (
          <>
            {m.photo_path && <Image source={{ uri: snapUrl(m.photo_path) }} style={s.photo} contentFit="cover" transition={150} />}
            {!!m.body && <Text style={[{ color: mine ? MY_BUBBLE_TEXT : t.text, fontSize: 15.5, lineHeight: 21 }, pad, m.photo_path ? { paddingTop: 6 } : null]}>{m.body}</Text>}
          </>
        )}
        <Text style={[s.time, { color: mine ? "#999" : t.faint }, pad, m.photo_path ? { paddingBottom: 4 } : null]}>{time}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  day: { alignSelf: "center", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, marginVertical: 10 },
  bubble: { maxWidth: "80%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  mine: { backgroundColor: CTA, borderBottomRightRadius: 6 },
  theirs: { borderBottomLeftRadius: 6 },
  quote: { borderLeftWidth: 3, borderLeftColor: LEMON, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  photo: { width: 230, height: 280, borderRadius: 14 },
  time: { fontSize: 10.5, alignSelf: "flex-end", marginTop: 3 },
  replyBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  locked: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15.5 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: CTA, alignItems: "center", justifyContent: "center" },
});
