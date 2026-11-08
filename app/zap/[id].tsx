import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Ionicons } from "../../components/SFIcon";
import PhotoEditor, { type EditorHandle } from "../../components/PhotoEditor";
import { ensureChargerSaved, fetchChargers, getCharger, speedLabel, isFast } from "../../lib/chargers";
import { ISSUES, postCheckin, uploadSnap, type IssueKey } from "../../lib/community";
import { useAuth, canPost } from "../../lib/auth";
import { distanceM, fmtDistance } from "../../lib/geo";
import type { Charger, Status } from "../../lib/types";
import { getZapFix, metresTo, type ZapFix } from "../../lib/zapscore";
import { ScoreMeter } from "../../components/ZapScore";
import { useVideoPlayer, VideoView } from "expo-video";
import * as VideoThumbnails from "expo-video-thumbnails";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { uploadVideo } from "../../lib/community";
import { LOOKS } from "../../lib/filters";
import { trackById } from "../../lib/music";
import { MusicPicker } from "../../components/MusicPicker";
import { VideoLook } from "../../components/VideoLook";
import { tickHaptic } from "../../lib/motion";
import { searchPlaces, type PlaceHit } from "../../lib/places";
import { SendSheet, type SendChoice } from "../../components/SendSheet";
import { sendZingTo } from "../../lib/dms";
import { challengeById } from "../../lib/challenges";

const DARK = "#07090B";
const YELLOW = "#FCE38A";

