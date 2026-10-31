import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fetchLeaderboard, type LeaderRow } from "../lib/community";
import { useAuth } from "../lib/auth";
import { DAILY_CAP, FRESH_BONUS, PHOTO_BONUS, TIERS } from "../lib/zapscore";
import { VerifiedBadge } from "../components/ui";

const BG = "#0B1117";
const MEDAL = ["#FFD60A", "#C7CED6", "#D08A4E"];

/** This week's top zappers in the viewer's city, with how scoring works. */
export default function Leaderboard() {
  const { profile, session } = useAuth();
  const [city, setCity] = useState<string | null>(profile?.city ?? null);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await fetchLeaderboard(city, 30));
    setLoading(false);
  }, [city]);
  useEffect(() => { load(); }, [load]);

  const me = session?.user.id;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen options={{ title: "Leaderboard", headerStyle: { backgroundColor: BG }, headerTintColor: "#fff", headerTitleStyle: { color: "#fff" } }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.user_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#FFD60A" />}
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 8 }}>
            <View>
              <Text style={{ color: "#fff", fontSize: 32, fontWeight: "900" }}>This week</Text>
              <Text style={{ color: "#A9B3BC" }}>Resets every Monday · {city ? city : "All of India"}</Text>
            </View>
            {profile?.city ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[profile.city, null].map((c) => (
                  <Pressable key={c ?? "all"} onPress={() => setCity(c)}
                    style={[styles.tab, city === c && { backgroundColor: "#FFD60A", borderColor: "#FFD60A" }]}
                    accessibilityRole="button" accessibilityState={{ selected: city === c }}>
                    <Text style={{ color: city === c ? "#14202B" : "#fff", fontWeight: "700" }}>{c ?? "All India"}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item: r, index }) => (
          <Pressable onPress={() => router.push(`/driver/${r.user_id}`)}
            style={[styles.row, r.user_id === me && { borderColor: "#FFD60A" }]}>
            <Text style={[styles.rank, { color: MEDAL[index] ?? "#6E7882" }]}>{index + 1}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: "#fff", fontWeight: "700" }} numberOfLines={1}>{r.display_name}{r.user_id === me ? " (you)" : ""}</Text>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Text style={{ color: "#A9B3BC", fontSize: 12.5 }} numberOfLines={1}>
                  {[r.car_model, `${r.week_zaps} zap${r.week_zaps === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                </Text>
                <VerifiedBadge verified={r.vehicle_verified} />
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="flash" size={14} color="#FFD60A" />
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 17, fontVariant: ["tabular-nums"] }}>{r.week_score}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={loading ? null : (
          <Text style={{ color: "#A9B3BC", textAlign: "center", paddingVertical: 30 }}>No zaps yet this week. Drop one and take the top spot.</Text>
        )}
        ListFooterComponent={
          <View style={styles.rules}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>How Zap Score works</Text>
            {TIERS.map((t) => (
              <Rule key={t.label} left={`${t.label} (within ${t.maxM} m)`} right={`+${t.points}`} />
            ))}
            <Rule left="Further away" right="+5" />
            <Rule left="Photo" right={`+${PHOTO_BONUS}`} />
            <Rule left="First zap at the charger in 3 hours (on site)" right={`+${FRESH_BONUS}`} />
            <Text style={styles.small}>
              Distance is measured from where your phone is when you drop the zap. Only the distance is saved, never your location.
              Same charger again within 3 hours earns nothing. Up to {DAILY_CAP} points a day. Zaps hidden after reports lose their points.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function Rule({ left, right }: { left: string; right: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ color: "#D8DDE2", flex: 1 }}>{left}</Text>
      <Text style={{ color: "#FFD60A", fontWeight: "800", fontVariant: ["tabular-nums"] }}>{right}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: "#2A3540", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, backgroundColor: "#151E26", borderWidth: 1, borderColor: "transparent" },
  rank: { width: 26, fontSize: 20, fontWeight: "900", textAlign: "center", fontVariant: ["tabular-nums"] },
  rules: { marginTop: 18, gap: 10, padding: 16, borderRadius: 14, backgroundColor: "#151E26" },
  small: { color: "#A9B3BC", fontSize: 12.5, lineHeight: 18, marginTop: 4 },
});
