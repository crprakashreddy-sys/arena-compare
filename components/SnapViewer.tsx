import React, { useState } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { snapUrl } from "../lib/supabase";
import { timeAgo } from "../lib/geo";
import { STATUS_LABEL } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { deleteCheckin, issueLabel } from "../lib/community";
import { openSafetyMenu } from "./SafetyMenu";
import { ScoreChip } from "./ZapScore";
import type { Checkin } from "../lib/types";

/** Full-screen zap story viewer. Tap the right side for next, the left for previous. */
export default function SnapViewer({ snaps, start, onClose, onChanged }: {
  snaps: Checkin[]; start: number; onClose: () => void; onChanged?: () => void;
}) {
  const [i, setI] = useState(start);
  const { width, height } = useWindowDimensions();
  const { session } = useAuth();
  const s = snaps[i];
  if (!s) return null;
  const mine = session?.user.id === s.user_id;
  const name = s.profiles?.display_name ?? "Driver";

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {s.photo_path && (
          <Image source={{ uri: snapUrl(s.photo_path) }} style={{ width, height }} contentFit="contain" transition={150} />
        )}

        <View style={{ position: "absolute", top: 54, left: 12, right: 12, gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {snaps.map((_, j) => (
              <View key={j} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: j <= i ? "#fff" : "rgba(255,255,255,0.35)" }} />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable onPress={() => { onClose(); router.push(`/driver/${s.user_id}`); }} style={{ flexShrink: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{name}</Text>
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12.5 }}>
                {[s.profiles?.car_model, STATUS_LABEL[s.status], issueLabel(s.issue), timeAgo(s.created_at)].filter(Boolean).join(" · ")}
              </Text>
              <View style={{ marginTop: 6 }}><ScoreChip points={s.zap_score} distanceM={s.distance_m} /></View>
            </Pressable>
            <View style={{ flexDirection: "row", gap: 18 }}>
              {mine ? (
                <Pressable accessibilityLabel="Delete my zap" hitSlop={10}
                  onPress={async () => { await deleteCheckin(s); onChanged?.(); onClose(); }}>
                  <Ionicons name="trash-outline" size={24} color="#fff" />
                </Pressable>
              ) : (
                <Pressable accessibilityLabel="Report or block" hitSlop={10}
                  onPress={() => openSafetyMenu({ kind: "checkin", targetId: s.id, userId: s.user_id, userName: name, onDone: () => { onChanged?.(); onClose(); } })}>
                  <Ionicons name="flag-outline" size={23} color="#fff" />
                </Pressable>
              )}
              <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>

        {s.note ? (
          <View style={{ position: "absolute", bottom: 60, left: 16, right: 16, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12, padding: 12 }}>
            <Text style={{ color: "#fff", fontSize: 15 }}>{s.note}</Text>
          </View>
        ) : null}

        <Pressable style={{ position: "absolute", left: 0, top: 140, bottom: 120, width: width * 0.35 }}
          onPress={() => setI((x) => Math.max(0, x - 1))} accessibilityLabel="Previous zap" />
        <Pressable style={{ position: "absolute", right: 0, top: 140, bottom: 120, width: width * 0.65 }}
          onPress={() => (i < snaps.length - 1 ? setI(i + 1) : onClose())} accessibilityLabel="Next zap" />
      </View>
    </Modal>
  );
}
