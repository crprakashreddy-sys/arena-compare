import React from "react";
import { StyleSheet, View } from "react-native";
import { Canvas, FractalNoise, RadialGradient, Rect, vec } from "@shopify/react-native-skia";
import { lookById } from "../lib/filters";

/**
 * A look laid over a playing video: colour wash, vignette, film grain and letterbox bars.
 * The video file stays untouched, so every viewer sees the same look without re-encoding.
 */
function wash(g: ReturnType<typeof lookById>["grade"]) {
  const [r, gg, b] = g.highTint.map((v) => Math.round(Math.max(0, Math.min(1, v + g.temp * (v === g.highTint[0] ? 0.15 : v === g.highTint[2] ? -0.15 : 0))) * 255));
  const a = Math.min(0.22, 0.14 * g.splitAmt + Math.abs(g.temp) * 0.12 + (g.mono ? 0.0 : 0));
  return `rgba(${r},${gg},${b},${a.toFixed(3)})`;
}

export function VideoLook({ look, width, height }: { look?: string | null; width: number; height: number }) {
  const l = lookById(look ?? "original");
  if (!look || l.id === "original") return null;
  const bar = Math.round(height * 0.09);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {l.tints.length ? l.tints.map((t, i) => <View key={i} style={[StyleSheet.absoluteFill, { backgroundColor: t.color, opacity: 0.55 }]} />) : (
        // Grade-only looks: wash the video with the look's highlight tone and warmth.
        <View style={[StyleSheet.absoluteFill, { backgroundColor: wash(l.grade) }]} />
      )}
      <Canvas style={{ width, height }}>
        {l.vignette > 0 && (
          <Rect x={0} y={0} width={width} height={height}>
            <RadialGradient c={vec(width / 2, height / 2)} r={Math.hypot(width, height) / 2}
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0)", `rgba(0,0,0,${l.vignette})`]} positions={[0, 0.55, 1]} />
          </Rect>
        )}
        {l.grain > 0 && (
          <Rect x={0} y={0} width={width} height={height} opacity={l.grain * 0.35}>
            <FractalNoise freqX={0.9} freqY={0.9} octaves={2} />
          </Rect>
        )}
        {l.letterbox && (<><Rect x={0} y={0} width={width} height={bar} color="#000" /><Rect x={0} y={height - bar} width={width} height={bar} color="#000" /></>)}
      </Canvas>
    </View>
  );
}
