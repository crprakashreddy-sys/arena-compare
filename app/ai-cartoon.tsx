import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Stack, router } from "expo-router";
import { Ionicons } from "../components/SFIcon";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { updateProfileExtras, uploadSnap } from "../lib/community";
import { aiCartoon, aiStyles, type AiStyle } from "../modules/zingd-imagine";
import { successHaptic, tapHaptic, tickHaptic } from "../lib/motion";

const STYLE_LABEL: Record<AiStyle, { name: string; emoji: string }> = {
  illustration: { name: "Illustration", emoji: "🎨" },
  animation: { name: "3D animation", emoji: "🧸" },
  sketch: { name: "Sketch", emoji: "✏️" },
};

/**
 * AI cartoon of your photo (you, your family, your EV), made on the phone by Apple Intelligence.
 * Free and private; works in the App Store build on iPhone 15 Pro and newer.
 */
export default function AiCartoon() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { profile, refreshProfile } = useAuth();
  const [styles, setStyles] = useState<AiStyle[] | null>(null);
  const [style, setStyle] = useState<AiStyle>("illustration");
  const [src, setSrc] = useState<string | null>(null);
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "make" | "save">(null);
  const W = Math.min(width - 32, 420);

  const unsupported = styles !== null && styles.length === 0;
  useEffect(() => { aiStyles().then((s) => { setStyles(s); if (s.length && !s.includes("illustration")) setStyle(s[0]); }); }, []);

  const pick = async (camera: boolean) => {
    tapHaptic();
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const img = await ImageManipulator.manipulate(res.assets[0].uri).resize({ width: 1400 }).renderAsync();
    const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
    setSrc(saved.uri); setOut(null);
    make(saved.uri); // straight from your photo, no typing
  };

  const make = async (from = src, st = style) => {
    if (!from || unsupported) return;
    setBusy("make");
    try { setOut(await aiCartoon(from, "", st)); successHaptic(); }
    catch (e: any) { Alert.alert("Couldn't make it", e?.message ?? "Try another photo."); }
    setBusy(null);
  };

  const savePhoto = async () => {
    if (!out || !profile) return router.push("/login");
    setBusy("save");
    try {
      const sq = await ImageManipulator.manipulate(out).resize({ width: 900 }).renderAsync();
      const b = await sq.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
      const path = await uploadSnap(b.base64!);
      await updateProfileExtras(profile.id, { avatar_path: path });
      await refreshProfile(); successHaptic(); router.back();
    } catch (e: any) { Alert.alert("Didn't save", e?.message ?? "Try again."); }
    setBusy(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: "AI cartoon" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {unsupported && (
          <View style={[s.note, { backgroundColor: t.surface }]}>
            <Text style={{ fontSize: 22 }}>✨</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.text, fontWeight: "800" }}>Coming with the App Store version</Text>
              <Text style={{ color: t.muted, lineHeight: 19 }}>AI cartoons run on the phone with Apple Intelligence (iPhone 15 Pro and newer). They can't run inside Expo Go. Meanwhile, try Make my cartoon or Cartoon my car.</Text>
            </View>
          </View>
        )}

        <View style={[s.stage, { width: W, height: W * 1.25, backgroundColor: t.surface, borderColor: t.line }]}>
          {out || src ? (
            <Image source={{ uri: out ?? src! }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
          ) : (
            <View style={{ alignItems: "center", gap: 8, padding: 24 }}>
              <Text style={{ fontSize: 48 }}>👨‍👩‍👦🚙</Text>
              <Text style={[s.h, { color: t.text }]}>You, your people, your EV</Text>
              <Text style={{ color: t.muted, textAlign: "center", lineHeight: 20 }}>Upload a photo: a selfie, your family on delivery day, you with your car. We redraw it as art, nothing to type.</Text>
            </View>
          )}
          {busy === "make" && (
            <View style={[StyleSheet.absoluteFill, s.center, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
              <ActivityIndicator color="#fff" size="large" />
              <Text style={{ color: "#fff", fontWeight: "800", marginTop: 10 }}>Drawing on your phone…</Text>
            </View>
          )}
          {!!out && <View style={s.badge}><Text style={{ color: "#1A1A1A", fontWeight: "900", fontSize: 12 }}>✨ AI</Text></View>}
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable onPress={() => pick(false)} style={[s.btn, { borderColor: t.line }]}>
            <Ionicons name="images" size={18} color={t.text} /><Text style={{ color: t.text, fontWeight: "800" }}>{src ? "Change photo" : "Choose photo"}</Text>
          </Pressable>
          <Pressable onPress={() => pick(true)} style={[s.btn, { borderColor: t.line }]}>
            <Ionicons name="camera" size={18} color={t.text} /><Text style={{ color: t.text, fontWeight: "800" }}>Take one</Text>
          </Pressable>
        </View>

        <Text style={[s.label, { color: t.text }]}>Style</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(styles?.length ? styles : (Object.keys(STYLE_LABEL) as AiStyle[])).map((k) => (
            <Pressable key={k} onPress={() => { tickHaptic(); setStyle(k); if (src && !busy) make(src, k); }}
              style={[s.style, { backgroundColor: style === k ? CTA : t.surface, borderColor: style === k ? CTA : t.line }]}>
              <Text style={{ fontSize: 22 }}>{STYLE_LABEL[k].emoji}</Text>
              <Text style={{ color: style === k ? ON_CTA : t.text, fontWeight: "800", fontSize: 12.5 }}>{STYLE_LABEL[k].name}</Text>
            </Pressable>
          ))}
        </View>

      </ScrollView>

      <View style={[s.footer, { backgroundColor: t.bg, borderTopColor: t.line }]}>
        {out ? (
          <>
            <Pressable onPress={() => Share.share({ url: out })} style={[s.ghost, { borderColor: t.line }]}><Ionicons name="share-outline" size={20} color={t.text} /></Pressable>
            <Pressable onPress={() => router.push({ pathname: "/zap/[id]", params: { id: "nearest", uri: encodeURIComponent(out), kind: "picture", look: "original" } })}
              style={[s.ghost, { borderColor: t.line }]} accessibilityLabel="Post as a zing"><Ionicons name="flash" size={20} color={t.text} /></Pressable>
            <Pressable onPress={savePhoto} disabled={!!busy} style={s.cta}>
              {busy === "save" ? <ActivityIndicator color={ON_CTA} /> : <Text style={s.ctaText}>Use as my photo</Text>}
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => unsupported
              ? Alert.alert("Needs the App Store version", "AI cartoons are drawn by Apple Intelligence on your iPhone. Expo Go can't run them. They'll work as soon as zingd is installed as a real app (after your Apple Developer approval, run sh cloud.sh).")
              : make()}
            disabled={!src || !!busy} style={[s.cta, (!src || unsupported) && { opacity: 0.55 }]}>
            {busy === "make" ? <ActivityIndicator color={ON_CTA} /> : <Text style={s.ctaText}>{unsupported ? "🔒 Works in the App Store version" : "✨ Make my AI cartoon"}</Text>}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  note: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 18 },
  stage: { alignSelf: "center", borderRadius: 26, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  h: { fontSize: 19, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold" },
  badge: { position: "absolute", top: 12, left: 12, backgroundColor: "#FCE38A", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 23, borderWidth: 1 },
  label: { fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", marginBottom: -6 },
  style: { flex: 1, height: 74, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  input: { height: 46, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, padding: 16, paddingBottom: 34, borderTopWidth: StyleSheet.hairlineWidth },
  ghost: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cta: { flex: 1, height: 52, borderRadius: 26, backgroundColor: CTA, alignItems: "center", justifyContent: "center" },
  ctaText: { color: ON_CTA, fontWeight: "900", fontSize: 16, fontFamily: "SpaceGrotesk_700Bold" },
});
