import React, { useEffect, useRef } from "react";
import { Animated, View, type ViewStyle } from "react-native";
import { useTheme } from "../lib/theme";

/** Soft pulsing placeholder shown while content loads, instead of a spinner. */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const t = useTheme();
  const a = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.45, duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[{ backgroundColor: t.line, borderRadius: 10, opacity: a }, style]} />;
}

/** Placeholder rows shaped like the charger list. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: 14, paddingVertical: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Skeleton style={{ width: 34, height: 34, borderRadius: 17 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton style={{ height: 14, width: `${70 - i * 8}%` }} />
            <Skeleton style={{ height: 11, width: `${45 - i * 5}%` }} />
          </View>
          <Skeleton style={{ width: 44, height: 14 }} />
        </View>
      ))}
    </View>
  );
}
