import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Canvas, Circle, Group, ImageFormat, ImageSVG, Skia, useCanvasRef } from "@shopify/react-native-skia";
import { Stack, router } from "expo-router";
import { Ionicons } from "../components/SFIcon";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { useGarage } from "../lib/vehicles";
import { updateProfileExtras, uploadSnap } from "../lib/community";
import {
  BGS, CAR_COLORS, CAR_SHAPES, HAIR_COLORS, HAIR_STYLES, SHIRTS, SKINS, avatarSvg, randomAvatar, shapeFor, type AvatarOpts,
} from "../lib/avatar";
import { Icon, type IconName } from "../components/Icon";
import * as ImagePicker from "expo-image-picker";
import { avatarFromSelfie, carColourFromPhoto } from "../lib/selfieAvatar";
import { successHaptic, tapHaptic } from "../lib/motion";

const INK = "#1A1A1A";
const LEMON = "#FCE38A";
const SIZE = 260;
const TWO_SHAPES = new Set(["scooter", "bike"]);

/** Free cartoon avatar of you with your EV. Drawn on the phone, saved as your profile photo. */
export default function AvatarMaker() {
  const t = useTheme();
  const { profile, refreshProfile } = useAuth();
  const { active } = useGarage();
  const [o, setO] = useState<AvatarOpts>(() => ({ ...randomAvatar(shapeFor(active)), bg: 0 }));
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<null | "face" | "car">(null);
  const [tune, setTune] = useState(false);
  const [fromSelfie, setFromSelfie] = useState(false);

  // One tap: snap a selfie, we read your skin tone, hair colour, hair length and beard.
  const snapSelfie = async () => {
    tapHaptic();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert("Camera is off", "Allow camera access in Settings to make your cartoon from a selfie.");
    const res = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    setReading("face");
    try {
      const got = await avatarFromSelfie(res.assets[0].uri);
      setO((v) => ({ ...v, ...got, bg: v.bg }));
      setFromSelfie(true); successHaptic();
    } catch (e: any) { Alert.alert("Couldn't read the selfie", e?.message ?? "Try again in better light."); }
    setReading(null);
  };
  // Optional: a photo of your car so the cartoon car is your exact paint colour.
  const pickCarPhoto = async () => {
    tapHaptic();
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    setReading("car");
    try { const carHex = await carColourFromPhoto(res.assets[0].uri); setO((v) => ({ ...v, carHex })); successHaptic(); }
    catch { Alert.alert("Couldn't read that photo", "Try one where the car fills most of the frame."); }
    setReading(null);
  };
  const [rideKind, setRideKind] = useState<"car" | "two">(() => (TWO_SHAPES.has(o.car) ? "two" : "car"));
  const ref = useCanvasRef();

  const svg = useMemo(() => { try { return Skia.SVG.MakeFromString(avatarSvg(o)); } catch { return null; } }, [o]);
  const set = (p: Partial<AvatarOpts>) => setO((v) => ({ ...v, ...p }));
  const clip = useMemo(() => Skia.RRectXY(Skia.XYWHRect(0, 0, SIZE, SIZE), SIZE / 2, SIZE / 2), []);

  const save = async () => {
    if (!profile) return router.push("/login");
    setBusy(true);
    try {
      const b64 = ref.current?.makeImageSnapshot()?.encodeToBase64(ImageFormat.JPEG, 92);
      if (!b64) throw new Error("Couldn't draw the avatar. Try again.");
      const path = await uploadSnap(b64);
      await updateProfileExtras(profile.id, { avatar_path: path });
      await refreshProfile();
      router.back();
    } catch (e: any) { Alert.alert("Avatar didn't save", e?.message ?? "Try again."); setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: "Make my cartoon" }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ alignItems: "center", paddingVertical: 20, gap: 14 }}>
          <View style={styles.ring}>
            <Canvas ref={ref} style={{ width: SIZE, height: SIZE }}>
              <Group clip={clip}>
                <Circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2} color={BGS[o.bg]} />
                {svg && (
                  // The SVG is drawn at its own 512 × 512 size and scaled down, so nothing gets cropped.
                  <Group transform={[{ scale: SIZE / 512 }]}>
                    <ImageSVG svg={svg} x={0} y={0} width={512} height={512} />
                  </Group>
                )}
              </Group>
            </Canvas>
          </View>
          <Pressable onPress={snapSelfie} disabled={!!reading} style={[styles.dice, { paddingHorizontal: 22 }]}>
            {reading === "face" ? <ActivityIndicator color={ON_CTA} /> : <Ionicons name="camera" size={18} color={ON_CTA} />}
            <Text style={{ color: ON_CTA, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>{fromSelfie ? "Retake selfie" : "Make it from my selfie"}</Text>
          </Pressable>
          <Text style={{ color: t.muted, fontSize: 12.5, textAlign: "center", paddingHorizontal: 30 }}>
            {fromSelfie ? "Got your skin tone, hair and beard ✓" : "Snap a selfie and crop so your face fills the square. We match your skin, hair and beard. The photo never leaves your phone."}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={pickCarPhoto} disabled={!!reading} style={[styles.ghostBtn, { borderColor: t.line }]}>
              {reading === "car" ? <ActivityIndicator color={t.text} /> : <Ionicons name="car-sport" size={16} color={t.text} />}
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 13 }}>{o.carHex ? "Car colour matched ✓" : active ? `Match my ${active.model.split(" ").slice(0, 2).join(" ")}'s colour` : "Match my car's colour"}</Text>
            </Pressable>
            <Pressable onPress={() => setO({ ...randomAvatar(o.car), carColor: o.carColor, carHex: o.carHex })} style={[styles.ghostBtn, { borderColor: t.line }]}>
              <Icon name="shuffle" size={15} color={t.text} />
            </Pressable>
          </View>
        </View>

        <Pressable onPress={() => setTune((v) => !v)} style={[styles.tuneRow, { borderColor: t.line }]}>
          <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", flex: 1 }}>Fine-tune</Text>
          <Text style={{ color: t.muted, fontSize: 12.5 }}>{tune ? "Hide" : "Optional"}</Text>
          <Ionicons name={tune ? "chevron-up" : "chevron-down"} size={18} color={t.muted} />
        </Pressable>
        {tune && (<>

        <Row label="Skin" t={t}>{SKINS.map((c, i) => <Dot key={c} color={c} on={!o.skinHex && o.skin === i} onPress={() => set({ skin: i, skinHex: null })} />)}</Row>
        <Row label="Hair" t={t}>{HAIR_STYLES.map((h, i) => <Pill key={h} label={h} on={o.hair === i} onPress={() => set({ hair: i })} t={t} />)}</Row>
        <Row label="Hair colour" t={t}>{HAIR_COLORS.map((c, i) => <Dot key={c} color={c} on={!o.hairHex && o.hairColor === i} onPress={() => set({ hairColor: i, hairHex: null })} />)}</Row>
        <Row label="Eyes" t={t}>{["Classic", "Happy", "Wide"].map((h, i) => <Pill key={h} label={h} on={o.eyes === i} onPress={() => set({ eyes: i })} t={t} />)}</Row>
        <Row label="Smile" t={t}>{["Smile", "Big grin", "Chill"].map((h, i) => <Pill key={h} label={h} on={o.mouth === i} onPress={() => set({ mouth: i })} t={t} />)}</Row>
        <View style={[styles.toggles, { borderColor: t.line }]}>
          <Toggle icon="glasses" label="Glasses" value={o.glasses} onChange={(glasses) => set({ glasses })} t={t} />
          <Toggle icon="beard" label="Beard" value={o.beard} onChange={(beard) => set({ beard })} t={t} />
        </View>
        <Row label="Top" t={t}>{SHIRTS.map((c, i) => <Dot key={c} color={c} on={o.shirt === i} onPress={() => set({ shirt: i })} />)}</Row>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginTop: 18 }}>
          <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" }}>Your ride</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {(["car", "two"] as const).map((k) => (
              <Pill key={k} label={k === "car" ? "Cars" : "2-wheelers"} on={rideKind === k} t={t}
                onPress={() => { setRideKind(k); set({ car: k === "car" ? "suv" : "scooter" }); }} />
            ))}
          </View>
        </View>
        <Row label="" t={t}>{CAR_SHAPES.filter((c) => (rideKind === "two") === TWO_SHAPES.has(c.key))
          .map((c) => <Pill key={c.key} label={c.label} on={o.car === c.key} onPress={() => set({ car: c.key })} t={t} />)}</Row>
        <Row label="Ride colour" t={t}>{CAR_COLORS.map((c, i) => <Dot key={c} color={c} on={!o.carHex && o.carColor === i} onPress={() => set({ carColor: i, carHex: null })} />)}</Row>
        </>)}
        <Row label="Background" t={t}>{BGS.map((c, i) => <Dot key={c} color={c} on={o.bg === i} onPress={() => set({ bg: i })} />)}</Row>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: t.bg, borderTopColor: t.line }]}>
        <Pressable onPress={save} disabled={busy} style={styles.save}>
          {busy ? <ActivityIndicator color={ON_CTA} /> : (
            <><Ionicons name="checkmark-circle" size={20} color={ON_CTA} /><Text style={styles.saveText}>Use as my photo</Text></>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Row({ label, children, t }: { label: string; children: React.ReactNode; t: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ marginTop: 14 }}>
      {!!label && <Text style={{ color: t.text, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", paddingHorizontal: 16, marginBottom: 8 }}>{label}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>{children}</ScrollView>
    </View>
  );
}
function Dot({ color, on, onPress }: { color: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.dot, { borderColor: on ? INK : "transparent" }]}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color, borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" }} />
    </Pressable>
  );
}
function Pill({ label, on, onPress, t }: { label: string; on: boolean; onPress: () => void; t: ReturnType<typeof useTheme> }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, { backgroundColor: on ? CTA : t.surface }]}>
      <Text style={{ color: on ? ON_CTA : t.text, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}
function Toggle({ label, icon, value, onChange, t }: { label: string; icon: IconName; value: boolean; onChange: (v: boolean) => void; t: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name={icon} size={18} color={t.text} /><Text style={{ color: t.text, fontWeight: "700" }}>{label}</Text></View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  ghostBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1 },
  tuneRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 8, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  ring: { padding: 6, borderRadius: SIZE, backgroundColor: INK },
  dice: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: CTA, paddingHorizontal: 18, height: 42, borderRadius: 999 },
  dot: { width: 42, height: 42, borderRadius: 21, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  toggles: { flexDirection: "row", marginHorizontal: 16, marginTop: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 30, borderTopWidth: StyleSheet.hairlineWidth },
  save: { backgroundColor: CTA, height: 54, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: ON_CTA, fontSize: 17, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
});
