import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Stack, router } from "expo-router";
import { Ionicons } from "../components/SFIcon";
import { useTheme, CTA, ON_CTA } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { snapUrl } from "../lib/supabase";
import { updateProfileExtras } from "../lib/community";
import { NoCreditsError, PACKS, PREMIUM_STYLES, buyPack, fetchAiCredits, makeAiCartoon, setupPurchases, type PremiumStyle } from "../lib/aiCredits";
import { successHaptic, tapHaptic, tickHaptic } from "../lib/motion";

/**
 * Premium AI cartoon: upload a photo (you, your family, your EV) and it's redrawn as art,
 * faces and car kept exactly. 1 free, then packs from the App Store.
 */
export default function AiCartoon() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { profile, session, refreshProfile } = useAuth();
  const [style, setStyle] = useState<PremiumStyle>("comic");
  const [src, setSrc] = useState<string | null>(null);
  const [outPath, setOutPath] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | "make" | "save" | "buy">(null);
  const [shop, setShop] = useState(false);
  const W = Math.min(width - 32, 420);

  const refresh = useCallback(() => { fetchAiCredits().then(setCredits).catch(() => setCredits(0)); }, []);
  useEffect(() => {
    if (!session) return;
    refresh();
    setupPurchases(session.user.id);
  }, [session, refresh]);

  const pick = async (camera: boolean) => {
    tapHaptic();
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    setSrc(res.assets[0].uri); setOutPath(null);
  };

  const make = async () => {
    if (!session) return router.push("/login");
    if (!src) return;
    if (credits === 0) return setShop(true);
    setBusy("make");
    try {
      const r = await makeAiCartoon(src, style);
      setOutPath(r.path); setCredits(r.credits); successHaptic();
    } catch (e: any) {
      if (e instanceof NoCreditsError) { setCredits(0); setShop(true); }
      else Alert.alert("Couldn't make it", e?.message ?? "Try again.");
    }
    setBusy(null);
  };

  const buy = async (id: string) => {
    setBusy("buy");
    try {
      const r = await buyPack(id);
      if (r === "bought") {
        successHaptic();
        setTimeout(refresh, 2500); // credits arrive from the App Store a moment later
        setShop(false);
        Alert.alert("Pack added ✨", "Your cartoons are ready to use.");
      }
    } catch (e: any) { Alert.alert("Not yet", e?.message ?? "Try again."); }
    setBusy(null);
  };

  const savePhoto = async () => {
    if (!outPath || !profile) return;
    setBusy("save");
    try { await updateProfileExtras(profile.id, { avatar_path: outPath }); await refreshProfile(); successHaptic(); router.back(); }
    catch (e: any) { Alert.alert("Didn't save", e?.message ?? "Try again."); }
    setBusy(null);
  };

  const out = outPath ? snapUrl(outPath) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{
        title: "AI cartoon",
        headerRight: () => credits != null ? (
          <Pressable onPress={() => setShop(true)} style={[s.credits, { backgroundColor: t.surface }]}>
            <Text style={{ color: t.text, fontWeight: "900", fontSize: 13 }}>✨ {credits}</Text>
          </Pressable>
        ) : null,
      }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 140 }}>
        <View style={[s.stage, { width: W, height: W * 1.25, backgroundColor: t.surface, borderColor: t.line }]}>
          {out || src ? (
            <Image source={{ uri: out ?? src! }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          ) : (
            <View style={{ alignItems: "center", gap: 8, padding: 24 }}>
              <Text style={{ fontSize: 48 }}>👨‍👩‍👦🚙</Text>
              <Text style={[s.h, { color: t.text }]}>You, your people, your EV</Text>
              <Text style={{ color: t.muted, textAlign: "center", lineHeight: 20 }}>
                Upload a photo. We redraw it as art and keep every face, pose and your car exactly as they are.
              </Text>
            </View>
          )}
          {busy === "make" && (
            <View style={[StyleSheet.absoluteFill, s.center, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
              <ActivityIndicator color="#fff" size="large" />
              <Text style={{ color: "#fff", fontWeight: "800", marginTop: 10 }}>Painting your cartoon…</Text>
              <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 4, fontSize: 12.5 }}>Takes about 10–20 seconds</Text>
            </View>
          )}
          {!!out && <View style={s.badge}><Text style={{ color: "#1A1A1A", fontWeight: "900", fontSize: 12 }}>✨ AI</Text></View>}
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable onPress={() => pick(false)} style={[s.btn, { borderColor: t.line }]}>
            <Ionicons name="images" size={18} color={t.text} /><Text style={{ color: t.text, fontWeight: "800" }}>{src ? "Change photo" : "Upload photo"}</Text>
          </Pressable>
          <Pressable onPress={() => pick(true)} style={[s.btn, { borderColor: t.line }]}>
            <Ionicons name="camera" size={18} color={t.text} /><Text style={{ color: t.text, fontWeight: "800" }}>Take one</Text>
          </Pressable>
        </View>

        <Text style={[s.label, { color: t.text }]}>Style</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PREMIUM_STYLES.map((st) => {
            const on = style === st.id;
            return (
              <Pressable key={st.id} onPress={() => { tickHaptic(); setStyle(st.id); }}
                style={[s.style, { width: (W - 16) / 3, backgroundColor: on ? CTA : t.surface, borderColor: on ? CTA : t.line }]}>
                <Text style={{ fontSize: 22 }}>{st.emoji}</Text>
                <Text style={{ color: on ? ON_CTA : t.text, fontWeight: "800", fontSize: 12.5 }}>{st.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ color: t.faint, fontSize: 12, lineHeight: 17 }}>
          Your photo is sent securely to make the cartoon, then only the cartoon is saved to your account.
        </Text>
      </ScrollView>

      <View style={[s.footer, { backgroundColor: t.bg, borderTopColor: t.line }]}>
        {out && (
          <>
            <Pressable onPress={() => Share.share({ url: out })} style={[s.ghost, { borderColor: t.line }]} accessibilityLabel="Share"><Ionicons name="share-outline" size={20} color={t.text} /></Pressable>
            <Pressable onPress={make} disabled={!!busy} style={[s.ghost, { borderColor: t.line }]} accessibilityLabel="Make another"><Ionicons name="refresh" size={20} color={t.text} /></Pressable>
          </>
        )}
        {out ? (
          <Pressable onPress={savePhoto} disabled={!!busy} style={s.cta}>
            {busy === "save" ? <ActivityIndicator color={ON_CTA} /> : <Text style={s.ctaText}>Use as my photo</Text>}
          </Pressable>
        ) : (
          <Pressable onPress={make} disabled={!src || !!busy} style={[s.cta, !src && { opacity: 0.5 }]}>
            {busy === "make" ? <ActivityIndicator color={ON_CTA} /> : (
              <Text style={s.ctaText}>{credits === 0 ? "Get more cartoons" : `✨ Make my cartoon${credits != null ? ` · ${credits} left` : ""}`}</Text>
            )}
          </Pressable>
        )}
      </View>

      {/* Packs */}
      <Modal visible={shop} transparent animationType="slide" onRequestClose={() => setShop(false)}>
        <Pressable style={s.scrim} onPress={() => setShop(false)}>
          <Pressable style={[s.sheet, { backgroundColor: t.bg }]} onPress={() => {}}>
            <Text style={[s.h, { color: t.text }]}>More AI cartoons ✨</Text>
            <Text style={{ color: t.muted, lineHeight: 20 }}>
              {credits ? `You have ${credits} left.` : "You've used your free cartoon."} Packs never expire. Use them for you, your family, your car.
            </Text>
            {PACKS.map((p) => (
              <Pressable key={p.id} onPress={() => buy(p.id)} disabled={!!busy} style={[s.pack, { borderColor: t.line, backgroundColor: t.surface }]}>
                <Text style={{ fontSize: 26 }}>{p.cartoons > 5 ? "🎨" : "✨"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "900", fontSize: 16 }}>{p.cartoons} cartoons</Text>
                  {p.cartoons > 5 && <Text style={{ color: t.good, fontWeight: "700", fontSize: 12.5 }}>Best value</Text>}
                </View>
                {busy === "buy" ? <ActivityIndicator color={t.text} /> : <View style={s.price}><Text style={{ color: ON_CTA, fontWeight: "900" }}>{p.price}</Text></View>}
              </Pressable>
            ))}
            <Text style={{ color: t.faint, fontSize: 12, textAlign: "center" }}>Paid with your Apple account (UPI, card).</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  credits: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  stage: { alignSelf: "center", borderRadius: 26, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  h: { fontSize: 19, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold" },
  badge: { position: "absolute", top: 12, left: 12, backgroundColor: "#FCE38A", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 23, borderWidth: 1 },
  label: { fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold", marginBottom: -6 },
  style: { height: 74, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, padding: 16, paddingBottom: 34, borderTopWidth: StyleSheet.hairlineWidth },
  ghost: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cta: { flex: 1, height: 52, borderRadius: 26, backgroundColor: CTA, alignItems: "center", justifyContent: "center" },
  ctaText: { color: ON_CTA, fontWeight: "900", fontSize: 16, fontFamily: "SpaceGrotesk_700Bold" },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 40, gap: 12 },
  pack: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 18, borderWidth: 1 },
  price: { backgroundColor: CTA, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
});
