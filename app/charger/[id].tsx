import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
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
import { useTheme, CTA, ON_CTA } from "../../lib/theme";
import { useAuth, canPost } from "../../lib/auth";
import { Avatar, Button, Pin, Section, Stars, StatusBanner } from "../../components/ui";
import SnapViewer from "../../components/SnapViewer";
import { openSafetyMenu } from "../../components/SafetyMenu";
import type { Charger, Checkin, FacilitySummary, FoodPlace, FoodTip, LiveStatus, Review } from "../../lib/types";
import { ScoreCard } from "../../components/ZapScore";
import VehicleFit from "../../components/VehicleFit";
import { Confetti } from "../../components/Confetti";
import { startSession, useSessions } from "../../lib/sessions";
import { openNetworkApp } from "../../lib/networks";
import type { ScorePart } from "../../lib/types";
import { MAP_PROVIDER, openDirections, zappdStyle } from "../../lib/maps";

export default function ChargerPage() {
  const t = useTheme();
  const scheme = useColorScheme();
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

  // Refresh whenever the page comes back into view (after a zing, review or facility update).
  useFocusEffect(useCallback(() => { loadCommunity(); }, [loadCommunity]));

  if (!c) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const n = networkById(c.network);
  const directions = () => openDirections(c.lat, c.lng);
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
        <Hero charger={c} live={live} zings={zaps} onOpen={(i) => setViewer(i)} scheme={scheme} />

        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: t.text, fontSize: 22, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{c.name}</Text>
              <Text style={{ color: t.muted }}>{[n.name, speedLabel(c), c.address].filter(Boolean).join(" · ")}</Text>
              {!!c.connectors?.length && <Text style={{ color: t.muted, fontSize: 13 }}>{c.connectors.join(", ")}</Text>}
              {c.id.startsWith("c-") && (
                <View style={{ flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 5, backgroundColor: "#FCE38A", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 4 }}>
                  <Ionicons name="people" size={13} color="#1A1A1A" />
                  <Text style={{ color: "#1A1A1A", fontSize: 12, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Added by drivers · zing it to confirm</Text>
                </View>
              )}
              {n.oem && (
                <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: 4 }}>
                  <Ionicons name="car-sport-outline" size={14} color={t.muted} />
                  <Text style={{ color: t.muted, fontSize: 12.5, flex: 1 }}>
                    {n.short} brand charger. Some are open to every EV, some only to {n.short} owners or need its app. Check recent zings before you go.
                  </Text>
                </View>
              )}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: t.text, fontSize: 20, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{rating.count ? rating.avg.toFixed(1) : "–"}</Text>
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
            <Pressable onPress={() => router.push(`/zap/${encodeURIComponent(c.id)}`)} style={[styles.action, { backgroundColor: CTA }]}>
              <Ionicons name="camera" size={18} color={ON_CTA} />
              <Text style={{ color: ON_CTA, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Drop a zing</Text>
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

        <Section title="Zings · gone in 24 hours">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            <Pressable onPress={() => router.push(`/zap/${encodeURIComponent(c.id)}`)} style={[styles.zapTile, styles.addTile, { borderColor: t.faint }]}>
              <Ionicons name="camera-outline" size={26} color={t.accent} />
              <Text style={{ color: t.accent, fontWeight: "700", fontSize: 12 }}>Drop zing</Text>
            </Pressable>
            {zaps.map((z, i) => (
              <Pressable key={z.id} onPress={() => setViewer(i)} style={styles.zapTile} accessibilityLabel={`Zing by ${z.profiles?.display_name ?? "a driver"}`}>
                {z.photo_path && <Image source={{ uri: snapUrl(z.photo_path) }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                <Text style={styles.zapAgo}>{timeAgo(z.created_at).replace(" ago", "")}</Text>
                <Text style={styles.zapWho} numberOfLines={1}>{z.profiles?.display_name ?? "Driver"}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {zaps.length === 0 && <Text style={{ color: t.muted }}>No zings yet today. Drop the first one when you're here.</Text>}
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
                <Pressable onPress={() => router.push(`/driver/${r.user_id}`)}><Avatar name={name} photo={r.profiles?.avatar_path} /></Pressable>
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
      {showScore && Number(score ?? 0) >= 100 && <Confetti />}
    </>
  );
}

const styles = StyleSheet.create({
  toast: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12 },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 12 },
  zapTile: { width: 92, height: 124, borderRadius: 14, overflow: "hidden", backgroundColor: "#1A1A1A" },
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

const STATUS_STYLE = {
  working: { bg: "#1FAE5B", label: "Working" },
  busy: { bg: "#F2A93B", label: "Busy" },
  broken: { bg: "#E5483D", label: "Not working" },
} as const;

/**
 * Top of the charger page: the newest zing photo, full width, with the live status on it.
 * Falls back to a map of the spot when nobody has posted a photo in the last 24 hours.
 */
function Hero({ charger, live, zings, onOpen, scheme }: {
  charger: Charger; live?: LiveStatus; zings: Checkin[]; onOpen: (i: number) => void; scheme: "light" | "dark" | null | undefined;
}) {
  const idx = zings.findIndex((z) => !!z.photo_path);
  const z = idx >= 0 ? zings[idx] : null;
  const st = live ? STATUS_STYLE[live.status] : null;
  const badge = (
    <View style={[heroS.badge, { backgroundColor: st ? st.bg : "rgba(26,26,26,0.75)" }]}>
      <View style={heroS.dot} />
      <Text style={heroS.badgeText}>{st ? `${st.label} · ${timeAgo(live!.lastAt)}` : "No reports yet"}</Text>
    </View>
  );
  if (!z) {
    return (
      <View style={{ height: 220 }}>
        <MapView provider={MAP_PROVIDER} customMapStyle={zappdStyle(scheme)} style={StyleSheet.absoluteFill}
          mapType={MAP_PROVIDER ? "standard" : "mutedStandard"} pointerEvents="none" scrollEnabled={false} zoomEnabled={false}
          rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false}
          initialRegion={{ latitude: charger.lat, longitude: charger.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }}>
          <Marker key={live?.status ?? "none"} coordinate={{ latitude: charger.lat, longitude: charger.lng }} tracksViewChanges={false}>
            <Pin network={charger.network} status={live?.status} selected />
          </Marker>
        </MapView>
        <View style={heroS.topRow}>{badge}</View>
        <View style={heroS.nudge}><Text style={heroS.nudgeText}>📸 No photo in the last 24 h. Be the first to zing it.</Text></View>
      </View>
    );
  }
  const name = z.profiles?.display_name ?? "a driver";
  return (
    <Pressable onPress={() => onOpen(idx)} style={{ height: 320, backgroundColor: "#111" }} accessibilityLabel={`Latest zing by ${name}. Tap to view all.`}>
      <Image source={{ uri: snapUrl(z.photo_path!) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      <View style={heroS.shadeTop} />
      <View style={heroS.shadeBottom} />
      <View style={heroS.topRow}>{badge}</View>
      <View style={heroS.bottomRow}>
        <Avatar name={name} photo={z.profiles?.avatar_path} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={heroS.by} numberOfLines={1}>Zinged by {name}</Text>
          <Text style={heroS.when}>{timeAgo(z.created_at)}{z.zap_score ? ` · ⚡ ${z.zap_score}` : ""}</Text>
        </View>
        <View style={heroS.count}>
          <Ionicons name="images" size={14} color="#1A1A1A" />
          <Text style={{ color: "#1A1A1A", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 13 }}>{zings.length} {zings.length === 1 ? "zing" : "zings"}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const heroS = StyleSheet.create({
  topRow: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row" },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  badgeText: { color: "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 13 },
  shadeTop: { position: "absolute", top: 0, left: 0, right: 0, height: 70, backgroundColor: "rgba(0,0,0,0.18)" },
  shadeBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 96, backgroundColor: "rgba(0,0,0,0.5)" },
  bottomRow: { position: "absolute", left: 14, right: 14, bottom: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  by: { color: "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 15 },
  when: { color: "rgba(255,255,255,0.8)", fontSize: 12.5, marginTop: 1 },
  count: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FCE38A", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  nudge: { position: "absolute", left: 12, right: 12, bottom: 12, backgroundColor: "rgba(26,26,26,0.85)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  nudgeText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
