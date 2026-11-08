import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { CLUB_COLORS, CLUB_EMOJIS, createClub, deleteClub, fetchClub, updateClub, type ClubDraft } from "../lib/clubs";
import { ClubBadge } from "../components/ClubBadge";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";

/** Start a club, or edit one you run. */
export default function ClubEdit() {
  const t = useTheme();
  const { session, profile } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const [d, setD] = useState<ClubDraft>({ name: "", description: "", city: profile?.city ?? "", emoji: "⚡", color: LEMON, is_private: false });
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [createdBy, setCreatedBy] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchClub(id).then((c) => {
      if (c) {
        setD({ name: c.name, description: c.description ?? "", city: c.city ?? "", emoji: c.emoji ?? "⚡", color: c.color ?? LEMON, is_private: !!c.is_private });
        setCreatedBy(c.created_by ?? null);
      }
      setLoading(false);
    });
  }, [id]);

  const set = (patch: Partial<ClubDraft>) => setD((v) => ({ ...v, ...patch }));
  const ok = d.name.trim().length >= 3;

  const save = async () => {
    if (!session || !profile) return router.push("/login");
    if (!ok) return Alert.alert("Name your club", "Use at least 3 characters.");
    setBusy(true);
    try {
      if (editing) { await updateClub(id!, d); router.back(); }
      else { const newId = await createClub(d, session.user.id); router.replace(`/club/${encodeURIComponent(newId)}`); }
    } catch (e: any) { Alert.alert("Couldn't save", e.message); setBusy(false); }
  };

  const remove = () => Alert.alert("Delete this club?", "All its messages go too. This can't be undone.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete club", style: "destructive", onPress: async () => {
      try { await deleteClub(id!); router.dismissAll(); router.replace("/clubs"); }
      catch (e: any) { Alert.alert("Couldn't delete", e.message); }
    } },
  ]);

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: t.bg }} />;
  const input = [s.input, { backgroundColor: t.surface, color: t.text }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: editing ? "Edit club" : "New club" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", gap: 10, paddingVertical: 6 }}>
          <ClubBadge c={{ kind: "custom", make: "", emoji: d.emoji, color: d.color }} size={88} />
          <Text style={{ color: t.text, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 20, textAlign: "center" }} numberOfLines={2}>{d.name || "Your club"}</Text>
        </View>

        <Field label="Club name" t={t}>
          <TextInput value={d.name} onChangeText={(name) => set({ name })} placeholder="e.g. Hyderabad EV Road Trippers"
            placeholderTextColor={t.faint} style={input} maxLength={50} />
        </Field>

        <Field label="What's it about?" t={t}>
          <TextInput value={d.description} onChangeText={(description) => set({ description })} multiline
            placeholder="Weekend drives, charging tips, chai meetups…" placeholderTextColor={t.faint}
            style={[input, { minHeight: 90, textAlignVertical: "top" }]} maxLength={400} />
        </Field>

        <Field label="City (optional)" t={t}>
          <TextInput value={d.city} onChangeText={(city) => set({ city })} placeholder="Hyderabad" placeholderTextColor={t.faint} style={input} maxLength={40} />
        </Field>

        <Field label="Icon" t={t}>
          <View style={s.wrap}>
            {CLUB_EMOJIS.map((e) => (
              <Pressable key={e} onPress={() => set({ emoji: e })} style={[s.emoji, { backgroundColor: d.emoji === e ? INK : t.surface }]}>
                <Text style={{ fontSize: 22 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="Colour" t={t}>
          <View style={s.wrap}>
            {CLUB_COLORS.map((c) => (
              <Pressable key={c} onPress={() => set({ color: c })}
                style={[s.color, { backgroundColor: c, borderColor: d.color === c ? t.text : "transparent" }]} />
            ))}
          </View>
        </Field>

        <View style={[s.toggle, { backgroundColor: t.surface }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Invite only</Text>
            <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }}>Hidden from Discover. People join with your invite code.</Text>
          </View>
          <Switch value={d.is_private} onValueChange={(is_private) => set({ is_private })} />
        </View>

        {editing && createdBy === session?.user.id && (
          <Pressable onPress={remove} style={{ alignItems: "center", padding: 12 }}>
            <Text style={{ color: t.bad, fontWeight: "700" }}>Delete club</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={[s.footer, { backgroundColor: t.bg, borderTopColor: t.line }]}>
        <Pressable onPress={save} disabled={busy} style={({ pressed }) => [s.save, { opacity: ok ? 1 : 0.5, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
          {busy ? <ActivityIndicator color={LEMON} /> : <Text style={s.saveText}>{editing ? "Save changes" : "Create club"}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children, t }: { label: string; children: React.ReactNode; t: ReturnType<typeof useTheme> }) {
  return <View style={{ gap: 8 }}><Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 14 }}>{label}</Text>{children}</View>;
}

const s = StyleSheet.create({
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  emoji: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  color: { width: 40, height: 40, borderRadius: 20, borderWidth: 3 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 30, borderTopWidth: StyleSheet.hairlineWidth },
  save: { backgroundColor: INK, height: 54, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  saveText: { color: LEMON, fontSize: 17, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
});
