import React, { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { snapUrl } from "../lib/supabase";
import { ISSUE_TAGS, createIssue } from "../lib/issues";
import { pickAndUploadPhoto } from "../lib/photos";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";

/** Ask the club about a problem. */
export default function NewIssue() {
  const t = useTheme();
  const { session } = useAuth();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const ok = title.trim().length >= 5;

  const addPhoto = async () => {
    setUploading(true);
    try { const p = await pickAndUploadPhoto(); if (p) setPhoto(p); }
    catch (e: any) { Alert.alert("Photo didn't upload", e?.message ?? "Try again."); }
    setUploading(false);
  };

  const post = async () => {
    if (!session) return router.push("/login");
    if (!ok) return Alert.alert("Add a title", "Say what's wrong in a few words, e.g. \"Charging stops at 80% on DC\".");
    setBusy(true);
    try {
      const id = await createIssue(clubId!, session.user.id, title, body, tags, photo);
      router.replace(`/issue/${id}`);
    } catch (e: any) { Alert.alert("Couldn't post", e.message); setBusy(false); }
  };

  const input = [s.input, { backgroundColor: t.surface, color: t.text }];
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "Ask the club" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <TextInput value={title} onChangeText={setTitle} placeholder="What's the problem?" placeholderTextColor={t.faint}
          style={[input, { fontSize: 18, fontWeight: "700" }]} maxLength={120} autoFocus />
        <TextInput value={body} onChangeText={setBody} multiline placeholder={"Details help: when it happens, which charger or software version, what you've tried."}
          placeholderTextColor={t.faint} style={[input, { minHeight: 140, textAlignVertical: "top" }]} maxLength={4000} />

        <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Topic</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {ISSUE_TAGS.map((x) => {
            const on = tags.includes(x.key);
            return (
              <Pressable key={x.key} onPress={() => setTags((v) => (on ? v.filter((k) => k !== x.key) : [...v, x.key].slice(-3)))}
                style={[s.chip, { backgroundColor: on ? CTA : t.surface }]}>
                <Ionicons name={x.icon as any} size={14} color={on ? ON_CTA : t.text} />
                <Text style={{ color: on ? ON_CTA : t.text, fontWeight: "700", fontSize: 13.5 }}>{x.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {photo ? (
          <View>
            <Image source={{ uri: snapUrl(photo) }} style={{ width: "100%", height: 220, borderRadius: 14 }} contentFit="cover" />
            <Pressable onPress={() => setPhoto(null)} style={s.remove}><Ionicons name="close" size={18} color="#fff" /></Pressable>
          </View>
        ) : (
          <Pressable onPress={addPhoto} disabled={uploading} style={[s.photoBtn, { borderColor: t.line }]}>
            {uploading ? <ActivityIndicator color={t.muted} /> : <Ionicons name="image-outline" size={20} color={t.muted} />}
            <Text style={{ color: t.muted, fontWeight: "700" }}>Add a photo (error screen, dashboard…)</Text>
          </Pressable>
        )}
      </ScrollView>
      <View style={[s.footer, { backgroundColor: t.bg, borderTopColor: t.line }]}>
        <Pressable onPress={post} disabled={busy || uploading} style={[s.save, { opacity: ok ? 1 : 0.5 }]}>
          {busy ? <ActivityIndicator color={ON_CTA} /> : <Text style={s.saveText}>Post to the club</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  photoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 56, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" },
  remove: { position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 30, borderTopWidth: StyleSheet.hairlineWidth },
  save: { backgroundColor: CTA, height: 54, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  saveText: { color: ON_CTA, fontSize: 17, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
});
