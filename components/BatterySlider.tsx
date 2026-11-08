import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { tickHaptic } from "../lib/motion";

const W = 132;
const H = 30;

const colorFor = (v: number) => (v <= 15 ? "#E5483D" : v <= 30 ? "#F2A93B" : "#FCE38A");

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

  const width = fill.interpolate({ inputRange: [0, 100], outputRange: [0, W - 6] });
  const ink = dark ? "#fff" : "#1A1A1A";
  return (
    <GestureDetector gesture={pan}>
      <View style={{ flexDirection: "row", alignItems: "center" }}
        accessible accessibilityRole="adjustable" accessibilityLabel="Battery level" accessibilityValue={{ min: 5, max: 100, now: v, text: `${v}%` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          const n = Math.max(5, Math.min(100, v + (e.nativeEvent.actionName === "increment" ? 10 : -10)));
          setV(n); fill.setValue(n); onChange(n);
        }}>
        <View style={[s.body, { borderColor: ink }]}>
          <Animated.View style={[s.fill, { width, backgroundColor: colorFor(v) }]} />
          <Text style={[s.label, { color: v > 45 ? "#1A1A1A" : ink }]}>{v}%</Text>
        </View>
        <View style={[s.nub, { backgroundColor: ink }]} />
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  body: { width: W, height: H, borderRadius: 9, borderWidth: 2.5, padding: 1.5, justifyContent: "center", overflow: "hidden" },
  fill: { position: "absolute", left: 1.5, top: 1.5, bottom: 1.5, borderRadius: 6 },
  label: { alignSelf: "center", fontWeight: "900", fontSize: 13, fontVariant: ["tabular-nums"] },
  nub: { width: 4, height: 12, borderTopRightRadius: 3, borderBottomRightRadius: 3, marginLeft: 1.5 },
});