/** Drop a zap: pick the charger (or use the nearest), shoot or choose a photo, grade it, post it. */
export default function DropZap() {
  const { id, uri: shot, kind: shotKind, look: shotLook, challenge } = useLocalSearchParams<{ id: string; uri?: string; kind?: string; look?: string; challenge?: string }>();
  const ch = challengeById(challenge ? String(challenge) : null);
  const [sendOpen, setSendOpen] = useState(false);
  const auth = useAuth();
  const [charger, setCharger] = useState<Charger | null>(null);
  const [nearby, setNearby] = useState<{ c: Charger; d: number }[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [loading, setLoading] = useState(true);
  // Coming from the Zings camera: the photo or video is already taken.
  const [uri, setUri] = useState<string | null>(shot ? decodeURIComponent(String(shot)) : null);
  const [status, setStatus] = useState<Status>("working");
  const [note, setNote] = useState("");
  const [keep, setKeep] = useState(false);
  const [kind, setKind] = useState<"photo" | "video">(shotKind === "video" ? "video" : "photo");
  const [videoLook, setVideoLook] = useState(shotLook && shotKind === "video" ? String(shotLook) : "cinema");
  const [music, setMusic] = useState<string | null>(null);
  const [musicOpen, setMusicOpen] = useState(false);
  // Somewhere that isn't a charger: a highway café, a viewpoint, a meetup spot.
  const [place, setPlace] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [placeQ, setPlaceQ] = useState("");
  const [placeHits, setPlaceHits] = useState<PlaceHit[]>([]);
  const [here, setHere] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const where = charger?.name ?? place?.name ?? null;
  const [issue, setIssue] = useState<IssueKey | null>(null);
  const [posting, setPosting] = useState(false);
  const editor = useRef<EditorHandle | null>(null);
  const [fix, setFix] = useState<ZapFix | null>(null);
  const [locOff, setLocOff] = useState(false);

  // Keep a fresh location fix while this screen is open, for the Zing Score preview.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let alive = true;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted") { setLocOff(true); return; }
      setLocOff(false);
      const first = await getZapFix();
      if (alive && first) setFix(first);
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5 }, (pos) => {
        setFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null, mocked: Boolean((pos as any).mocked) });
      });
      if (!alive) sub.remove();
    })();
    return () => { alive = false; sub?.remove(); };
  }, [locOff]);

  const enableLocation = async () => {
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm === "granted") setLocOff(false);
    else Alert.alert("Location is off", "Allow location for zingd in Settings to earn full Zing Score.");
  };

  const distance = fix && charger ? metresTo(fix, charger.lat, charger.lng) : fix && place ? metresTo(fix, place.lat, place.lng) : null;

  useEffect(() => {
    (async () => {
      const decoded = decodeURIComponent(String(id ?? "nearest"));
      if (decoded !== "nearest") {
        setCharger(await getCharger(decoded));
        setLoading(false);
        return;
      }
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") { setLoading(false); setChoosing(true); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const list = (await fetchChargers(pos.coords.latitude, pos.coords.longitude, 10))
        .map((c) => ({ c, d: distanceM(pos.coords.latitude, pos.coords.longitude, c.lat, c.lng) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 8);
      setNearby(list);
      if (list[0] && list[0].d < 400) setCharger(list[0].c);
      else setChoosing(true);
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!choosing || placeQ.trim().length < 2) { setPlaceHits([]); return; }
    const t = setTimeout(() => searchPlaces(placeQ, fix ?? undefined).then(setPlaceHits).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [placeQ, choosing]);
  useEffect(() => {
    if (!choosing || here || !fix) return;
    Location.reverseGeocodeAsync({ latitude: fix.lat, longitude: fix.lng }).then((r) => {
      const a = r[0]; const name = [a?.name, a?.district ?? a?.subregion].filter(Boolean).join(", ") || "Where I am";
      setHere({ lat: fix.lat, lng: fix.lng, name: name.slice(0, 80) });
    }).catch(() => setHere({ lat: fix.lat, lng: fix.lng, name: "Where I am" }));
  }, [choosing, fix?.lat]);
  const pickPlace = (p: { name: string; lat: number; lng: number }) => { tickHaptic(); setPlace(p); setCharger(null); setChoosing(false); setPlaceQ(""); };

  const shoot = async (fromCamera: boolean) => {
    // Video zings: up to 10 seconds, trimmed in the native editor. The camera has its own flash and lens controls.
    const opts: ImagePicker.ImagePickerOptions = kind === "video"
      ? { mediaTypes: ["videos"], videoMaxDuration: 10, allowsEditing: true, videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium }
      : { mediaTypes: ["images"], quality: 0.92, allowsEditing: true, aspect: [3, 4] };
    if (fromCamera) {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return Alert.alert("Camera is off", "Allow camera access for zingd in Settings, or choose a photo instead.");
    }
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled && res.assets[0]) setUri(res.assets[0].uri);
  };

  const post = async (choice: SendChoice = { story: "public", friends: [] }) => {
    if (!charger && !place) return;
    if (!canPost(auth)) { router.push("/login"); return; }
    setPosting(true);
    try {
      if (charger) await ensureChargerSaved(charger);
      let path: string | null = null;
      let videoPath: string | null = null;
      if (uri && kind === "video") {
        // Cover image for the feed, map and stories, then the video itself.
        const th = await VideoThumbnails.getThumbnailAsync(uri, { time: 400, quality: 0.8 });
        const img = await ImageManipulator.manipulate(th.uri).resize({ width: 900 }).renderAsync();
        const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
        path = await uploadSnap(out.base64!);
        videoPath = await uploadVideo(uri);
      } else if (uri) {
        const b64 = await editor.current?.exportJpeg();
        if (!b64) throw new Error("Your photo isn't ready yet. Wait a second and try again.");
        path = await uploadSnap(b64);
      }
      const latest = (await getZapFix()) ?? fix;
      const result = await postCheckin(charger?.id ?? null, charger ? status : "working", note, path, kind === "video" ? videoLook : editor.current?.lookId(), latest, charger ? issue : null, keep,
        { media: kind, video_path: videoPath, music, audience: choice.story ?? "direct", place: charger ? null : place, challenge: ch?.id ?? null });
      // Straight to friends' chats.
      let sentTo = 0;
      if (choice.friends.length && auth.session) sentTo = await sendZingTo(choice.friends, result.id, auth.session.user.id);
      setSendOpen(false);
      if (!choice.story) {
        Alert.alert("Sent ⚡", `Your zing went to ${sentTo} friend${sentTo === 1 ? "" : "s"}.`);
        router.replace("/(tabs)/feed");
        return;
      }
      if (!charger) {
        Alert.alert("Zing dropped ⚡", `+${result.zap_score} Zing Score at ${place!.name}.`);
        router.replace("/(tabs)/feed");
        return;
      }
      router.replace({
        pathname: "/charger/[id]",
        params: { id: charger.id, posted: "1", score: String(result.zap_score), parts: JSON.stringify(result.score_breakdown) },
      });
    } catch (e: any) {
      Alert.alert("Your zing didn't post", e.message ?? "Try again in a moment.");
    } finally {
      setPosting(false);
    }
  };

  const header = (
    <Stack.Screen
      options={{
        title: "Drop a zing",
        headerStyle: { backgroundColor: DARK },
        headerTitleStyle: { color: "#fff" },
        headerTintColor: "#fff",
        // Full-screen modal: always give a way out.
        headerLeft: () => (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={12} accessibilityLabel="Close" style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        ),
        headerRight: () =>
          charger || place ? (
            <Pressable onPress={() => (canPost(auth) ? setSendOpen(true) : router.push("/login"))} disabled={posting} style={styles.dropBtn} accessibilityRole="button">
              {posting ? <ActivityIndicator color="#1A1A1A" /> : <Text style={{ color: "#1A1A1A", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Send to ▶</Text>}
            </Pressable>
          ) : null,
      }}
    />
  );

  if (loading) {
    return (
      <View style={[styles.fill, { alignItems: "center", justifyContent: "center" }]}>
        {header}
        <ActivityIndicator color={YELLOW} />
        <Text style={{ color: "#A3ADB6", marginTop: 10 }}>Finding the charger you're at…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => setChoosing((c) => !c)} style={styles.at}>
          <Ionicons name="flash" size={16} color={YELLOW} />
          <Text style={{ color: "#fff", flex: 1, fontWeight: "700" }} numberOfLines={1}>
            {where ? `${place ? "📍 " : ""}At ${where}` : "Where are you?"}
          </Text>
          <Text style={{ color: YELLOW, fontWeight: "700" }}>{where ? "Change" : "Choose"}</Text>
        </Pressable>

        {choosing && (
          <View style={{ marginHorizontal: 16, borderRadius: 14, backgroundColor: "#151A1F", overflow: "hidden" }}>
            {nearby.length === 0 && (
              <Text style={{ color: "#A3ADB6", padding: 14 }}>No chargers found near you. Open a charger from the map and drop your zing from there.</Text>
            )}
            <Text style={styles.groupH}>⚡ EV CHARGERS NEAR YOU</Text>
            {nearby.map(({ c, d }) => (
              <Pressable key={c.id} onPress={() => { setCharger(c); setPlace(null); setChoosing(false); }} style={styles.choice}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "600" }} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ color: "#A3ADB6", fontSize: 12.5 }}>{speedLabel(c)}</Text>
                </View>
                <Text style={{ color: "#fff", fontVariant: ["tabular-nums"] }}>{fmtDistance(d)}</Text>
              </Pressable>
            ))}
            <Text style={styles.groupH}>📍 SOMEWHERE ELSE</Text>
            {here && (
              <Pressable onPress={() => pickPlace(here)} style={styles.choice}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "600" }} numberOfLines={1}>Right here</Text>
                  <Text style={{ color: "#A3ADB6", fontSize: 12.5 }} numberOfLines={1}>{here.name}</Text>
                </View>
                <Ionicons name="navigate" size={16} color={YELLOW} />
              </Pressable>
            )}
            <View style={styles.placeSearch}>
              <Ionicons name="search" size={16} color="#8A949D" />
              <TextInput value={placeQ} onChangeText={setPlaceQ} placeholder="Café, viewpoint, meetup spot…" placeholderTextColor="#6E7882"
                style={{ flex: 1, color: "#fff", fontSize: 15 }} autoCorrect={false} />
            </View>
            {placeHits.map((h) => (
              <Pressable key={h.id} onPress={() => pickPlace({ name: h.title, lat: h.lat, lng: h.lng })} style={styles.choice}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "600" }} numberOfLines={1}>{h.title}</Text>
                  {!!h.subtitle && <Text style={{ color: "#A3ADB6", fontSize: 12.5 }} numberOfLines={1}>{h.subtitle}</Text>}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {(charger || place) && (
          <>
            <ScoreMeter distanceM={distance} accuracy={fix?.accuracy ?? null} mocked={fix?.mocked ?? false}
              hasPhoto={!!uri} locationOff={locOff} onEnableLocation={enableLocation} />
            {charger && <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16 }} accessibilityRole="radiogroup">
              {([["working", "Working", "#137F4E"], ["busy", "Busy", "#B86E00"], ["broken", "Not working", "#C5221F"]] as const).map(([k, label, col]) => (
                <Pressable key={k} onPress={() => setStatus(k)} accessibilityRole="radio" accessibilityState={{ selected: status === k }}
                  style={[styles.status, status === k ? { backgroundColor: col, borderColor: col } : null]}>
                  <Text style={{ color: "#fff", fontWeight: "700" }}>{label}</Text>
                </Pressable>
              ))}
            </View>}

            {charger && status !== "working" && (
              <View style={{ paddingHorizontal: 16, gap: 8 }}>
                <Text style={{ color: "#A3ADB6", fontSize: 13, fontWeight: "600" }}>What's wrong? (optional)</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {ISSUES.map((i) => (
                    <Pressable key={i.key} onPress={() => setIssue(issue === i.key ? null : i.key)}
                      accessibilityRole="button" accessibilityState={{ selected: issue === i.key }}
                      style={[styles.issue, issue === i.key && { backgroundColor: "#FCE38A", borderColor: "#FCE38A" }]}>
                      <Text style={{ color: issue === i.key ? "#1A1A1A" : "#fff", fontWeight: "600", fontSize: 13 }}>{i.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {!uri && (
              <View style={styles.kind}>
                {(["photo", "video"] as const).map((k) => (
                  <Pressable key={k} onPress={() => { tickHaptic(); setKind(k); }} style={[styles.kindBtn, kind === k && { backgroundColor: YELLOW }]}>
                    <Ionicons name={k === "photo" ? "camera" : "videocam"} size={16} color={kind === k ? "#1A1A1A" : "#fff"} />
                    <Text style={{ color: kind === k ? "#1A1A1A" : "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{k === "photo" ? "Photo" : "Video · 10s"}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {uri && kind === "video" ? (
              <VideoZingPreview uri={uri} look={videoLook} onLook={setVideoLook} />
            ) : uri ? (
              <PhotoEditor
                uri={uri}
                status={status}
                chargerName={where ?? ""}
                speedText={charger && isFast(charger) ? speedLabel(charger).toUpperCase() : null}
                carModel={auth.profile?.car_model ?? null}
                editorRef={editor}
                initialLook={shotLook ? String(shotLook) : null}
              />
            ) : (
              <View style={{ marginHorizontal: 16, gap: 10 }}>
                <Pressable onPress={() => shoot(true)} style={styles.shoot}>
                  <Ionicons name="camera" size={40} color="#1A1A1A" />
                  <Text style={{ color: "#1A1A1A", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17 }}>{kind === "video" ? "Record a zing" : "Take a zing"}</Text>
                  <Text style={{ color: "#3C3410", fontSize: 13 }}>Show the screen, the queue or the spot</Text>
                </Pressable>
                <Pressable onPress={() => shoot(false)} style={styles.secondary}>
                  <Ionicons name="images-outline" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Choose from gallery</Text>
                </Pressable>
                <Text style={{ color: "#A3ADB6", fontSize: 12.5, textAlign: "center" }}>
                  No photo? Tap Send to post the status only.
                </Text>
              </View>
            )}

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a tip: 2 guns free, queue after 7 pm…"
              placeholderTextColor="#6E7882"
              maxLength={200}
              style={styles.note}
              multiline
            />
            {/* Soundtrack and who sees it */}
            <View style={{ flexDirection: "row", gap: 8, marginHorizontal: 16 }}>
              <Pressable onPress={() => setMusicOpen(true)} style={[styles.pill, music && { backgroundColor: YELLOW }]}>
                <Ionicons name="musical-note" size={16} color={music ? "#1A1A1A" : "#fff"} />
                <Text style={{ color: music ? "#1A1A1A" : "#fff", fontWeight: "800" }} numberOfLines={1}>{trackById(music)?.title ?? "Add music"}</Text>
              </Pressable>
              {ch && (
                <View style={[styles.pill, { backgroundColor: "#2A2610" }]}>
                  <Text>{ch.emoji}</Text><Text style={{ color: YELLOW, fontWeight: "800" }} numberOfLines={1}>{ch.title}</Text>
                </View>
              )}
            </View>
            <MusicPicker visible={musicOpen} value={music} onClose={() => setMusicOpen(false)} onPick={setMusic} />
            <SendSheet visible={sendOpen} busy={posting} onClose={() => setSendOpen(false)} onSend={(c) => post(c)} />

            {/* Snapchat-style: gone in 24 hours, or keep it on your profile and the charger's gallery */}
            <View style={styles.life}>
              {([[false, "⏱  24 hours", "On the live map, then only in your Memories"], [true, "♾  Keep", "Stays on your profile and the charger page"]] as const).map(([k, label, sub]) => (
                <Pressable key={String(k)} onPress={() => setKeep(k)} style={[styles.lifeOpt, keep === k && { backgroundColor: YELLOW }]}>
                  <Text style={{ color: keep === k ? "#1A1A1A" : "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{label}</Text>
                  <Text style={{ color: keep === k ? "#3C3410" : "#8A949D", fontSize: 11.5, textAlign: "center" }} numberOfLines={2}>{sub}</Text>
                </Pressable>
              ))}
            </View>
            {uri && (
              <Pressable onPress={() => setUri(null)} style={{ alignSelf: "center", padding: 8 }}>
                <Text style={{ color: "#A3ADB6" }}>Retake photo</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: DARK },
  dropBtn: { backgroundColor: YELLOW, paddingHorizontal: 16, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  at: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: "#151A1F" },
  groupH: { color: "#8A949D", fontSize: 11.5, fontWeight: "800", letterSpacing: 0.8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  placeSearch: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginVertical: 8, height: 42, borderRadius: 21, paddingHorizontal: 12, backgroundColor: "#0B0F12" },
  choice: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#2A3037" },
  status: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: "#3A424A", alignItems: "center", justifyContent: "center" },
  shoot: { height: 220, borderRadius: 18, backgroundColor: YELLOW, alignItems: "center", justifyContent: "center", gap: 6 },
  secondary: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: "#3A424A", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  issue: { height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: "#3A424A", justifyContent: "center" },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#1E242A", alignItems: "center", justifyContent: "center" },
  kind: { flexDirection: "row", gap: 6, marginHorizontal: 16, padding: 4, borderRadius: 18, backgroundColor: "#151A1F" },
  kindBtn: { flex: 1, height: 40, borderRadius: 14, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "#151A1F", flexShrink: 1 },
  life: { flexDirection: "row", gap: 8, marginHorizontal: 16, padding: 4, borderRadius: 18, backgroundColor: "#151A1F" },
  lifeOpt: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 14 },
  note: { marginHorizontal: 16, minHeight: 52, borderRadius: 12, backgroundColor: "#151A1F", color: "#fff", padding: 14, fontSize: 15 },
});

/** Video zing preview: loops silently with the chosen look on top; swipe through looks below. */
function VideoZingPreview({ uri, look, onLook }: { uri: string; look: string; onLook: (id: string) => void }) {
  const W = Dimensions.get("window").width - 32, H = Math.round(W * 4 / 3);
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  return (
    <View style={{ gap: 10 }}>
      <View style={{ marginHorizontal: 16, width: W, height: H, borderRadius: 16, overflow: "hidden", backgroundColor: "#000" }}>
        <VideoView player={player} style={{ width: W, height: H }} contentFit="cover" nativeControls={false} />
        <VideoLook look={look} width={W} height={H} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {LOOKS.map((l) => (
          <Pressable key={l.id} onPress={() => { tickHaptic(); onLook(l.id); }}
            style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: "center", backgroundColor: look === l.id ? YELLOW : "#151A1F" }}>
            <Text style={{ color: look === l.id ? "#1A1A1A" : "#fff", fontWeight: "800" }}>{l.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
