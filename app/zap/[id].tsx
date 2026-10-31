import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import PhotoEditor, { type EditorHandle } from "../../components/PhotoEditor";
import { ensureChargerSaved, fetchChargers, getCharger, speedLabel, isFast } from "../../lib/chargers";
import { ISSUES, postCheckin, uploadSnap, type IssueKey } from "../../lib/community";
import { useAuth, canPost } from "../../lib/auth";
import { distanceM, fmtDistance } from "../../lib/geo";
import type { Charger, Status } from "../../lib/types";
import { getZapFix, metresTo, type ZapFix } from "../../lib/zapscore";
import { ScoreMeter } from "../../components/ZapScore";

const DARK = "#07090B";
const YELLOW = "#FFD60A";

/** Drop a zap: pick the charger (or use the nearest), shoot or choose a photo, grade it, post it. */
export default function DropZap() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const [charger, setCharger] = useState<Charger | null>(null);
  const [nearby, setNearby] = useState<{ c: Charger; d: number }[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uri, setUri] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("working");
  const [note, setNote] = useState("");
  const [issue, setIssue] = useState<IssueKey | null>(null);
  const [posting, setPosting] = useState(false);
  const editor = useRef<EditorHandle | null>(null);
  const [fix, setFix] = useState<ZapFix | null>(null);
  const [locOff, setLocOff] = useState(false);

  // Keep a fresh location fix while this screen is open, for the Zap Score preview.
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
    else Alert.alert("Location is off", "Allow location for zappd in Settings to earn full Zap Score.");
  };

  const distance = fix && charger ? metresTo(fix, charger.lat, charger.lng) : null;

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

  const shoot = async (fromCamera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.92, allowsEditing: true, aspect: [3, 4] };
    if (fromCamera) {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return Alert.alert("Camera is off", "Allow camera access for zappd in Settings, or choose a photo instead.");
    }
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled && res.assets[0]) setUri(res.assets[0].uri);
  };

  const post = async () => {
    if (!charger) return;
    if (!canPost(auth)) { router.push("/login"); return; }
    setPosting(true);
    try {
      await ensureChargerSaved(charger);
      let path: string | null = null;
      if (uri) {
        const b64 = editor.current?.exportJpeg();
        if (!b64) throw new Error("Your photo isn't ready yet. Wait a second and try again.");
        path = await uploadSnap(b64);
      }
      const latest = (await getZapFix()) ?? fix;
      const result = await postCheckin(charger.id, status, note, path, editor.current?.lookId(), latest, issue);
      router.replace({
        pathname: "/charger/[id]",
        params: { id: charger.id, posted: "1", score: String(result.zap_score), parts: JSON.stringify(result.score_breakdown) },
      });
    } catch (e: any) {
      Alert.alert("Your zap didn't post", e.message ?? "Try again in a moment.");
    } finally {
      setPosting(false);
    }
  };

  const header = (
    <Stack.Screen
      options={{
        title: "Drop a zap",
        headerStyle: { backgroundColor: DARK },
        headerTitleStyle: { color: "#fff" },
        headerTintColor: "#fff",
        headerRight: () =>
          charger ? (
            <Pressable onPress={post} disabled={posting} style={styles.dropBtn} accessibilityRole="button">
              {posting ? <ActivityIndicator color="#14202B" /> : <Text style={{ color: "#14202B", fontWeight: "800" }}>Drop it</Text>}
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
            {charger ? `At ${charger.name}` : "Choose the charger you're at"}
          </Text>
          <Text style={{ color: YELLOW, fontWeight: "700" }}>{charger ? "Change" : "Choose"}</Text>
        </Pressable>

        {choosing && (
          <View style={{ marginHorizontal: 16, borderRadius: 14, backgroundColor: "#151A1F", overflow: "hidden" }}>
            {nearby.length === 0 && (
              <Text style={{ color: "#A3ADB6", padding: 14 }}>No chargers found near you. Open a charger from the map and drop your zap from there.</Text>
            )}
            {nearby.map(({ c, d }) => (
              <Pressable key={c.id} onPress={() => { setCharger(c); setChoosing(false); }} style={styles.choice}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "600" }} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ color: "#A3ADB6", fontSize: 12.5 }}>{speedLabel(c)}</Text>
                </View>
                <Text style={{ color: "#fff", fontVariant: ["tabular-nums"] }}>{fmtDistance(d)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {charger && (
          <>
            <ScoreMeter distanceM={distance} accuracy={fix?.accuracy ?? null} mocked={fix?.mocked ?? false}
              hasPhoto={!!uri} locationOff={locOff} onEnableLocation={enableLocation} />
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16 }} accessibilityRole="radiogroup">
              {([["working", "Working", "#137F4E"], ["busy", "Busy", "#B86E00"], ["broken", "Not working", "#C5221F"]] as const).map(([k, label, col]) => (
                <Pressable key={k} onPress={() => setStatus(k)} accessibilityRole="radio" accessibilityState={{ selected: status === k }}
                  style={[styles.status, status === k ? { backgroundColor: col, borderColor: col } : null]}>
                  <Text style={{ color: "#fff", fontWeight: "700" }}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {status !== "working" && (
              <View style={{ paddingHorizontal: 16, gap: 8 }}>
                <Text style={{ color: "#A3ADB6", fontSize: 13, fontWeight: "600" }}>What's wrong? (optional)</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {ISSUES.map((i) => (
                    <Pressable key={i.key} onPress={() => setIssue(issue === i.key ? null : i.key)}
                      accessibilityRole="button" accessibilityState={{ selected: issue === i.key }}
                      style={[styles.issue, issue === i.key && { backgroundColor: "#FFD60A", borderColor: "#FFD60A" }]}>
                      <Text style={{ color: issue === i.key ? "#14202B" : "#fff", fontWeight: "600", fontSize: 13 }}>{i.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {uri ? (
              <PhotoEditor
                uri={uri}
                status={status}
                chargerName={charger.name}
                speedText={isFast(charger) ? speedLabel(charger).toUpperCase() : null}
                carModel={auth.profile?.car_model ?? null}
                editorRef={editor}
              />
            ) : (
              <View style={{ marginHorizontal: 16, gap: 10 }}>
                <Pressable onPress={() => shoot(true)} style={styles.shoot}>
                  <Ionicons name="camera" size={40} color="#14202B" />
                  <Text style={{ color: "#14202B", fontWeight: "800", fontSize: 17 }}>Take a zap</Text>
                  <Text style={{ color: "#3C3410", fontSize: 13 }}>Show the screen, the queue or the spot</Text>
                </Pressable>
                <Pressable onPress={() => shoot(false)} style={styles.secondary}>
                  <Ionicons name="images-outline" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Choose from gallery</Text>
                </Pressable>
                <Text style={{ color: "#A3ADB6", fontSize: 12.5, textAlign: "center" }}>
                  No photo? Tap Drop it to post the status only.
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
  choice: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#2A3037" },
  status: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: "#3A424A", alignItems: "center", justifyContent: "center" },
  shoot: { height: 220, borderRadius: 18, backgroundColor: YELLOW, alignItems: "center", justifyContent: "center", gap: 6 },
  secondary: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: "#3A424A", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  issue: { height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: "#3A424A", justifyContent: "center" },
  note: { marginHorizontal: 16, minHeight: 52, borderRadius: 12, backgroundColor: "#151A1F", color: "#fff", padding: 14, fontSize: 15 },
});
