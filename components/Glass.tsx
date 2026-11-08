import React from "react";
import { Platform, StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from "react-native";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { useTheme } from "../lib/theme";

let ok = false;
try { ok = Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { ok = false; }
/** True on iPhones running iOS 26+ where Apple's Liquid Glass is available. */
export const HAS_GLASS = ok;

const STRIP = ["backgroundColor", "shadowColor", "shadowOpacity", "shadowRadius", "shadowOffset", "elevation"] as const;

/**
 * A floating surface. On iOS 26+ it's real Liquid Glass (refracts the map behind it);
 * elsewhere it's the solid card it always was, so nothing breaks on older phones.
 */
export function Glass({ style, tint, clear, interactive, children, pointerEvents }: {
  style?: StyleProp<ViewStyle>; tint?: ColorValue; clear?: boolean; interactive?: boolean; children?: React.ReactNode;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
}) {
  const t = useTheme();
  if (HAS_GLASS) {
    const flat = { ...(StyleSheet.flatten(style) ?? {}) } as any;
    STRIP.forEach((k) => delete flat[k]);
    return (
      <GlassView style={[flat, { overflow: "hidden" }]} glassEffectStyle={clear ? "clear" : "regular"} tintColor={tint as any}
        isInteractive={interactive} pointerEvents={pointerEvents}>
        {children}
      </GlassView>
    );
  }
  return <View style={[{ backgroundColor: tint ?? t.bg }, style]} pointerEvents={pointerEvents}>{children}</View>;
}
