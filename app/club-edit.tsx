import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { CLUB_COLORS, NO_RULES, createClub, deleteClub, fetchClub, updateClub, type ClubDraft } from "../lib/clubs";
import { PERSONALITIES } from "../lib/personality";
import { SCALES, LIFESTYLE } from "../lib/traits";
import { tickHaptic } from "../lib/motion";
import { ClubBadge } from "../components/ClubBadge";
import { CLUB_ICONS, Icon, clubIconName } from "../components/Icon";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";

/** Start a club, or edit one you run. */
export default function ClubEdit() {
  const t = useTheme();
  const { session, profile } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const [d, setD] = useState<ClubDraft>({ name: "", description: "", city: profile?.city ?? "", emoji: "i:bolt", color: LEMON, is_private: false, ...NO_RULES });
  const [rulesOpen, setRulesOpen] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [createdBy, setCreatedBy] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchClub(id).then((c) => {
      if (c) {
        setD({ name: c.name, description: c.description ?? "", city: c.city ?? "", emoji: c.emoji ?? "i:bolt", color: c.color ?? LEMON, is_private: !!c.is_private,
          req_min_profile: c.req_min_profile ?? 0, req_personalities: c.req_personalities ?? [], req_traits: c.req_traits ?? [], req_same_city: !!c.req_same_city });
        if (c.req_min_profile || c.req_personalities?.length || c.req_traits?.length || c.req_same_city) setRulesOpen(true);
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
          <Text style={{ color: t.text, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 20, textAlign: "center", letterSpacing: -0.6 }} numberOfLines={2}>{d.name || "Your club"}</Text>
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
            {CLUB_ICONS.map((n) => `i:${n}`).map((e) => (
              <Pressable key={e} onPress={() => set({ emoji: e })} style={[s.emoji, { backgroundColor: d.emoji === e ? CTA : t.surface }]}>
                <Icon name={clubIconName(e)!} size={22} color={d.emoji === e ? ON_CTA : t.text} />
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

        {/* Who can join: the club's door policy */}
        <Pressable onPress={() => setRulesOpen((o) => !o)} style={[s.toggle, { backgroundColor: t.surface }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Who can join</Text>
            <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }}>
              {d.req_min_profile || d.req_personalities?.length || d.req_traits?.length || d.req_same_city
                ? [d.req_min_profile ? `${d.req_min_profile}%+ profile` : null, d.req_personalities?.length ? `${d.req_personalities.length} personalit${d.req_personalities.length > 1 ? "ies" : "y"}` : null,
                   d.req_traits?.length ? `${d.req_traits.length} vibe${d.req_traits.length > 1 ? "s" : ""}` : null, d.req_same_city ? `${d.city || "same city"} only` : null].filter(Boolean).join(" · ")
                : "Anyone. Tap to set rules by profile, personality, vibe or city."}
            </Text>
          </View>
          <Text style={{ color: t.text, fontSize: 18 }}>{rulesOpen ? "−" : "+"}</Text>
        </Pressable>
        {rulesOpen && (
          <View style={{ gap: 14, paddingHorizontal: 4 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ color: t.text, fontWeight: "800" }}>Profile complete at least</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {[0, 40, 60, 80, 100].map((n) => (
                  <Pressable key={n} onPress={() => { tickHaptic(); set({ req_min_profile: n }); }} style={[s.rule, { backgroundColor: d.req_min_profile === n ? CTA : t.surface }]}>
                    <Text style={{ color: d.req_min_profile === n ? ON_CTA : t.text, fontWeight: "800" }}>{n === 0 ? "Any" : `${n}%`}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ color: t.faint, fontSize: 12 }}>Keeps out empty, fake-looking profiles. 60% means a photo, car, city and a few more.</Text>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ color: t.text, fontWeight: "800" }}>EV personalities welcome <Text style={{ color: t.muted, fontWeight: "500" }}>(none = all)</Text></Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {PERSONALITIES.map((pp) => {
                  const on = d.req_personalities?.includes(pp.id);
                  return (
                    <Pressable key={pp.id} onPress={() => { tickHaptic(); set({ req_personalities: on ? d.req_personalities!.filter((x) => x !== pp.id) : [...(d.req_personalities ?? []), pp.id] }); }}
                      style={[s.chipR, { backgroundColor: on ? pp.color : t.surface }]}>
                      <Text>{pp.emoji}</Text><Text style={{ color: on ? pp.ink : t.text, fontWeight: "700", fontSize: 13 }}>{pp.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ color: t.text, fontWeight: "800" }}>Vibes <Text style={{ color: t.muted, fontWeight: "500" }}>(members need at least one)</Text></Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {[...SCALES.flatMap((x) => x.options), ...LIFESTYLE].map((tr) => {
                  const on = d.req_traits?.includes(tr.id);
                  return (
                    <Pressable key={tr.id} onPress={() => { tickHaptic(); set({ req_traits: on ? d.req_traits!.filter((x) => x !== tr.id) : [...(d.req_traits ?? []), tr.id] }); }}
                      style={[s.chipR, { backgroundColor: on ? CTA : t.surface }]}>
                      <Text>{tr.emoji}</Text><Text style={{ color: on ? ON_CTA : t.text, fontWeight: "700", fontSize: 13 }}>{tr.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={[s.toggle, { backgroundColor: t.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "800" }}>Only drivers in {d.city || "this city"}</Text>
                <Text style={{ color: t.muted, fontSize: 12.5, marginTop: 2 }}>Matches the city on their profile.</Text>
              </View>
              <Switch value={!!d.req_same_city} onValueChange={(v) => set({ req_same_city: v })} disabled={!d.city?.trim()} />
            </View>
          </View>
        )}

        {editing && createdBy === session?.user.id && (
          <Pressable onPress={remove} style={{ alignItems: "center", padding: 12 }}>
            <Text style={{ color: t.bad, fontWeight: "700" }}>Delete club</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={[s.footer, { backgroundColor: t.bg, borderTopColor: t.line }]}>
        <Pressable onPress={save} disabled={busy} style={({ pressed }) => [s.save, { opacity: ok ? 1 : 0.5, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
          {busy ? <ActivityIndicator color={ON_CTA} /> : <Text style={s.saveText}>{editing ? "Save changes" : "Create club"}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children, t }: { label: string; children: React.ReactNode; t: ReturnType<typeof useTheme> }) {
  return <View style={{ gap: 8 }}><Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 14 }}>{label}</Text>{children}</View>;
}

const s = StyleSheet.create({
  rule: { flex: 1, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  chipR: { flexDirection: "row", alignItems: "center", gap: 5, height: 36, paddingHorizontal: 11, borderRadius: 18 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  emoji: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  color: { width: 40, height: 40, borderRadius: 20, borderWidth: 3 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 30, borderTopWidth: StyleSheet.hairlineWidth },
  save: { backgroundColor: CTA, height: 54, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  saveText: { color: ON_CTA, fontSize: 17, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
});
