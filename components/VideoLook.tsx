import React from "react";
import { StyleSheet, View } from "react-native";
import { Canvas, FractalNoise, LinearGradient, RadialGradient, Rect, vec } from "@shopify/react-native-skia";
import { lookById } from "../lib/filters";

/**
 * A look laid over a playing video: colour wash, vignette, film grain and letterbox bars.
 * The video file stays untouched, so every viewer sees the same look without re-encoding.
 */
function rgb(t: [number, number, number], temp: number) {
  const [r, g, b] = t;
  const k = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  // Exaggerate the tint away from neutral grey so a light wash still reads as colour.
  return `rgb(${k(0.5 + (r - 0.5) * 2.2 + temp * 0.15)},${k(0.5 + (g - 0.5) * 2.2)},${k(0.5 + (b - 0.5) * 2.2 - temp * 0.15)})`;
}

export function VideoLook({ look, width, height }: { look?: string | null; width: number; height: number }) {
  const l = lookById(look ?? "original");
  if (!look || l.id === "original") return null;
  const bar = Math.round(height * 0.09);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={{ width, height }}>
        {/* Split-tone preview: the look's highlight colour from the top, its shadow colour from the bottom, kept light so the scene stays clean. */}
        {!l.grade.mono && (
          <Rect x={0} y={0} width={width} height={height} opacity={Math.min(0.2, 0.08 + l.grade.splitAmt * 0.1 + Math.abs(l.grade.temp) * 0.08)}>
            <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={[rgb(l.grade.highTint, l.grade.temp), "rgba(0,0,0,0)", rgb(l.grade.shadowTint, l.grade.temp)]} positions={[0, 0.5, 1]} />
          </Rect>
        )}
        {l.vignette > 0 && (
          <Rect x={0} y={0} width={width} height={height}>
            <RadialGradient c={vec(width / 2, height / 2)} r={Math.hypot(width, height) / 2}
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0)", `rgba(0,0,0,${l.vignette})`]} positions={[0, 0.55, 1]} />
          </Rect>
        )}
        {l.grain > 0 && (
          <Rect x={0} y={0} width={width} height={height} opacity={l.grain * 0.18}>
            <FractalNoise freqX={1.6} freqY={1.6} octaves={1} />
          </Rect>
        )}
        {l.letterbox && (<><Rect x={0} y={0} width={width} height={bar} color="#000" /><Rect x={0} y={height - bar} width={width} height={bar} color="#000" /></>)}
      </Canvas>
    </View>
  );
}
