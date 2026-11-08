import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Canvas, Circle, Group, Image as SkImage, ImageFormat, RuntimeShader, Skia, useCanvasRef, useImage } from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Stack, router } from "expo-router";
import { Ionicons } from "../components/SFIcon";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { updateProfileExtras, uploadSnap } from "../lib/community";
import { TOON_EFFECT, TOON_STYLES, toonUniforms } from "../lib/toon";
import { tapHaptic, tickHaptic, successHaptic } from "../lib/motion";

const BGS = ["#FCE38A", "#BDE7FF", "#FFC7D9", "#C9F2D6", "#E3D4FF", "#1A1A1A"];

/**
 * Cartoon of *your* car, made from your own photo. The shader traces the real outline,
 * so it's your exact model, colour and angle. Nothing leaves the phone until you save.
 */
export default function CarToon() {
  const t = useTheme();
  const { profile, refreshProfile } = useAuth();
  const { width } = useWindowDimensions();
  const SIZE = Math.min(width - 32, 360);
  const [uri, setUri] = useState<string | null>(null);
  const [styleIdx, setStyleIdx] = useState(0);
  const [bold, setBold] = useState(0.5);
  const [round, setRound] = useState(true);
  const [bg, setBg] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0, scale: 1 });
  const start = useRef(pos);
  const image = useImage(uri);
  const ref = useCanvasRef();
  const st = TOON_STYLES[styleIdx];

  const pick = async (camera: boolean) => {
    tapHaptic();
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert("Camera is off", "Allow camera access in Settings to snap your car.");
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(true);
    try {
      // Work at a sensible size so the cartoon renders instantly.
      const img = await ImageManipulator.manipulate(res.assets[0].uri).resize({ width: 1100 }).renderAsync();
      const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
      setUri(out.uri); setPos({ x: 0, y: 0, scale: 1 });
    } catch { Alert.alert("Couldn't open that photo", "Try another one."); }
    setBusy(false);
  };

  // Cover-fit the photo into the square, then apply the user's pan and pinch.
  const fit = useMemo(() => {
    if (!image) return null;
    const iw = image.width(), ih = image.height();
    const base = Math.max(SIZE / iw, SIZE / ih) * pos.scale;
    const w = iw * base, h = ih * base;
    const maxX = Math.abs(w - SIZE) / 2, maxY = Math.abs(h - SIZE) / 2;
    const x = Math.max(-maxX, Math.min(maxX, pos.x)), y = Math.max(-maxY, Math.min(maxY, pos.y));
    return { x: (SIZE - w) / 2 + x, y: (SIZE - h) / 2 + y, w, h };
  }, [image, pos, SIZE]);

  const pan = Gesture.Pan().runOnJS(true)
    .onStart(() => { start.current = pos; })
    .onUpdate((e) => setPos((p) => ({ ...p, x: start.current.x + e.translationX, y: start.current.y + e.translationY })));
  const pinch = Gesture.Pinch().runOnJS(true)
    .onStart(() => { start.current = pos; })
    .onUpdate((e) => setPos((p) => ({ ...p, scale: Math.max(0.55, Math.min(4, start.current.scale * e.scale)) })));
  const gesture = Gesture.Simultaneous(pan, pinch);

  const clip = useMemo(() => Skia.RRectXY(Skia.XYWHRect(0, 0, SIZE, SIZE), round ? SIZE / 2 : 28, round ? SIZE / 2 : 28), [SIZE, round]);

  const snapshot = () => {
    const b64 = ref.current?.makeImageSnapshot()?.encodeToBase64(ImageFormat.JPEG, 92);
    if (!b64) throw new Error("Couldn't draw the cartoon. Try again.");
    return b64;
  };

  const useAsPhoto = async () => {
    if (!profile) return router.push("/login");
    setBusy(true);
    try {
      const path = await uploadSnap(snapshot());
      await updateProfileExtras(profile.id, { avatar_path: path });
      await refreshProfile();
      successHaptic();
      router.back();
    } catch (e: any) { Alert.alert("Didn't save", e?.message ?? "Try again."); setBusy(false); }
  };

  const share = async () => {
    try { await Share.share({ url: `data:image/jpeg;base64,${snapshot()}` }); } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: "Cartoon my car" }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={{ alignItems: "center", paddingTop: 18, gap: 10 }}>
          {!uri ? (
            <View style={[styles.empty, { width: SIZE, height: SIZE, borderColor: t.line, backgroundColor: t.surface }]}>
              <Text style={{ fontSize: 54 }}>🚗</Text>
              <Text style={[styles.h, { color: t.text }]}>Your car, as a cartoon</Text>
              <Text style={{ color: t.muted, textAlign: "center", lineHeight: 20, paddingHorizontal: 26 }}>
                Snap your car from a 3/4 front angle in daylight. We trace your real car, so it's your exact model and colour.
              </Text>
              {busy ? <ActivityIndicator color={t.text} /> : (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                  <Pressable onPress={() => pick(true)} style={styles.cta}><Ionicons name="camera" size={18} color={ON_CTA} /><Text style={styles.ctaText}>Snap it</Text></Pressable>
                  <Pressable onPress={() => pick(false)} style={[styles.cta, { backgroundColor: t.bg, borderWidth: 1, borderColor: t.line }]}>
                    <Ionicons name="images" size={18} color={t.text} /><Text style={[styles.ctaText, { color: t.text }]}>From photos</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <>
              <GestureDetector gesture={gesture}>
                <View>
                  <Canvas ref={ref} style={{ width: SIZE, height: SIZE }}>
                    <Group clip={clip}>
                      <Circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE} color={BGS[bg]} />
                      {image && fit && (
                        <SkImage image={image} x={fit.x} y={fit.y} width={fit.w} height={fit.h} fit="fill">
                          {TOON_EFFECT && <RuntimeShader source={TOON_EFFECT} uniforms={toonUniforms(st, bold)} />}
                        </SkImage>
                      )}
                    </Group>
                  </Canvas>
                </View>
              </GestureDetector>
              <Text style={{ color: t.faint, fontSize: 12.5 }}>Drag and pinch to frame your car</Text>
            </>
          )}
        </View>

        {uri && (
          <>
            <Text style={[styles.label, { color: t.text }]}>Style</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
              {TOON_STYLES.map((s, i) => {
                const on = i === styleIdx;
                return (
                  <Pressable key={s.id} onPress={() => { tickHaptic(); setStyleIdx(i); }}
                    style={[styles.style, { backgroundColor: on ? CTA : t.surface, borderColor: on ? CTA : t.line }]}>
                    <Text style={{ fontSize: 22 }}>{s.emoji}</Text>
                    <Text style={{ color: on ? ON_CTA : t.text, fontWeight: "800", fontSize: 13 }}>{s.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.label, { color: t.text }]}>Line weight</Text>
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16 }}>
              {[["Fine", 0.15], ["Classic", 0.5], ["Bold", 0.95]].map(([lbl, v]) => (
                <Pressable key={lbl as string} onPress={() => { tickHaptic(); setBold(v as number); }}
                  style={[styles.pill, { backgroundColor: bold === v ? t.text : t.surface }]}>
                  <Text style={{ color: bold === v ? t.bg : t.text, fontWeight: "800" }}>{lbl}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: t.text }]}>Frame</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 }}>
              <Pressable onPress={() => { tickHaptic(); setRound(true); }} style={[styles.pill, { backgroundColor: round ? t.text : t.surface }]}>
                <Text style={{ color: round ? t.bg : t.text, fontWeight: "800" }}>Circle</Text>
              </Pressable>
              <Pressable onPress={() => { tickHaptic(); setRound(false); }} style={[styles.pill, { backgroundColor: !round ? t.text : t.surface }]}>
                <Text style={{ color: !round ? t.bg : t.text, fontWeight: "800" }}>Square</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              {BGS.map((c, i) => (
                <Pressable key={c} onPress={() => { tickHaptic(); setBg(i); }}
                  style={[styles.dot, { backgroundColor: c, borderColor: bg === i ? t.text : "transparent" }]} />
              ))}
            </View>
            <Text style={{ color: t.faint, fontSize: 12, paddingHorizontal: 16, marginTop: 6 }}>Pinch in to shrink the car and show the background colour.</Text>

            <Pressable onPress={() => pick(false)} style={styles.change}>
              <Ionicons name="refresh" size={16} color={t.muted} />
              <Text style={{ color: t.muted, fontWeight: "700" }}>Use a different photo</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {uri && (
        <View style={[styles.footer, { backgroundColor: t.bg, borderTopColor: t.line }]}>
          <Pressable onPress={share} style={[styles.ghost, { borderColor: t.line }]} accessibilityLabel="Share or save">
            <Ionicons name="share-outline" size={20} color={t.text} />
          </Pressable>
          <Pressable onPress={useAsPhoto} disabled={busy} style={styles.save}>
            {busy ? <ActivityIndicator color={ON_CTA} /> : (
              <><Ionicons name="checkmark-circle" size={20} color={ON_CTA} /><Text style={styles.saveText}>Use as my photo</Text></>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { borderRadius: 28, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 8 },
  h: { fontSize: 20, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.3 },
  cta: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: CTA },
  ctaText: { color: ON_CTA, fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
  label: { fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", paddingHorizontal: 16, marginTop: 20, marginBottom: 10 },
  style: { width: 78, height: 78, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  pill: { height: 36, paddingHorizontal: 16, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
  change: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 22, paddingVertical: 10 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, padding: 16, paddingBottom: 34, borderTopWidth: StyleSheet.hairlineWidth },
  ghost: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  save: { flex: 1, height: 52, borderRadius: 26, backgroundColor: CTA, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: ON_CTA, fontWeight: "800", fontSize: 16, fontFamily: "SpaceGrotesk_700Bold" },
});
