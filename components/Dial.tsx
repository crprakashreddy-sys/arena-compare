import React, { useRef, useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { tickHaptic } from "../lib/motion";

/**
 * Pro-editor slider: centred at zero (or from the left when `from0`), with a haptic
 * click at every 10 and a stronger one when you pass zero. Double-tap resets.
 */
export function Dial({ value, onChange, width, from0, color = "#FCE38A" }: {
  value: number; onChange: (v: number) => void; width: number; from0?: boolean; color?: string;
}) {
  const last = useRef(Math.round(value * 10));
  const [drag, setDrag] = useState(false);
  const toV = (x: number) => {
    const r = Math.max(0, Math.min(1, x / width));
    return from0 ? r : r * 2 - 1;
  };
  const set = (x: number) => {
    const v = Math.round(toV(x) * 100) / 100;
    const step = Math.round(v * 10);
    if (step !== last.current) { last.current = step; tickHaptic(); }
    onChange(v);
  };
  const pan = Gesture.Pan().runOnJS(true).minDistance(0)
    .onBegin((e) => { setDrag(true); set(e.x); })
    .onUpdate((e) => set(e.x))
    .onFinalize(() => setDrag(false));
  const dbl = Gesture.Tap().numberOfTaps(2).runOnJS(true).onEnd(() => { tickHaptic(); onChange(from0 ? 1 : 0); });
  const pos = from0 ? value * width : ((value + 1) / 2) * width;
  const zero = from0 ? 0 : width / 2;
  return (
    <GestureDetector gesture={Gesture.Exclusive(dbl, pan)}>
      <View style={{ width, height: 44, justifyContent: "center" }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: "#3A424A" }} />
        <View style={{ position: "absolute", height: 4, borderRadius: 2, backgroundColor: color, left: Math.min(zero, pos), width: Math.abs(pos - zero) }} />
        {!from0 && <View style={{ position: "absolute", left: zero - 1, width: 2, height: 12, borderRadius: 1, backgroundColor: "#6B737A" }} />}
        <View style={{ position: "absolute", left: pos - (drag ? 13 : 11), width: drag ? 26 : 22, height: drag ? 26 : 22, borderRadius: 13, backgroundColor: "#fff",
          shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }} />
        {drag && (
          <View style={{ position: "absolute", left: pos - 22, top: -26, width: 44, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontVariant: ["tabular-nums"] }}>{from0 ? Math.round(value * 100) : (value > 0 ? "+" : "") + Math.round(value * 100)}</Text>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}
