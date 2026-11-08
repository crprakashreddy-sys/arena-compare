import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions } from "react-native";

const COLORS = ["#FCE38A", "#1A1A1A", "#1FAE5B", "#F6C6C7", "#A9DDF3", "#C9B8FF", "#F2A93B"];

/** A burst of lemon-and-ink confetti for big moments. Plays once, then removes itself. */
export function Confetti({ count = 44, onDone }: { count?: number; onDone?: () => void }) {
  const { width, height } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  const [gone, setGone] = useState(false);
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: Math.random() * width,
    drift: (Math.random() - 0.5) * 160,
    delay: Math.random() * 0.25,
    spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540),
    w: 6 + Math.random() * 6, h: 10 + Math.random() * 8,
    color: COLORS[i % COLORS.length], round: Math.random() < 0.3,
  })), [count, width]);
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true })
      .start(() => { setGone(true); onDone?.(); });
  }, []);
  if (gone) return null;
  return (
    <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bits.map((b, i) => {
        const p = t.interpolate({ inputRange: [0, b.delay, 1], outputRange: [0, 0, 1], extrapolate: "clamp" });
        return (
          <Animated.View key={i} style={{
            position: "absolute", left: b.x, top: -20, width: b.w, height: b.round ? b.w : b.h,
            borderRadius: b.round ? b.w : 2, backgroundColor: b.color,
            opacity: p.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.9] }) },
              { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, b.drift] }) },
              { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${b.spin}deg`] }) },
            ],
          }} />
        );
      })}
    </Animated.View>
  );
}
