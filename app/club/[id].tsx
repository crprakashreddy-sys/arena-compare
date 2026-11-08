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
import { snapUrl, supabase } from "../../lib/supabase";
import { blockUser, isBlocked, report, uploadSnap } from "../../lib/community";
import {
  deleteMessage, fetchMessage, fetchMessages, joinClub, leaveClub, markRead, myRole, sendMessage, setMuted, subscribeClub,
  type Club, type ClubMessage,
} from "../../lib/clubs";
import { ClubBadge } from "../../components/ClubBadge";
import { Avatar } from "../../components/ui";
import { IssuesBoard } from "../../components/IssuesBoard";
import { EventsList } from "../../components/EventsList";
import { IconTile } from "../../components/Icon";
import * as Clipboard from "expo-clipboard";
import { MessageMenu, ReactionChips, type MenuAction } from "../../components/MessageMenu";
import { fetchReactions, pinMessage, subscribeReactions, toggleReaction, type Reaction, type ReactionMap } from "../../lib/clubs";

const INK = "#1A1A1A";
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

/** A club's group chat: live messages, photos, replies, report and block. */
export default function ClubChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const clubId = decodeURIComponent(id ?? "");
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const me = session?.user.id;

  const [club, setClub] = useState<Club | null>(null);
  const [member, setMember] = useState<boolean | null>(null);
  const [msgs, setMsgs] = useState<ClubMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(true);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<ClubMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [tab, setTab] = useState<"chat" | "issues" | "events">("chat");
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [menu, setMenu] = useState<ClubMessage | null>(null);
  const [pinned, setPinned] = useState<ClubMessage | null>(null);

  const byId = useMemo(() => new Map(msgs.map((m) => [m.id, m])), [msgs]);

  useEffect(() => {
    supabase.from("club_stats").select("*").eq("id", clubId).maybeSingle().then(({ data }) => setClub(data as any));
    if (!me) { setMember(false); setLoading(false); return; }
    myRole(clubId, me).then((r) => { setMember(!!r); setAdmin(r === "admin"); });
    supabase.from("club_members").select("muted").eq("club_id", clubId).eq("user_id", me).maybeSingle()
      .then(({ data }) => setMutedState(!!data?.muted));
  }, [clubId, me]);

  useEffect(() => {
    if (!member || !me) return;
    let alive = true;
    fetchMessages(clubId).then((m) => {
      if (!alive) return;
      setMsgs(m); setOlder(m.length === 50); setLoading(false);
      fetchReactions(m.map((x) => x.id)).then((r) => alive && setReactions(r));
    });
    const offR = subscribeReactions(async (mid) => {
      const r = await fetchReactions([mid]);
      if (alive) setReactions((cur) => ({ ...cur, [mid]: r[mid] ?? {} }));
    });
    markRead(clubId, me);
    const off = subscribeClub(
      clubId,
      async (newId) => {
        const m = await fetchMessage(newId);
        if (!m || !alive || isBlocked(m.user_id)) return;
        setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [m, ...cur]));
        markRead(clubId, me);
      },
      async (chId) => {
        const m = await fetchMessage(chId);
        if (!alive) return;
        setMsgs((cur) => (m ? cur.map((x) => (x.id === chId ? m : x)) : cur.filter((x) => x.id !== chId)));
      },
    );
    return () => { alive = false; off(); offR(); markRead(clubId, me); };
  }, [member, clubId, me]);

  const loadOlder = async () => {
    if (!older || !msgs.length) return;
    const more = await fetchMessages(clubId, msgs[msgs.length - 1].created_at);
    setOlder(more.length === 50);
    setMsgs((cur) => [...cur, ...more.filter((m) => !cur.some((x) => x.id === m.id))]);
    fetchReactions(more.map((x) => x.id)).then((r) => setReactions((cur) => ({ ...cur, ...r })));
  };

  const send = async (photoPath: string | null = null) => {
    if (!me) return;
    if (!profile) return router.push("/login");
    if (!text.trim() && !photoPath) return;
    setSending(true);
    try {
      const m = await sendMessage(clubId, me, text, photoPath, reply?.id ?? null);
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

  const join = async () => {
    if (!me) return router.push("/login");
    try { await joinClub(clubId, me); setMember(true); }
    catch (e: any) { Alert.alert("Couldn't join", e.message); }
  };

  const menu = () => {
    const opts = [
      { label: "Club info & members", run: () => router.push(`/club-members/${encodeURIComponent(clubId)}`) },
      ...(admin && club?.kind === "custom" ? [{ label: "Edit club", run: () => router.push({ pathname: "/club-edit", params: { id: clubId } }) }] : []),
      { label: muted ? "Unmute" : "Mute", run: async () => { if (me) { await setMuted(clubId, me, !muted); setMutedState(!muted); } } },
      { label: "Leave club", run: async () => { if (me) { await leaveClub(clubId, me); router.back(); } } },
    ];
    sheet(club?.name ?? "Club", opts.map((o) => o.label), opts.length - 1, (i) => opts[i].run());
  };

  const longPress = (m: ClubMessage) => { if (!m.deleted) setMenu(m); };

  // Pinned message banner.
  useEffect(() => {
    const pid = club?.pinned_message_id;
    if (!pid || !member) { setPinned(null); return; }
    const local = msgs.find((x) => x.id === pid);
    if (local) setPinned(local); else fetchMessage(pid).then(setPinned);
  }, [club?.pinned_message_id, member]);

  const myReacts = (mid: string) => new Set((Object.keys(reactions[mid] ?? {}) as Reaction[]).filter((r) => reactions[mid]?.[r]?.includes(me ?? "")));
  const react = (mid: string, r: Reaction) => {
    if (!me) return;
    const on = !myReacts(mid).has(r);
    setReactions((cur) => {
      const m = { ...(cur[mid] ?? {}) };
      const list = (m[r] ?? []).filter((u) => u !== me);
      m[r] = on ? [...list, me] : list;
      return { ...cur, [mid]: m };
    });
    toggleReaction(mid, me, r, on).catch(() => {});
  };
  const removeMsg = (m: ClubMessage) => {
    deleteMessage(m.id);
    setMsgs((c) => c.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null, photo_path: null } : x)));
  };
  const menuActions = (m: ClubMessage): MenuAction[] => {
    const mine = m.user_id === me;
    const name = m.profiles?.display_name ?? "this driver";
    const isPinned = club?.pinned_message_id === m.id;
    return [
      { label: "Reply", icon: "arrow-undo", run: () => setReply(m) },
      ...(m.body ? [{ label: "Copy", icon: "copy-outline", run: () => Clipboard.setStringAsync(m.body!) }] : []),
      ...(admin ? [{ label: isPinned ? "Unpin" : "Pin for everyone", icon: isPinned ? "pin-outline" : "pin", run: async () => {
        try { await pinMessage(clubId, isPinned ? null : m.id); setClub((c) => (c ? { ...c, pinned_message_id: isPinned ? null : m.id } : c)); }
        catch (e: any) { Alert.alert("Couldn't pin", e.message); }
      } }] : []),
      ...(mine ? [{ label: "Delete", icon: "trash-outline", destructive: true, run: () => Alert.alert("Delete this message?", undefined, [
        { text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => removeMsg(m) }]) }] : []),
      ...(!mine && admin ? [{ label: "Remove (admin)", icon: "trash-outline", destructive: true, run: () => removeMsg(m) }] : []),
      ...(!mine ? [
        { label: "Report", icon: "flag-outline", destructive: true, run: () => otherActions(m, name, 1) },
        { label: `Block ${name}`, icon: "ban", destructive: true, run: () => otherActions(m, name, 2) },
      ] : []),
    ];
  };

  const otherActions = (m: ClubMessage, name: string, i: number) => {
    {
      if (i === 0) return;
      else if (i === 1) Alert.alert("Why are you reporting this?", undefined, [
        ...REASONS.map((r) => ({
          text: r,
          onPress: () => report("club_message", m.id, r)
            .then(() => Alert.alert("Reported", "Thanks. Messages reported by several people are hidden automatically."))
            .catch((e) => Alert.alert("Report didn't send", e.message)),
        })),
        { text: "Cancel", style: "cancel" as const },
      ]);
      else Alert.alert(`Block ${name}?`, "You won't see their messages, zings or reviews.", [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: async () => { await blockUser(m.user_id); setMsgs((c) => c.filter((x) => x.user_id !== m.user_id)); } },
      ]);
    }
  };

  const header = (
    <Stack.Screen options={{
      headerTitle: () => (
        <Pressable onPress={() => member && router.push(`/club-members/${encodeURIComponent(clubId)}`)}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, maxWidth: 240 }}>
          {club && <ClubBadge c={club} size={30} />}
          <View style={{ flexShrink: 1 }}>
            <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 15 }} numberOfLines={1}>{club?.name ?? "Club"}</Text>
            {club && <Text style={{ color: t.muted, fontSize: 11.5 }}>{club.members} members{muted ? " · muted" : ""}</Text>}
          </View>
        </Pressable>
      ),
      headerRight: () => member ? (
        <Pressable onPress={menu} hitSlop={10}><Ionicons name="ellipsis-horizontal-circle" size={26} color={t.text} /></Pressable>
      ) : null,
    }} />
  );

  if (member === false) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 }}>
        {header}
        {club && <ClubBadge c={club} size={84} />}
        <Text style={{ color: t.text, fontSize: 24, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", textAlign: "center", letterSpacing: -0.6 }}>{club?.name}</Text>
        <Text style={{ color: t.muted, textAlign: "center", lineHeight: 20 }}>
          {club?.description || `${club?.members ?? 0} drivers swapping fixes, charging tips and drive plans.`}
        </Text>
        <Pressable onPress={join} style={s.bigBtn}><Text style={s.bigBtnText}>{me ? "Join the club" : "Sign in to join"}</Text></Pressable>
      </View>
    );
  }

  const tabs = (
    <View style={[s.tabs, { backgroundColor: t.bg, borderBottomColor: t.line }]}>
      {(["chat", "issues", "events"] as const).map((k) => (
        <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && { backgroundColor: CTA }]}>
          <Ionicons name={k === "chat" ? "chatbubbles" : k === "issues" ? "construct" : "calendar"} size={15} color={tab === k ? ON_CTA : t.muted} />
          <Text style={{ color: tab === k ? ON_CTA : t.muted, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{k === "chat" ? "Chat" : k === "issues" ? "Issues" : "Events"}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (tab !== "chat" && member) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {header}
        {tabs}
        {tab === "issues" ? <IssuesBoard clubId={clubId} /> : <EventsList clubId={clubId} />}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}>
      {header}
      {member && tabs}
      {pinned && !pinned.deleted && (
        <Pressable onLongPress={() => admin && Alert.alert("Unpin this message?", undefined, [{ text: "Cancel", style: "cancel" },
            { text: "Unpin", onPress: () => pinMessage(clubId, null).then(() => setClub((c) => (c ? { ...c, pinned_message_id: null } : c))) }])}
          style={[s.pin, { backgroundColor: t.bg, borderBottomColor: t.line }]}>
          <View style={s.pinIcon}><Ionicons name="pin" size={14} color={INK} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.muted, fontSize: 11.5, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: 0.5 }}>PINNED</Text>
            <Text style={{ color: t.text, fontSize: 14 }} numberOfLines={2}>{pinned.body ?? "Photo"}</Text>
          </View>
        </Pressable>
      )}
      <MessageMenu visible={!!menu} onClose={() => setMenu(null)} mine={menu?.user_id === me}
        preview={menu ? (menu.body ?? "Photo") : ""} picked={menu ? [...myReacts(menu.id)] : []}
        onReact={(r) => menu && react(menu.id, r)} actions={menu ? menuActions(menu) : []} />
      {loading || member === null ? <ActivityIndicator style={{ flex: 1 }} color={t.muted} /> : (
        <FlatList
          inverted
          data={msgs}
          keyExtractor={(m) => m.id}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ padding: 12, gap: 4, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 30, gap: 8, transform: [{ scaleY: -1 }] }}>
              <IconTile name="chat" size={64} />
              <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17 }}>Be the first to say hi</Text>
              <Text style={{ color: t.muted, textAlign: "center" }}>Ask about range, charging, service, accessories, or plan a drive.</Text>
            </View>
          }
          renderItem={({ item: m, index }) => {
            const prev = msgs[index + 1]; // the older message shown just above
            const grouped = !!prev && prev.user_id === m.user_id &&
              new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60e3;
            const mine = m.user_id === me;
            return (
              <View>
                <Bubble m={m} mine={mine} showName={!grouped}
                  replyTo={m.reply_to ? byId.get(m.reply_to) : undefined} onLongPress={() => longPress(m)} onDoubleTap={() => react(m.id, "⚡")} />
                <View style={{ paddingLeft: mine ? 0 : 36 }}>
                  <ReactionChips counts={reactions[m.id]} mine={myReacts(m.id)} onToggle={(r) => react(m.id, r)} alignEnd={mine} />
                </View>
              </View>
            );
          }}
        />
      )}

      {reply && (
        <View style={[s.replyBar, { backgroundColor: t.bg, borderTopColor: t.line }]}>
          <View style={{ width: 3, alignSelf: "stretch", backgroundColor: CTA, borderRadius: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 12.5 }}>Replying to {reply.profiles?.display_name ?? "driver"}</Text>
            <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>{reply.body ?? "Photo"}</Text>
          </View>
          <Pressable onPress={() => setReply(null)} hitSlop={10}><Ionicons name="close-circle" size={22} color={t.muted} /></Pressable>
        </View>
      )}

      <View style={[s.composer, { backgroundColor: t.bg, borderTopColor: t.line, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable onPress={sendPhoto} disabled={sending} hitSlop={8} style={[s.iconBtn, { backgroundColor: t.surface }]}>
          <Ionicons name="image" size={20} color={t.text} />
        </Pressable>
        <TextInput value={text} onChangeText={setText} placeholder="Message the club" placeholderTextColor={t.faint}
          multiline maxLength={2000} style={[s.input, { backgroundColor: t.surface, color: t.text }]} />
        <Pressable onPress={() => send()} disabled={sending || !text.trim()} style={[s.send, { opacity: text.trim() || sending ? 1 : 0.35 }]}>
          {sending ? <ActivityIndicator color={ON_CTA} size="small" /> : <Ionicons name="arrow-up" size={20} color={ON_CTA} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, mine, showName, replyTo, onLongPress, onDoubleTap }: {
  m: ClubMessage; mine: boolean; showName: boolean; replyTo?: ClubMessage; onLongPress: () => void; onDoubleTap?: () => void;
}) {
  const lastTap = React.useRef(0);
  const tap = () => { const n = Date.now(); if (n - lastTap.current < 280) onDoubleTap?.(); lastTap.current = n; };
  const t = useTheme();
  const name = m.profiles?.display_name ?? "Driver";
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const pad = m.photo_path ? { paddingHorizontal: 8 } : null;
  return (
    <View style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start", gap: 6, marginTop: showName ? 8 : 0 }}>
      {!mine && <View style={{ width: 30 }}>{showName && <Avatar name={name} photo={m.profiles?.avatar_path} size={30} />}</View>}
      <Pressable onPress={tap} onLongPress={onLongPress} delayLongPress={280}
        style={[s.bubble, mine ? s.mine : [s.theirs, { backgroundColor: t.bg }], m.photo_path ? { padding: 4 } : null]}>
        {!mine && showName && (
          <Text style={[s.name, pad, m.photo_path ? { paddingTop: 4 } : null]} numberOfLines={1}>
            {name}{m.profiles?.car_model ? <Text style={{ color: t.muted, fontWeight: "500" }}>{`  · ${m.profiles.car_model}`}</Text> : null}
          </Text>
        )}
        {replyTo && (
          <View style={[s.quote, { backgroundColor: mine ? "rgba(252,227,138,0.15)" : t.surface }]}>
            <Text style={{ color: mine ? ON_CTA : t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 12 }}>{replyTo.profiles?.display_name ?? "Driver"}</Text>
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
  pin: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  pinIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: LEMON, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: 999 },
  bubble: { maxWidth: "78%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  mine: { backgroundColor: CTA, borderBottomRightRadius: 6 },
  theirs: { borderBottomLeftRadius: 6 },
  name: { fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 12.5, color: "#B8860B", marginBottom: 2 },
  quote: { borderLeftWidth: 3, borderLeftColor: LEMON, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  photo: { width: 230, height: 280, borderRadius: 14 },
  time: { fontSize: 10.5, alignSelf: "flex-end", marginTop: 3 },
  replyBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15.5 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: CTA, alignItems: "center", justifyContent: "center" },
  bigBtn: { backgroundColor: CTA, paddingHorizontal: 28, height: 54, borderRadius: 999, justifyContent: "center", marginTop: 10 },
  bigBtnText: { color: ON_CTA, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 16 },
});
