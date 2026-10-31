import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Image } from "expo-image";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getCharger, speedLabel } from "../../lib/chargers";
import {
  FACILITIES, NEGATIVE_TAGS, addFoodTip, fetchFacilities, fetchIssues, fetchFoodTips, fetchLiveStatus, fetchRating, fetchReviews,
  fetchSnaps, fetchTopTags, toggleHelpful,
} from "../../lib/community";
import { nearbyFood, FOOD_LABEL } from "../../lib/places";
import { networkById } from "../../lib/networks";
import { fmtDistance, timeAgo, walkTime } from "../../lib/geo";
import { snapUrl } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";
import { useAuth, canPost } from "../../lib/auth";
import { Avatar, Button, Pin, Section, Stars, StatusBanner } from "../../components/ui";
import SnapViewer from "../../components/SnapViewer";
import { openSafetyMenu } from "../../components/SafetyMenu";
import type { Charger, Checkin, FacilitySummary, FoodPlace, FoodTip, LiveStatus, Review } from "../../lib/types";
import { ScoreCard } from "../../components/ZapScore";
import VehicleFit from "../../components/VehicleFit";
import { startSession, useSessions } from "../../lib/sessions";
import { openNetworkApp } from "../../lib/networks";
import type { ScorePart } from "../../lib/types";

