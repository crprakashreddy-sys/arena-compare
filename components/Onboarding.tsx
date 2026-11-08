import React, { useRef, useState } from "react";
import { Animated, Image as RNImage, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { CATALOG, addVehicle, useGarage, type VehicleKind } from "../lib/vehicles";
import { finishOnboarding, useOnboarded } from "../lib/onboarding";

const LEMON = "#FCE38A";
const INK = "#1A1A1A";
const PAGES = 4;

/** First-run welcome: what zappd does, pick your vehicle, then a friendly ask for location. */
export function Onboarding() {
  const onboarded = useOnboarded();
  if (onboarded !== false) return null;
  return <Pages />;
}

function Pages() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const x = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  const go = (p: number) => scroll.current?.scrollTo({ x: p * width, animated: true });
  const done = () => Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: true }).start(finishOnboarding);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.wrap, { opacity: fade, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={s.top}>
        <Text style={s.logo}>zappd</Text>
        {page < PAGES - 1 && (
          <Pressable onPress={() => go(PAGES - 1)} hitSlop={12}><Text style={s.skip}>Skip</Text></Pressable>
        )}
      </View>

      <Animated.ScrollView
        ref={scroll as any}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        <Slide width={width} title={"Find chargers\nthat actually work."} body="Live status from drivers who were just there. No more driving to a dead charger.">
          <Polaroid src={require("../assets/intro/z1.jpg")} caption="Tata Power · Banjara Hills" tilt={-6} />
          <Badge style={{ top: 22, right: 8 }} dot="#1FAE5B" text="Working · 4 min ago" />
          <Badge style={{ top: 150, left: 4 }} dot="#F2A93B" text="Busy · 2 in queue" />
        </Slide>

        <Slide width={width} title={"Drop a Zap.\nStack points."} body="Snap the charger, tag how it went. The closer you are when you post, the bigger your Zap Score.">
          <Polaroid src={require("../assets/intro/z3.jpg")} caption="chai break · 80%" tilt={5} />
          <View style={[s.score, { top: 14, right: 18 }]}>
            <Ionicons name="flash" size={16} color={LEMON} />
            <Text style={s.scoreText}>+42</Text>
          </View>
          <Badge style={{ top: 160, left: 2 }} icon="location" text="At the charger = 2× points" />
        </Slide>

        <PickRide width={width} />

        <Slide width={width} title={"Chargers near you,\nin one tap."} body="zappd uses your location only while the app is open, to show the closest chargers and how far they are.">
          <View style={s.pinCircle}>
            <View style={s.pinInner}><Ionicons name="navigate" size={54} color={LEMON} /></View>
          </View>
        </Slide>
      </Animated.ScrollView>

      <View style={s.dots}>
        {Array.from({ length: PAGES }).map((_, i) => {
          const w = x.interpolate({ inputRange: [(i - 1) * width, i * width, (i + 1) * width], outputRange: [8, 24, 8], extrapolate: "clamp" });
          const o = x.interpolate({ inputRange: [(i - 1) * width, i * width, (i + 1) * width], outputRange: [0.3, 1, 0.3], extrapolate: "clamp" });
          return <Animated.View key={i} style={[s.dot, { width: w, opacity: o }]} />;
        })}
      </View>

      <View style={{ paddingHorizontal: 24, gap: 10 }}>
        {page < PAGES - 1 ? (
          <Big title={page === 2 ? "Continue" : "Next"} onPress={() => go(page + 1)} />
        ) : (
          <>
            <Big title="Allow location" icon="navigate" onPress={async () => {
              try { await Location.requestForegroundPermissionsAsync(); } catch {}
              done();
            }} />
            <Pressable onPress={done} style={{ alignItems: "center", padding: 8 }}><Text style={s.later}>Not now</Text></Pressable>
          </>
        )}
      </View>
    </Animated.View>
  );
}

function Slide({ width, title, body, children }: { width: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <View style={{ width, paddingHorizontal: 28, justifyContent: "center" }}>
      <View style={s.art}>{children}</View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.body}>{body}</Text>
    </View>
  );
}

