import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ensureChargerSaved, getCharger } from "../../lib/chargers";
import { FACILITIES, fetchMyFacilityVotes, saveFacilityVotes } from "../../lib/community";
import { useTheme } from "../../lib/theme";
import { Button } from "../../components/ui";
import type { FacilityKey } from "../../lib/types";

export default function MarkFacilities() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const chargerId = decodeURIComponent(String(id));
  const [votes, setVotes] = useState<Partial<Record<FacilityKey, boolean>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchMyFacilityVotes(chargerId).then(setVotes); }, [chargerId]);

  const save = async () => {
    setBusy(true);
    try {
      const c = await getCharger(chargerId);
      if (c) await ensureChargerSaved(c);
      await saveFacilityVotes(chargerId, votes);
      router.back();
    } catch (e: any) {
      Alert.alert("Facilities didn't save", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={{ color: t.muted, lineHeight: 20 }}>Mark only what you saw yourself. A facility shows on the page once more drivers agree than disagree.</Text>
      {FACILITIES.map((f) => {
        const v = votes[f.key];
        return (
          <View key={f.key} style={[styles.row, { borderColor: t.line }]}>
            <Ionicons name={f.icon as any} size={20} color={t.text} />
            <Text style={{ color: t.text, flex: 1, fontSize: 15 }}>{f.label}</Text>
            <Pressable onPress={() => setVotes((x) => ({ ...x, [f.key]: true }))} accessibilityLabel={`${f.label}: yes`}
              style={[styles.pill, { borderColor: v === true ? t.good : t.line, backgroundColor: v === true ? t.goodSoft : "transparent" }]}>
              <Text style={{ color: v === true ? t.good : t.muted, fontWeight: "700" }}>Yes</Text>
            </Pressable>
            <Pressable onPress={() => setVotes((x) => ({ ...x, [f.key]: false }))} accessibilityLabel={`${f.label}: no`}
              style={[styles.pill, { borderColor: v === false ? t.bad : t.line, backgroundColor: v === false ? t.badSoft : "transparent" }]}>
              <Text style={{ color: v === false ? t.bad : t.muted, fontWeight: "700" }}>No</Text>
            </Pressable>
          </View>
        );
      })}
      <Button title="Save facilities" kind="primary" busy={busy} onPress={save} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  pill: { height: 36, minWidth: 54, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
