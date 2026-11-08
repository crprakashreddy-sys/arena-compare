import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { tickHaptic } from "../lib/motion";

const W = 120;
const H = 28;

/** Apple-style battery colours: red when low, amber, lemon, then green when healthy. */
const colorFor = (v: number) => (v <= 15 ? "#FF453A" : v <= 30 ? "#FF9F0A" : v <= 60 ? "#FFD43B" : "#30D158");

/**
 * Battery-shaped slider: drag or tap anywhere on it to set the charge, in 5% steps,
 * with a haptic notch every 10%. Saves when you let go.
 */
export function BatterySlider({ value, onChange, dark }: { value: number; onChange: (v: number) => void; dark?: boolean }) {
  const [v, setV] = useState(value);
  const fill = useRef(new Animated.Value(value)).current;
  const lastTick = useRef(Math.round(value / 10));
  useEffect(() => { setV(value); fill.setValue(value); }, [value]);

  const update = (x: number) => {
    const n = Math.max(5, Math.min(100, Math.round(((x / W) * 100) / 5) * 5));
    if (Math.round(n / 10) !== lastTick.current) { lastTick.current = Math.round(n / 10); tickHaptic(); }
    setV(n);
    Animated.spring(fill, { toValue: n, useNativeDriver: false, speed: 40, bounciness: 0 }).start();
    return n;
  };
  const pan = Gesture.Pan().runOnJS(true).minDistance(0)
    .onBegin((e) => { update(e.x); })
    .onUpdate((e) => { update(e.x); })
    .onFinalize((e) => { onChange(update(e.x)); });

  const width = fill.interpolate({ inputRange: [0, 100], outputRange: [0, W - 4] });
  const ink = dark ? "#fff" : "#1A1A1A";
  const onFill = v >= 50; // the number sits on the colour once the fill passes the middle
  return (
    <GestureDetector gesture={pan}>
      <View style={{ flexDirection: "row", alignItems: "center" }}
        accessible accessibilityRole="adjustable" accessibilityLabel="Battery level" accessibilityValue={{ min: 5, max: 100, now: v, text: `${v}%` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          const n = Math.max(5, Math.min(100, v + (e.nativeEvent.actionName === "increment" ? 10 : -10)));
          setV(n); fill.setValue(n); onChange(n);
        }}>
        <View style={[s.body, { backgroundColor: dark ? "rgba(255,255,255,0.14)" : "rgba(26,26,26,0.08)" }]}>
          <Animated.View style={[s.fill, { width, backgroundColor: colorFor(v) }]}>
            <View style={s.gloss} />
          </Animated.View>
          <View style={s.labelRow}>
            {v <= 15 && <Text style={{ fontSize: 11 }}>⚠️</Text>}
            <Text style={[s.label, { color: onFill ? "#1A1A1A" : ink }]}>{v}<Text style={s.pct}>%</Text></Text>
          </View>
        </View>
        <View style={[s.nub, { backgroundColor: dark ? "rgba(255,255,255,0.3)" : "rgba(26,26,26,0.22)" }]} />
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  body: { width: W, height: H, borderRadius: H / 2, justifyContent: "center", overflow: "hidden" },
  fill: { position: "absolute", left: 2, top: 2, bottom: 2, borderRadius: (H - 4) / 2, overflow: "hidden" },
  gloss: { position: "absolute", left: 0, right: 0, top: 0, height: "48%", backgroundColor: "rgba(255,255,255,0.28)" },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  label: { fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 14, fontVariant: ["tabular-nums"], letterSpacing: -0.3 },
  pct: { fontSize: 10.5, fontWeight: "800" },
  nub: { width: 3.5, height: 10, borderTopRightRadius: 2, borderBottomRightRadius: 2, marginLeft: 2 },
});