function PickRide({ width }: { width: number }) {
  const [kind, setKind] = useState<"car" | "two">("car");
  const { vehicles } = useGarage();
  const mine = new Set(vehicles.map((v) => v.id));
  const list = CATALOG.filter((m) => (kind === "car" ? m.kind === "car" : m.kind !== "car"));
  return (
    <View style={{ width, paddingHorizontal: 24 }}>
      <Text style={[s.title, { marginTop: 4 }]}>What do you drive?</Text>
      <Text style={s.body}>We'll only show chargers that fit your plug, with real charging times.</Text>
      <View style={s.toggle}>
        {(["car", "two"] as const).map((k) => (
          <Pressable key={k} onPress={() => setKind(k)} style={[s.tog, kind === k && s.togOn]}>
            <Ionicons name={k === "car" ? "car-sport" : "bicycle"} size={16} color={kind === k ? LEMON : INK} />
            <Text style={[s.togText, kind === k && { color: LEMON }]}>{k === "car" ? "Car" : "2-wheeler"}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={{ flex: 1, marginTop: 12 }} contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
        {list.map((m) => {
          const on = mine.has(m.id);
          return (
            <Pressable key={m.id} onPress={() => !on && addVehicle(m)} style={[s.car, on && s.carOn]}>
              <Text style={[s.make, on && { color: LEMON }]}>{m.make}</Text>
              <Text style={[s.model, on && { color: "#FFF" }]} numberOfLines={1}>{m.model}</Text>
              {on && <Ionicons name="checkmark-circle" size={18} color={LEMON} style={{ position: "absolute", top: 8, right: 8 }} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Polaroid({ src, caption, tilt }: { src: any; caption: string; tilt: number }) {
  return (
    <View style={[s.pol, { transform: [{ rotate: `${tilt}deg` }] }]}>
      <RNImage source={src} style={s.polImg} />
      <Text style={s.polCap} numberOfLines={1}>{caption}</Text>
    </View>
  );
}

function Badge({ text, dot, icon, style }: { text: string; dot?: string; icon?: keyof typeof Ionicons.glyphMap; style: object }) {
  return (
    <View style={[s.badge, style]}>
      {dot && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: dot }} />}
      {icon && <Ionicons name={icon} size={14} color={INK} />}
      <Text style={s.badgeText}>{text}</Text>
    </View>
  );
}

function Big({ title, icon, onPress }: { title: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.big, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      {icon && <Ionicons name={icon} size={18} color={LEMON} />}
      <Text style={s.bigText}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: LEMON, zIndex: 90 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, height: 40 },
  logo: { fontSize: 24, fontWeight: "900", letterSpacing: -1, color: INK },
  skip: { fontSize: 15, fontWeight: "700", color: INK, opacity: 0.6 },
  art: { height: 340, alignItems: "center", justifyContent: "center", marginBottom: 28 },
  title: { fontSize: 32, lineHeight: 36, fontWeight: "900", letterSpacing: -1, color: INK },
  body: { fontSize: 16, lineHeight: 22, color: INK, opacity: 0.72, marginTop: 10, fontWeight: "500" },
  pol: { backgroundColor: "#FFF", padding: 10, paddingBottom: 0, borderRadius: 14, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  polImg: { width: 200, height: 240, borderRadius: 8 },
  polCap: { fontSize: 13, fontWeight: "800", color: INK, textAlign: "center", paddingVertical: 10, width: 200 },
  badge: { position: "absolute", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFF", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  badgeText: { fontSize: 13, fontWeight: "800", color: INK },
  score: { position: "absolute", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: INK, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, transform: [{ rotate: "-6deg" }] },
  scoreText: { color: LEMON, fontSize: 20, fontWeight: "900" },
  pinCircle: { width: 230, height: 230, borderRadius: 115, backgroundColor: "rgba(26,26,26,0.08)", alignItems: "center", justifyContent: "center" },
  pinInner: { width: 130, height: 130, borderRadius: 65, backgroundColor: INK, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginVertical: 18 },
  dot: { height: 8, borderRadius: 4, backgroundColor: INK },
  big: { backgroundColor: INK, borderRadius: 999, height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  bigText: { color: LEMON, fontSize: 17, fontWeight: "800" },
  later: { fontSize: 15, fontWeight: "700", color: INK, opacity: 0.6 },
  toggle: { flexDirection: "row", gap: 8, marginTop: 16 },
  tog: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.7)" },
  togOn: { backgroundColor: INK },
  togText: { fontSize: 14, fontWeight: "800", color: INK },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingBottom: 12 },
  car: { width: "48%", backgroundColor: "#FFF", borderRadius: 16, padding: 14 },
  carOn: { backgroundColor: INK },
  make: { fontSize: 12, fontWeight: "800", color: INK, opacity: 0.55, textTransform: "uppercase", letterSpacing: 0.5 },
  model: { fontSize: 16, fontWeight: "800", color: INK, marginTop: 2 },
});
