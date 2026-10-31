import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ensureChargerSaved, getCharger } from "../../lib/chargers";
import { REVIEW_TAGS, fetchMyReview, saveReview } from "../../lib/community";
import { useTheme } from "../../lib/theme";
import { Button, Chip, Stars } from "../../components/ui";

export default function WriteReview() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const chargerId = decodeURIComponent(String(id));
  const [name, setName] = useState("");
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCharger(chargerId).then((c) => setName(c?.name ?? ""));
    fetchMyReview(chargerId).then((r) => {
      if (!r) return;
      setRating(r.rating); setTags(r.tags); setBody(r.body ?? "");
    });
  }, [chargerId]);

  const save = async () => {
    if (!rating) return Alert.alert("Add a rating", "Tap the stars to rate this charger.");
    setBusy(true);
    try {
      const c = await getCharger(chargerId);
      if (c) await ensureChargerSaved(c);
      await saveReview(chargerId, rating, tags, body);
      router.back();
    } catch (e: any) {
      Alert.alert("Review didn't save", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: t.muted }}>{name}</Text>
        <View style={{ alignItems: "center", gap: 6 }}>
          <Stars value={rating} size={38} onChange={setRating} />
          <Text style={{ color: t.muted }}>{["Tap to rate", "Poor", "Fair", "Good", "Very good", "Excellent"][rating]}</Text>
        </View>
        <Text style={{ color: t.muted, fontWeight: "600", fontSize: 13 }}>What stood out?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {REVIEW_TAGS.map((tag) => (
            <Chip key={tag} label={tag} on={tags.includes(tag)}
              onPress={() => setTags((x) => (x.includes(tag) ? x.filter((y) => y !== tag) : [...x, tag]))} />
          ))}
        </View>
        <Text style={{ color: t.muted, fontWeight: "600", fontSize: 13 }}>Tip for other drivers (optional)</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Which gun is faster, best time to come, where to wait…"
          placeholderTextColor={t.faint}
          multiline
          maxLength={600}
          style={{ minHeight: 110, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, color: t.text, fontSize: 15, textAlignVertical: "top" }}
        />
        <Button title="Post review" kind="primary" busy={busy} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
