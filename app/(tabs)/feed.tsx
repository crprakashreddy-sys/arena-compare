import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, AppState, Easing, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from "expo-camera";
import { Gesture, GestureDetector, Directions } from "react-native-gesture-handler";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "../../components/SFIcon";
import { Glass } from "../../components/Glass";
import { VideoLook } from "../../components/VideoLook";
import { LOOKS } from "../../lib/filters";
import { fetchChargers } from "../../lib/chargers";
import { fetchFeed, fetchMemories } from "../../lib/community";
import { distanceM, fmtDistance } from "../../lib/geo";
import { snapUrl } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useTabSpace } from "../../lib/tabspace";
import { successHaptic, tapHaptic, tickHaptic } from "../../lib/motion";
import type { Charger, Checkin } from "../../lib/types";
import { todaysChallenge } from "../../lib/challenges";

const LEMON = "#FCE38A";
const MAX_REC = 10;
type Flash = "off" | "on" | "auto";

/**
 * The Zings tab is the camera, like Snapchat: open the app's heart and you're ready to shoot.
 * Tap to snap, hold to record up to 10 s, swipe for looks, pinch to zoom, double-tap to flip.
 * The nearest charger is spotted for you; nearby zings and your memories are one tap away.
 */
export default function ZingCamera() {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabSpace();
  const { session } = useAuth();
  const cam = useRef<CameraView>(null);
  const [perm, askPerm] = useCameraPermissions();
  const [mic, askMic] = useMicrophonePermissions();
  const [focused, setFocused] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<Flash>("off");
  const [timer, setTimer] = useState<0 | 3 | 10>(0);
  const [grid, setGrid] = useState(false);
  const [zoom, setZoom] = useState(0);
  // Lenses: 0.5× uses the real ultra-wide camera; 2× and 2.5× zoom the main camera.
  // Each lens: id = the type to select (e.g. AVCaptureDeviceTypeBuiltInUltraWideCamera), name = "Back Ultra Wide Camera".
  const [lenses, setLensesRaw] = useState<{ id: string; name: string }[]>([]);
  const setLenses = (raw: any[]) => setLensesRaw(raw.map((l: any) => typeof l === "string"
    ? { id: l, name: l } : { id: String(l?.deviceType ?? l?.id ?? l?.localizedName ?? ""), name: String(l?.localizedName ?? l?.deviceType ?? "") }).filter((l) => l.id));
  const findLens = (re: RegExp, not?: RegExp) => lenses.find((l) => re.test(`${l.id} ${l.name}`) && !(not && not.test(`${l.id} ${l.name}`)))?.id;
  const [ultra, setUltra] = useState(false);
  // Real ultra-wide lens, or the iPhone's combined "Dual Wide"/"Triple" camera (which starts at 0.5×).
  const ULTRA = findLens(/ultra ?wide/i) ?? findLens(/dual ?wide|triple/i);
  const WIDE = findLens(/wide ?angle/i, /ultra|dual|triple|front/i) ?? findLens(/back camera/i, /ultra|dual|triple|tele/i)
    ?? findLens(/./, /ultra|tele|front|dual|triple/i);
  const canUltra = facing === "back" && (!!ULTRA || Platform.OS === "ios");
  // Ask the camera which lenses this iPhone has (the change event alone doesn't always fire).
  const readLenses = useCallback(async () => {
    try { const l: any[] | undefined = await cam.current?.getAvailableLensesAsync(); if (l?.length) setLenses(l); } catch {}
  }, []);
  useEffect(() => { const id = setTimeout(readLenses, 600); return () => clearTimeout(id); }, [facing, readLenses]);
  const onUltra = canUltra && ultra;
  const factor = onUltra ? 0.5 : 1 + zoom * 9;
  const stops = [...(canUltra ? [0.5] : []), 1, 2, 2.5];
  const litStop = stops.filter((f) => f <= factor + 0.02).pop() ?? 1;
  const goStop = (f: number) => {
    tickHaptic();
    if (f === 0.5) {
      if (!ULTRA) {
        readLenses();
        return Alert.alert("0.5× isn't ready yet", lenses.length
          ? `Your iPhone reported these cameras:\n${lenses.map((l) => l.name || l.id).join("\n")}\n\nSend this screenshot to support so we can enable 0.5×.`
          : "The camera didn't report its lenses. This usually works in the App Store version; in Expo Go it can be blocked.");
      }
      setUltra(true); setZoom(0); return;
    }
    setUltra(false); setZoom((f - 1) / 9);
  };
  const [lookIdx, setLookIdx] = useState(LOOKS.findIndex((l) => l.id === "zing"));
  const [mode, setMode] = useState<"picture" | "video">("picture");
  const today = todaysChallenge();
  const [inChallenge, setInChallenge] = useState(false);
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [whiteout, setWhiteout] = useState(false);
  const [near, setNear] = useState<{ c: Charger; d: number } | null>(null);
  const [nearby, setNearby] = useState<Checkin[]>([]);
  const [last, setLast] = useState<string | null>(null);
  const prog = useRef(new Animated.Value(0)).current;
  const lookFlash = useRef(new Animated.Value(0)).current;
  const holdTimer = useRef<any>(null);
  const zoomBase = useRef(0);
  const look = LOOKS[Math.max(0, lookIdx)];

  // Only run the camera while this tab is on screen and the app is open (saves battery).
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => { const s = AppState.addEventListener("change", (st) => setActive(st === "active")); return () => s.remove(); }, []);

  // Where am I: nearest charger, zings nearby, my last zing.
  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const lp = await Location.getForegroundPermissionsAsync();
        if (lp.granted) {
          const p = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
          if (p) {
            const { latitude: lat, longitude: lng } = p.coords;
            fetchChargers(lat, lng, 5).then((list) => {
              const best = list.map((c) => ({ c, d: distanceM(lat, lng, c.lat, c.lng) })).sort((a, b) => a.d - b.d)[0];
              setNear(best ?? null);
            }).catch(() => {});
            fetchFeed(lat, lng, 25).then(setNearby).catch(() => {});
          }
        }
        if (session) fetchMemories(session.user.id).then((m) => setLast(m[0]?.photo_path ?? null)).catch(() => {});
      } catch {}
    })();
  }, [session?.user.id]));

  const go = (uri: string, kind: "photo" | "video") => {
    successHaptic();
    router.push({ pathname: "/zap/[id]", params: { id: near && near.d <= 400 ? encodeURIComponent(near.c.id) : "nearest", uri: encodeURIComponent(uri), kind, look: look.id, ...(inChallenge ? { challenge: today.id } : {}) } });
  };

  const snap = async () => {
    if (!cam.current) return;
    if (facing === "front" && flash !== "off") { setWhiteout(true); await new Promise((r) => setTimeout(r, 180)); }
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.92, skipProcessing: false });
      setWhiteout(false);
      if (pic?.uri) go(pic.uri, "photo");
    } catch { setWhiteout(false); }
  };
  const withTimer = (fn: () => void) => {
    if (!timer) return fn();
    let n = timer; setCount(n);
    const iv = setInterval(() => { n -= 1; tickHaptic(); if (n <= 0) { clearInterval(iv); setCount(null); fn(); } else setCount(n); }, 1000);
  };

  // Hold to record: switch to video, fill the ring, stop at 10 s or when you let go.
  const startRec = async () => {
    if (!mic?.granted) { const r = await askMic(); if (!r.granted) { /* record silently */ } }
    setMode("video");
    await new Promise((r) => setTimeout(r, 350));
    if (!cam.current) return;
    setRecording(true); tapHaptic();
    prog.setValue(0);
    Animated.timing(prog, { toValue: 1, duration: MAX_REC * 1000, easing: Easing.linear, useNativeDriver: false }).start();
    try {
      const v = await cam.current.recordAsync({ maxDuration: MAX_REC });
      if (v?.uri) go(v.uri, "video");
    } catch {}
    setRecording(false); prog.stopAnimation(); prog.setValue(0); setMode("picture");
  };
  const stopRec = () => { if (recording) cam.current?.stopRecording(); };

  const onPressIn = () => { holdTimer.current = setTimeout(() => { holdTimer.current = null; startRec(); }, 260); };
  const onPressOut = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; withTimer(snap); }
    else stopRec();
  };

  const pickFromLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsEditing: true, videoMaxDuration: MAX_REC, quality: 0.92 });
    const a = res.assets?.[0];
    if (!res.canceled && a) go(a.uri, a.type === "video" ? "video" : "photo");
  };

  const setLook = (i: number) => {
    const n = Math.max(0, Math.min(LOOKS.length - 1, i));
    if (n === lookIdx) return;
    tickHaptic(); setLookIdx(n);
    lookFlash.setValue(1);
    Animated.timing(lookFlash, { toValue: 0, duration: 900, delay: 300, useNativeDriver: true }).start();
  };

  const flip = () => { tapHaptic(); setFacing((f) => (f === "back" ? "front" : "back")); };
  const pinch = Gesture.Pinch().runOnJS(true)
    .onStart(() => { zoomBase.current = zoom; })
    .onUpdate((e) => {
      // Pinch out past 1× hops to the ultra-wide lens; pinch in from it hops back.
      if (onUltra) { if (e.scale > 1.35 && !recording) { setUltra(false); setZoom(0); zoomBase.current = 0; } return; }
      if (canUltra && ULTRA && !recording && zoom < 0.01 && e.scale < 0.7) { tickHaptic(); setUltra(true); return; }
      setZoom(Math.max(0, Math.min(0.6, zoomBase.current + (e.scale - 1) * 0.25)));
    });
  const dbl = Gesture.Tap().numberOfTaps(2).runOnJS(true).onEnd(flip);
  const swipeL = Gesture.Fling().direction(Directions.LEFT).runOnJS(true).onEnd(() => setLook(lookIdx + 1));
  const swipeR = Gesture.Fling().direction(Directions.RIGHT).runOnJS(true).onEnd(() => setLook(lookIdx - 1));
  const swipeUp = Gesture.Fling().direction(Directions.UP).runOnJS(true).onEnd(() => router.push("/nearby"));
  const gestures = Gesture.Race(pinch, dbl, Gesture.Simultaneous(swipeL, swipeR, swipeUp));

  if (!perm) return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  if (!perm.granted) {
    return (
      <View style={[s.permWrap, { paddingTop: insets.top + 40, paddingBottom: tabSpace + 30 }]}>
        <Text style={{ fontSize: 64 }}>📸</Text>
        <Text style={s.permTitle}>Your zing camera</Text>
        <Text style={s.permBody}>Snap the charger, the queue or the view. Tap to shoot, hold to record. Your photos help the next driver.</Text>
        <Pressable onPress={() => (perm.canAskAgain ? askPerm() : Linking.openSettings())} style={s.permBtn}>
          <Text style={{ color: "#1A1A1A", fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 17 }}>{perm.canAskAgain ? "Turn on camera" : "Open Settings"}</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/nearby")} style={{ padding: 12 }}><Text style={{ color: "#C9CED3", fontWeight: "700" }}>See zings near you instead</Text></Pressable>
      </View>
    );
  }

  const ringR = 38, ringC = 2 * Math.PI * ringR;
  const faces = [...new Map(nearby.map((z) => [z.user_id, z])).values()].slice(0, 3);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <GestureDetector gesture={gestures}>
        <View style={StyleSheet.absoluteFill}>
          {focused && active && (
            <CameraView ref={cam} style={StyleSheet.absoluteFill} facing={facing} mode={mode} zoom={onUltra ? 0 : zoom}
              selectedLens={facing === "back" ? (onUltra ? ULTRA : WIDE) : undefined}
              onAvailableLensesChanged={(e: any) => { if (e?.lenses?.length) setLenses(e.lenses); }}
              onCameraReady={readLenses}
              flash={facing === "back" ? flash : "off"} enableTorch={facing === "back" && flash === "on" && recording} mirror={facing === "front"} />
          )}
          <VideoLook look={look.id} width={W} height={H} />
          {grid && (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {[1, 2].map((k) => <View key={`v${k}`} style={[s.gridV, { left: (W / 3) * k }]} />)}
              {[1, 2].map((k) => <View key={`h${k}`} style={[s.gridH, { top: (H / 3) * k }]} />)}
            </View>
          )}
        </View>
      </GestureDetector>

      {/* Look name, flashed when you swipe */}
      <Animated.View pointerEvents="none" style={[s.lookName, { opacity: lookFlash, top: H * 0.42 }]}>
        <Text style={s.lookText}>{look.name}</Text>
      </Animated.View>
      {count != null && <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.center]}><Text style={s.count}>{count}</Text></View>}
      {whiteout && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#FFF9E8" }]} />}

      {/* Top: nearby zings, where you are */}
      <View style={[s.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Pressable onPress={() => router.push("/nearby")} accessibilityLabel="Zings near you">
          <Glass style={s.nearbyPill} interactive>
            {faces.length > 0 ? (
              <View style={{ flexDirection: "row" }}>
                {faces.map((z, i) => (
                  <View key={z.id} style={[s.face, { marginLeft: i ? -10 : 0, zIndex: 3 - i }]}>
                    {z.photo_path ? <Image source={{ uri: snapUrl(z.photo_path) }} style={{ width: 26, height: 26 }} contentFit="cover" /> : null}
                  </View>
                ))}
              </View>
            ) : <Ionicons name="flash" size={16} color={LEMON} />}
            <Text style={s.pillText}>{nearby.length ? `${nearby.length} nearby` : "Nearby"}</Text>
          </Glass>
        </Pressable>
        {near && (
          <Glass style={s.where}>
            <Text style={s.whereText} numberOfLines={1}>📍 {near.d <= 400 ? near.c.name : `${near.c.name} · ${fmtDistance(near.d)}`}</Text>
          </Glass>
        )}
      </View>

      {/* Today's challenge: one tap to join, the next shot carries the tag */}
      <Pressable onPress={() => { tickHaptic(); setInChallenge((v) => !v); }} style={[s.challenge, { top: insets.top + 56 }]}
        accessibilityRole="switch" accessibilityState={{ checked: inChallenge }} accessibilityLabel={`Today's challenge: ${today.title}`}>
        <Glass style={[s.challengePill, inChallenge && { backgroundColor: LEMON }]} interactive>
          <Text style={{ fontSize: 14 }}>{today.emoji}</Text>
          <Text style={[s.challengeText, inChallenge && { color: "#1A1A1A" }]} numberOfLines={1}>
            {inChallenge ? `In: ${today.title}` : `Today: ${today.title}`}
          </Text>
        </Glass>
      </Pressable>

      {/* Right rail: flip, flash, timer, grid */}
      <View style={[s.rail, { top: insets.top + 62 }]}>
        {([
          [flip, "camera-reverse", "Flip"],
          [() => { tapHaptic(); setFlash((f) => (f === "off" ? "on" : f === "on" ? "auto" : "off")); }, flash === "off" ? "flash-off" : "flash", flash === "auto" ? "Auto" : flash === "on" ? "On" : "Flash"],
          [() => { tapHaptic(); setTimer((t) => (t === 0 ? 3 : t === 3 ? 10 : 0)); }, "timer-outline", timer ? `${timer}s` : "Timer"],
          [() => { tapHaptic(); setGrid((g) => !g); }, "grid-outline", grid ? "Grid on" : "Grid"],
          [() => { tapHaptic(); router.push("/zing-map"); }, "map-outline", "Map"],
        ] as const).map(([fn, icon, label]) => (
          <Pressable key={label} onPress={fn as any} style={s.railBtn} accessibilityLabel={label}>
            <Glass style={s.railGlass} interactive><Ionicons name={icon as any} size={20} color={(label === "On" || label === "Auto" || /s$/.test(label) || label === "Grid on") ? LEMON : "#fff"} /></Glass>
            <Text style={s.railLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Looks carousel + shutter */}
      <View style={[s.bottom, { bottom: tabSpace + 8 }]} pointerEvents="box-none">
        {/* Zoom stops, iPhone-camera style */}
        <Pressable onLongPress={() => Alert.alert("Camera lenses", lenses.length ? lenses.map((l) => `${l.name}\n${l.id}`).join("\n\n") : "None reported by the camera")} delayLongPress={600}>
        <Glass style={s.zoomBar}>
          {stops.map((f) => {
            if (f === 0.5 && recording) return null;
            const lit = f === litStop;
            const exact = Math.abs(factor - f) < 0.05;
            const label = lit ? `${exact ? (f === 0.5 ? ".5" : f) : factor.toFixed(1)}×` : f === 0.5 ? ".5" : String(f);
            return (
              <Pressable key={f} onPress={() => goStop(f)} hitSlop={6} accessibilityLabel={`${f}× zoom`} style={[s.zoomStop, lit && s.zoomStopOn]}>
                <Text style={[s.zoomText, lit && { color: "#1A1A1A", fontSize: 12.5 }]}>{label}</Text>
              </Pressable>
            );
          })}
        </Glass>
        </Pressable>
        {!recording && (
          <View style={s.looks}>
            {LOOKS.map((l, i) => Math.abs(i - lookIdx) <= 3 ? (
              <Pressable key={l.id} onPress={() => setLook(i)} style={[s.lookDot, i === lookIdx && s.lookDotOn]}>
                <Text style={[s.lookDotText, i === lookIdx && { color: "#1A1A1A" }]} numberOfLines={1}>{l.name}</Text>
              </Pressable>
            ) : null)}
          </View>
        )}
        <View style={s.shutterRow}>
          <Pressable onPress={() => router.push(session ? "/memories" : "/login")} style={s.side} accessibilityLabel="Memories">
            {last ? <Image source={{ uri: snapUrl(last) }} style={s.memThumb} contentFit="cover" /> : <Glass style={s.sideGlass}><Ionicons name="albums-outline" size={22} color="#fff" /></Glass>}
          </Pressable>

          <Pressable onPressIn={onPressIn} onPressOut={onPressOut} accessibilityLabel="Tap to snap, hold to record" style={s.shutterWrap}>
            <View style={[s.shutterRing, recording && { borderColor: "rgba(255,59,48,0.35)", transform: [{ scale: 1.18 }] }]} />
            {recording && (
              <Animated.View style={[s.recFill, { transform: [{ scale: 1.18 }], opacity: prog.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }]}>
                <Animated.View style={{ position: "absolute", left: 0, bottom: 0, right: 0, backgroundColor: "#FF3B30",
                  height: prog.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
              </Animated.View>
            )}
            <View style={[s.shutterCore, recording && { backgroundColor: "#FF3B30", width: 34, height: 34, borderRadius: 10 }]} />
          </Pressable>

          <Pressable onPress={pickFromLibrary} style={s.side} accessibilityLabel="Choose from photos">
            <Glass style={s.sideGlass}><Ionicons name="images-outline" size={22} color="#fff" /></Glass>
          </Pressable>
        </View>
        <Text style={s.hint}>{recording ? "Recording · let go to stop" : "Tap to snap · hold to record · swipe for looks"}</Text>
      </View>
      {!focused && <View style={[StyleSheet.absoluteFill, s.center]}><ActivityIndicator color="#fff" /></View>}
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  permWrap: { flex: 1, backgroundColor: "#0B0E11", alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 30 },
  permTitle: { color: "#fff", fontSize: 28, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold" },
  permBody: { color: "#A9B3BC", textAlign: "center", lineHeight: 22, fontSize: 15.5 },
  permBtn: { backgroundColor: LEMON, height: 56, paddingHorizontal: 28, borderRadius: 28, justifyContent: "center", marginTop: 8 },
  top: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14 },
  nearbyPill: { flexDirection: "row", alignItems: "center", gap: 8, height: 42, paddingHorizontal: 10, borderRadius: 21, backgroundColor: "rgba(0,0,0,0.45)" },
  face: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: LEMON, overflow: "hidden", backgroundColor: "#222" },
  pillText: { color: "#fff", fontWeight: "800", fontFamily: "SpaceGrotesk_700Bold" },
  where: { flexShrink: 1, height: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  whereText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  challenge: { position: "absolute", left: 14, maxWidth: "70%" },
  challengePill: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.45)" },
  challengeText: { color: "#fff", fontWeight: "800", fontSize: 12.5 },
  rail: { position: "absolute", right: 10, alignItems: "center", gap: 12 },
  railBtn: { alignItems: "center", gap: 3 },
  railGlass: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  railLabel: { color: "#fff", fontSize: 10.5, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 3 },
  gridV: { position: "absolute", top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.45)" },
  gridH: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.45)" },
  lookName: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  lookText: { color: "#fff", fontSize: 30, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", letterSpacing: 1, textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 8 },
  count: { color: "#fff", fontSize: 140, fontWeight: "200", textShadowColor: "rgba(0,0,0,0.4)", textShadowRadius: 10 },
  bottom: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 10 },
  looks: { flexDirection: "row", gap: 6, paddingHorizontal: 12 },
  lookDot: { height: 30, paddingHorizontal: 11, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "center", maxWidth: 110 },
  lookDotOn: { backgroundColor: LEMON },
  lookDotText: { color: "#fff", fontWeight: "800", fontSize: 12.5 },
  shutterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", paddingHorizontal: 34 },
  side: { width: 50, height: 50, alignItems: "center", justifyContent: "center" },
  sideGlass: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  memThumb: { width: 46, height: 46, borderRadius: 14, borderWidth: 2, borderColor: "#fff" },
  zoomBar: { flexDirection: "row", alignItems: "center", gap: 4, padding: 4, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.35)", marginBottom: 10 },
  zoomStop: { minWidth: 34, height: 34, borderRadius: 17, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
  zoomStopOn: { backgroundColor: LEMON, minWidth: 42 },
  zoomText: { color: "#fff", fontWeight: "800", fontSize: 11.5 },
  shutterWrap: { width: 92, height: 92, alignItems: "center", justifyContent: "center" },
  shutterRing: { position: "absolute", width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: "#fff" },
  recFill: { position: "absolute", width: 84, height: 84, borderRadius: 42, overflow: "hidden" },
  shutterCore: { width: 66, height: 66, borderRadius: 33, backgroundColor: LEMON },
  hint: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 3 },
});