export default function ChargerPage() {
  const t = useTheme();
  const auth = useAuth();
  const { id, posted, score, parts } = useLocalSearchParams<{ id: string; posted?: string; score?: string; parts?: string }>();
  const [showScore, setShowScore] = useState(posted === "1");
  const chargerId = decodeURIComponent(String(id));

  const [c, setC] = useState<Charger | null>(null);
  const [live, setLive] = useState<LiveStatus | undefined>();
  const [rating, setRating] = useState({ avg: 0, count: 0 });
  const [tags, setTags] = useState<{ tag: string; n: number }[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [zaps, setZaps] = useState<Checkin[]>([]);
  const [facilities, setFacilities] = useState<FacilitySummary[]>([]);
  const [food, setFood] = useState<FoodPlace[] | null>(null);
  const [tips, setTips] = useState<FoodTip[]>([]);
  const [viewer, setViewer] = useState<number | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipName, setTipName] = useState("");
  const [tipNote, setTipNote] = useState("");
  const [issues, setIssues] = useState<{ key: string; label: string; count: number; lastAt: string }[]>([]);
  const { active: charging } = useSessions();

  const loadCommunity = useCallback(async () => {
    const [l, r, tg, rv, z, f, tp] = await Promise.all([
      fetchLiveStatus([chargerId]), fetchRating(chargerId), fetchTopTags(chargerId), fetchReviews(chargerId),
      fetchSnaps(chargerId), fetchFacilities(chargerId), fetchFoodTips(chargerId),
    ]);
    setLive(l[chargerId]); setRating(r); setTags(tg); setReviews(rv); setZaps(z); setFacilities(f); setTips(tp);
    fetchIssues(chargerId).then(setIssues);
  }, [chargerId]);

  useEffect(() => {
    getCharger(chargerId).then((x) => {
      setC(x);
      if (x) nearbyFood(x.lat, x.lng).then(setFood);
    });
  }, [chargerId]);

  // Refresh whenever the page comes back into view (after a zap, review or facility update).
  useFocusEffect(useCallback(() => { loadCommunity(); }, [loadCommunity]));

  if (!c) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const n = networkById(c.network);
  const directions = () => {
    const url = Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${c.lat},${c.lng}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=driving`;
    Linking.openURL(url);
  };
  const need = (go: () => void) => () => (canPost(auth) ? go() : router.push("/login"));

  const facRows = FACILITIES.map((f) => {
    const s = facilities.find((x) => x.facility === f.key);
    return { ...f, yes: s?.yes ?? 0, no: s?.no ?? 0 };
  }).filter((f) => f.yes + f.no > 0);

  const saveTip = async () => {
    if (tipName.trim().length < 2) return Alert.alert("Add the place name", "For example: Sri Sai chai stall.");
    try {
      await addFoodTip(c.id, tipName, tipNote);
      setTipName(""); setTipNote(""); setTipOpen(false);
      setTips(await fetchFoodTips(c.id));
    } catch (e: any) {
      Alert.alert("Tip didn't save", e.message);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: n.short, headerTransparent: false }} />
      <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ height: 190 }}>
          <MapView
            style={StyleSheet.absoluteFill}
            mapType="hybrid"
            pointerEvents="none"
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            initialRegion={{ latitude: c.lat, longitude: c.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
          >
            <Marker key={live?.status ?? "none"} coordinate={{ latitude: c.lat, longitude: c.lng }} tracksViewChanges={false}>
              <Pin network={c.network} status={live?.status} selected />
            </Marker>
          </MapView>
        </View>

        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: t.text, fontSize: 22, fontWeight: "800" }}>{c.name}</Text>
              <Text style={{ color: t.muted }}>{[n.name, speedLabel(c), c.address].filter(Boolean).join(" · ")}</Text>
              {!!c.connectors?.length && <Text style={{ color: t.muted, fontSize: 13 }}>{c.connectors.join(", ")}</Text>}
              {n.oem && (
                <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: 4 }}>
                  <Ionicons name="car-sport-outline" size={14} color={t.muted} />
                  <Text style={{ color: t.muted, fontSize: 12.5, flex: 1 }}>
                    {n.short} brand charger. Some are open to every EV, some only to {n.short} owners or need its app. Check recent zaps before you go.
                  </Text>
                </View>
              )}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{rating.count ? rating.avg.toFixed(1) : "–"}</Text>
              <Stars value={rating.avg} size={12} />
              <Text style={{ color: t.muted, fontSize: 12 }}>{rating.count} review{rating.count === 1 ? "" : "s"}</Text>
            </View>
          </View>

          {showScore && (
            <ScoreCard total={Number(score ?? 0)} parts={safeParts(parts)} onClose={() => setShowScore(false)} />
          )}

          <StatusBanner live={live} />

          <VehicleFit charger={c} />

          {issues.length > 0 && (
            <View style={{ padding: 12, borderRadius: 12, backgroundColor: t.badSoft, gap: 6 }}>
              <Text style={{ color: t.bad, fontWeight: "700" }}>Problems reported in the last 48 hours</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {issues.map((i) => (
                  <Text key={i.key} style={{ color: t.text, fontSize: 13, backgroundColor: t.bg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, overflow: "hidden" }}>
                    {i.label}{i.count > 1 ? ` ×${i.count}` : ""} · {timeAgo(i.lastAt)}
                  </Text>
                ))}
              </View>
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => router.push(`/zap/${encodeURIComponent(c.id)}`)} style={[styles.action, { backgroundColor: "#14202B" }]}>
              <Ionicons name="camera" size={18} color="#FFD60A" />
              <Text style={{ color: "#FFD60A", fontWeight: "800" }}>Drop a zap</Text>
            </Pressable>
            <Button title="Directions" icon="navigate" kind="primary" onPress={directions} style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button title={`Pay in ${n.short} app`} icon="card-outline" onPress={() => openNetworkApp(n)} style={{ flex: 1 }} />
            {charging?.chargerId === c.id ? (
              <Button title="Charging…" icon="timer-outline" onPress={() => router.push("/log")} style={{ flex: 1 }} />
            ) : (
              <Button title="Start charging" icon="timer-outline" style={{ flex: 1 }}
                onPress={() => { startSession({ id: c.id, name: c.name, network: c.network }); router.push("/log"); }} />
            )}
          </View>
        </View>

        <Section title="Zaps · gone in 24 hours">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            <Pressable onPress={() => router.push(`/zap/${encodeURIComponent(c.id)}`)} style={[styles.zapTile, styles.addTile, { borderColor: t.faint }]}>
              <Ionicons name="camera-outline" size={26} color={t.accent} />
              <Text style={{ color: t.accent, fontWeight: "700", fontSize: 12 }}>Drop zap</Text>
            </Pressable>
            {zaps.map((z, i) => (
              <Pressable key={z.id} onPress={() => setViewer(i)} style={styles.zapTile} accessibilityLabel={`Zap by ${z.profiles?.display_name ?? "a driver"}`}>
                {z.photo_path && <Image source={{ uri: snapUrl(z.photo_path) }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                <Text style={styles.zapAgo}>{timeAgo(z.created_at).replace(" ago", "")}</Text>
                <Text style={styles.zapWho} numberOfLines={1}>{z.profiles?.display_name ?? "Driver"}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {zaps.length === 0 && <Text style={{ color: t.muted }}>No zaps yet today. Drop the first one when you're here.</Text>}
        </Section>

        <Section title="Facilities · marked by drivers" action="Update" onAction={need(() => router.push(`/facilities/${encodeURIComponent(c.id)}`))}>
          {facRows.length === 0 ? (
            <Text style={{ color: t.muted }}>Nobody has marked facilities here yet. Tap Update if you know what's here.</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {facRows.map((f) => {
                const has = f.yes > f.no;
                return (
                  <View key={f.key} style={[styles.fac, { backgroundColor: has ? t.goodSoft : t.surface }]}>
                    <Ionicons name={f.icon as any} size={15} color={has ? t.good : t.faint} />
                    <Text style={{ color: has ? t.good : t.faint, fontWeight: has ? "700" : "400", textDecorationLine: has ? "none" : "line-through", fontSize: 13 }}>{f.label}</Text>
                    {has && f.yes > 1 && <Text style={{ color: t.good, fontSize: 11 }}>· {f.yes}</Text>}
                  </View>
                );
              })}
            </View>
          )}
        </Section>

        <Section title="Reviews" action="Write a review" onAction={need(() => router.push(`/review/${encodeURIComponent(c.id)}`))}>
          {tags.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {tags.map((x) => {
                const bad = NEGATIVE_TAGS.has(x.tag);
                return (
                  <Text key={x.tag} style={[styles.tag, { backgroundColor: bad ? t.badSoft : t.accentSoft, color: bad ? t.bad : t.accent }]}>
                    {x.tag} · {x.n}
                  </Text>
                );
              })}
            </View>
          )}
          {reviews.length === 0 && <Text style={{ color: t.muted }}>No reviews yet. Share how charging went here.</Text>}
          {reviews.slice(0, 12).map((r) => {
            const name = r.profiles?.display_name ?? "Driver";
            return (
              <View key={r.id} style={{ flexDirection: "row", gap: 10 }}>
                <Pressable onPress={() => router.push(`/driver/${r.user_id}`)}><Avatar name={name} /></Pressable>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: t.text }}>
                    <Text style={{ fontWeight: "700" }}>{name}</Text>
                    <Text style={{ color: t.muted }}>{[r.profiles?.car_model, timeAgo(r.created_at)].filter(Boolean).map((x) => ` · ${x}`).join("")}</Text>
                  </Text>
                  <Stars value={r.rating} size={12} />
                  {!!r.tags.length && <Text style={{ color: t.muted, fontSize: 12.5 }}>{r.tags.join(" · ")}</Text>}
                  {!!r.body && <Text style={{ color: t.text, lineHeight: 20 }}>{r.body}</Text>}
                  <View style={{ flexDirection: "row", gap: 18, marginTop: 2 }}>
                    <Pressable hitSlop={8} onPress={need(async () => { await toggleHelpful(r); setReviews(await fetchReviews(c.id)); })}>
                      <Text style={{ color: r.votedByMe ? t.accent : t.muted, fontWeight: "700", fontSize: 12.5 }}>Helpful · {r.helpful}</Text>
                    </Pressable>
                    {r.user_id !== auth.session?.user.id && (
                      <Pressable hitSlop={8} onPress={() => openSafetyMenu({ kind: "review", targetId: r.id, userId: r.user_id, userName: name, onDone: loadCommunity })}>
                        <Text style={{ color: t.muted, fontSize: 12.5 }}>Report</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </Section>

        <Section title="Eat while you charge · walking distance" action="Recommend a spot" onAction={need(() => setTipOpen((v) => !v))}>
          {tipOpen && (
            <View style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: t.line }}>
              <TextInput value={tipName} onChangeText={setTipName} placeholder="Place name, e.g. Sri Sai chai stall" placeholderTextColor={t.faint}
                style={[styles.input, { color: t.text, borderColor: t.line }]} maxLength={60} />
              <TextInput value={tipNote} onChangeText={setTipNote} placeholder="What's good there? (optional)" placeholderTextColor={t.faint}
                style={[styles.input, { color: t.text, borderColor: t.line }]} maxLength={160} />
              <Button title="Add tip" kind="primary" onPress={saveTip} />
            </View>
          )}
          {tips.map((tp) => (
            <View key={tp.id} style={styles.foodRow}>
              <View style={[styles.foodIcon, { backgroundColor: t.warnSoft }]}><Ionicons name="heart" size={17} color={t.warn} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>{tp.name}</Text>
                <Text style={{ color: t.muted, fontSize: 12.5 }}>{[tp.note, `tip from ${tp.profiles?.display_name ?? "a driver"}`].filter(Boolean).join(" · ")}</Text>
              </View>
              <Pressable hitSlop={8} onPress={() => openSafetyMenu({ kind: "food_tip", targetId: tp.id, userId: tp.user_id, userName: tp.profiles?.display_name ?? "this driver", onDone: loadCommunity })}>
                <Ionicons name="ellipsis-horizontal" size={18} color={t.faint} />
              </Pressable>
            </View>
          ))}
          {food === null && <ActivityIndicator color={t.muted} />}
          {food?.length === 0 && tips.length === 0 && <Text style={{ color: t.muted }}>No cafes or restaurants listed within a short walk.</Text>}
          {food?.map((f) => (
            <View key={f.id} style={styles.foodRow}>
              <View style={[styles.foodIcon, { backgroundColor: t.warnSoft }]}>
                <Ionicons name={f.kind === "cafe" ? "cafe" : "restaurant"} size={17} color={t.warn} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>{f.name}</Text>
                <Text style={{ color: t.muted, fontSize: 12.5 }}>{[f.cuisine, FOOD_LABEL[f.kind] ?? "Food"].filter(Boolean).join(" · ")}</Text>
              </View>
              <Text style={{ color: t.muted, fontSize: 12.5 }}>{walkTime(f.distanceM)}</Text>
            </View>
          ))}
          <Text style={{ color: t.faint, fontSize: 11 }}>Places from OpenStreetMap. Distances are straight-line ({fmtDistance(700)} radius).</Text>
        </Section>
      </ScrollView>

      {viewer !== null && (
        <SnapViewer snaps={zaps} start={viewer} onClose={() => setViewer(null)} onChanged={loadCommunity} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  toast: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12 },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 12 },
  zapTile: { width: 92, height: 124, borderRadius: 14, overflow: "hidden", backgroundColor: "#14202B" },
  addTile: { borderWidth: 2, borderStyle: "dashed", backgroundColor: "transparent", alignItems: "center", justifyContent: "center", gap: 6 },
  zapAgo: { position: "absolute", top: 6, left: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, fontWeight: "700" },
  zapWho: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 7, paddingTop: 14, paddingBottom: 6, backgroundColor: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, fontWeight: "700" },
  fac: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 32, borderRadius: 10 },
  tag: { fontSize: 12, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, overflow: "hidden" },
  foodRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  foodIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  input: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
});

function safeParts(raw?: string): ScorePart[] {
  try { const v = JSON.parse(raw ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
