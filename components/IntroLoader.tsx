import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image as RNImage, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { fetchIntroZaps } from "../lib/community";
import { snapUrl } from "../lib/supabase";

export const LEMON = "#FCE38A";
const INK = "#1A1A1A";

/** Illustrated stand-ins, replaced by real community zings once there are some. */
const STARTERS = [
  { src: require("../assets/intro/z1.jpg"), name: "night charge" },
  { src: require("../assets/intro/z2.jpg"), name: "highway stop" },
  { src: require("../assets/intro/z3.jpg"), name: "chai break · 80%" },
  { src: require("../assets/intro/z4.jpg"), name: "hill route" },
  { src: require("../assets/intro/z5.jpg"), name: "zingd it" },
];

// Where each card lands, as a share of the screen from the centre, and its tilt.
const SPOTS = [
  { x: -0.27, y: -0.29, r: -10 },
  { x: 0.27, y: -0.21, r: 9 },
  { x: -0.28, y: 0.28, r: 7 },
  { x: 0.27, y: 0.34, r: -8 },
  { x: 0.0, y: -0.39, r: 3 },
];

const CARD_W = 104;
const CARD_H = 132;
const MIN_MS = 1800;
const MAX_MS = 4500;

/**
 * Opening screen: picks up exactly where the native lemon splash leaves off, then the zing
 * mark pulses while photo cards burst out around it. Fades away once the app is ready.
 */
export function IntroLoader({ ready, fontsReady }: { ready: boolean; fontsReady?: boolean }) {
  const { width, height } = useWindowDimensions();
  const [cards, setCards] = useState<{ src: any; name: string }[]>(STARTERS);
  const [gone, setGone] = useState(false);
  const [minDone, setMinDone] = useState(false);

  const enter = useRef(SPOTS.map(() => new Animated.Value(0))).current;
  const float = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fetchIntroZaps(5)
      .then((z) => {
        if (!z.length) return;
        setCards(STARTERS.map((s, i) => (z[i] ? { src: { uri: snapUrl(z[i].photo) }, name: z[i].name } : s)));
      })
      .catch(() => {});

    Animated.stagger(
      110,
      enter.map((v) => Animated.spring(v, { toValue: 1, friction: 6, tension: 55, useNativeDriver: true })),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 420, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        Animated.delay(500),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(ring, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    ).start();

    const a = setTimeout(() => setMinDone(true), MIN_MS);
    const b = setTimeout(() => setMinDone(true), MAX_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  const leave = (ready && minDone);
  useEffect(() => {
    if (!leave) return;
    Animated.timing(fade, { toValue: 0, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => setGone(true));
  }, [leave]);

  if (gone) return null;

  return (
    <Animated.View pointerEvents={leave ? "none" : "auto"} style={[StyleSheet.absoluteFill, s.wrap, { opacity: fade }]}>
      {SPOTS.map((p, i) => {
        const v = enter[i];
        const bob = float.interpolate({ inputRange: [0, 1], outputRange: [0, i % 2 ? -7 : 7] });
        const card = cards[i];
        return (
          <Animated.View
            key={i}
            style={[
              s.card,
              {
                opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
                transform: [
                  { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, p.x * width] }) },
                  { translateY: Animated.add(v.interpolate({ inputRange: [0, 1], outputRange: [0, p.y * height] }), bob) },
                  { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.r}deg`] }) },
                  { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                ],
              },
            ]}
          >
            <Image source={card.src} style={s.photo} contentFit="cover" transition={200} />
            <Text style={s.caption} numberOfLines={1}>{card.name}</Text>
          </Animated.View>
        );
      })}

      <Animated.View
        style={[s.ring, {
          opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
          transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.9] }) }],
        }]}
      />
      <Animated.View style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
        <RNImage source={require("../assets/splash-icon.png")} style={{ width: 180, height: 180 }} />
      </Animated.View>

      <View style={s.words}>
        <Text style={[s.brand, fontsReady && { fontFamily: "SpaceGrotesk_700Bold" }]}>zingd</Text>
        <Text style={s.tag}>been there. zingd it.</Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: LEMON, alignItems: "center", justifyContent: "center", zIndex: 100 },
  card: {
    position: "absolute",
    width: CARD_W,
    height: CARD_H,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 6,
    paddingBottom: 0,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  photo: { width: CARD_W - 12, height: CARD_H - 34, borderRadius: 6, backgroundColor: "#EEE" },
  caption: { fontSize: 11, fontWeight: "700", color: INK, marginTop: 6, textAlign: "center" },
  ring: { position: "absolute", width: 120, height: 120, borderRadius: 34, borderWidth: 6, borderColor: INK },
  words: { position: "absolute", top: "50%", marginTop: 92, alignItems: "center" },
  brand: { fontSize: 30, fontWeight: "900", letterSpacing: -1, color: INK },
  tag: { fontSize: 14, fontWeight: "700", color: INK, opacity: 0.7, marginTop: 2 },
});
