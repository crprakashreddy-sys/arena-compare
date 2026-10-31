import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FRESH_BONUS, PHOTO_BONUS, TIERS, formatMetres, scoreTone, tierFor } from "../lib/zapscore";
import type { ScorePart } from "../lib/types";

const YELLOW = "#FFD60A";

/** Small pill: ⚡ 145. Used on zaps in the viewer, feed and profiles. */
export function ScoreChip({ points, distanceM, dark = true }: { points?: number; distanceM?: number | null; dark?: boolean }) {
  if (points == null) return null;
  const tone = scoreTone(points);
  return (
    <View style={[styles.chip, { backgroundColor: dark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.06)" }]}
      accessibilityLabel={`Zap score ${points}${distanceM != null ? `, taken ${formatMetres(distanceM)} from the charger` : ""}`}>
      <Ionicons name="flash" size={12} color={tone} />
      <Text style={{ color: dark ? "#fff" : "#111", fontWeight: "800", fontSize: 12.5, fontVariant: ["tabular-nums"] }}>{points}</Text>
      {distanceM != null && <Text style={{ color: dark ? "rgba(255,255,255,0.75)" : "#555", fontSize: 11.5 }}>· {formatMetres(distanceM)}</Text>}
    </View>
  );
}

/**
 * Live preview before posting: how many points this zap will earn from here,
 * and how much closer to walk for the next tier.
 */
export function ScoreMeter({ distanceM, accuracy, mocked, hasPhoto, locationOff, onEnableLocation }: {
  distanceM: number | null; accuracy: number | null; mocked: boolean; hasPhoto: boolean;
  locationOff: boolean; onEnableLocation?: () => void;
}) {
  const tier = tierFor(distanceM, accuracy, mocked);
  const onSite = tier.points >= 60;
  const estimate = tier.points + (hasPhoto ? PHOTO_BONUS : 0);
  const tone = scoreTone(tier.points);

  // Fill: 0..1 across the three distance tiers.
  const fill = distanceM == null ? 0 : tier.points >= 100 ? 1 : tier.points >= 60 ? 0.66 : tier.points >= 25 ? 0.33 : 0.08;
  const anim = useRef(new Animated.Value(fill)).current;
  useEffect(() => { Animated.spring(anim, { toValue: fill, useNativeDriver: false, friction: 7 }).start(); }, [fill]);

  if (locationOff) {
    return (
      <Pressable onPress={onEnableLocation} style={styles.meter} accessibilityRole="button">
        <Ionicons name="location-outline" size={20} color={YELLOW} />
        <View style={{ flex: 1 }}>
          <Text style={styles.meterTitle}>Turn on location to earn up to {TIERS[0].points + PHOTO_BONUS + FRESH_BONUS} points</Text>
          <Text style={styles.meterSub}>Zaps taken at the charger score highest. Your location is never shown to anyone.</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.meter}>
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text style={[styles.big, { color: tone }]}>+{estimate}</Text>
          <Text style={styles.meterTitle}>{tier.label}</Text>
          {distanceM != null && <Text style={[styles.meterSub, { marginLeft: "auto" }]}>{formatMetres(distanceM)} away</Text>}
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.bar, { backgroundColor: tone, width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
          {[0.33, 0.66].map((x) => <View key={x} style={[styles.tick, { left: `${x * 100}%` }]} />)}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {["Nearby", "At the station", "At the plug"].map((l) => <Text key={l} style={styles.tickLabel}>{l}</Text>)}
        </View>
        <Text style={styles.meterSub}>
          {mocked ? "Your location looks simulated, so this zap earns the minimum."
            : (accuracy ?? 0) > 150 && distanceM != null && distanceM <= 200 ? `GPS is fuzzy (±${Math.round(accuracy ?? 0)} m). Step outside for a better fix to unlock ${TIERS[0].label}.`
            : tier.next ? `Get ${formatMetres(Math.max(tier.next.metres, 1))} closer for ${tier.next.label}.`
            : onSite ? `${hasPhoto ? "" : `+${PHOTO_BONUS} with a photo. `}+${FRESH_BONUS} more if you're the first zap here in 3 hours.`
            : ""}
        </Text>
      </View>
    </View>
  );
}

/** After posting: the score with its breakdown. Counts up once. */
export function ScoreCard({ total, parts, onClose }: { total: number; parts: ScorePart[]; onClose?: () => void }) {
  const n = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = React.useState(0);
  useEffect(() => {
    const id = n.addListener(({ value }) => setShown(Math.round(value)));
    Animated.timing(n, { toValue: total, duration: 900, useNativeDriver: false }).start();
    return () => n.removeListener(id);
  }, [total]);
  const tone = scoreTone(parts[0]?.points ?? total);
  return (
    <View style={styles.card} accessibilityLabel={`Zap dropped. You earned ${total} points.`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={[styles.bolt, { backgroundColor: tone }]}><Ionicons name="flash" size={20} color="#14202B" /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 26, fontVariant: ["tabular-nums"] }}>+{shown}</Text>
          <Text style={{ color: "#A3ADB6", fontSize: 12.5 }}>Zap Score · disappears from the map in 24 hours</Text>
        </View>
        {onClose && (
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={22} color="#A3ADB6" /></Pressable>
        )}
      </View>
      {parts.map((p, i) => (
        <View key={i} style={styles.row}>
          <Text style={{ color: "#D8DDE2", flex: 1 }}>{p.label}</Text>
          <Text style={{ color: p.points > 0 ? "#fff" : "#A3ADB6", fontWeight: "700", fontVariant: ["tabular-nums"] }}>
            {p.points > 0 ? `+${p.points}` : p.points}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, alignSelf: "flex-start" },
  meter: { flexDirection: "row", gap: 12, alignItems: "center", marginHorizontal: 16, padding: 14, borderRadius: 14, backgroundColor: "#151A1F" },
  meterTitle: { color: "#fff", fontWeight: "700", fontSize: 14.5 },
  meterSub: { color: "#A3ADB6", fontSize: 12.5, lineHeight: 17 },
  big: { fontSize: 28, fontWeight: "900", fontVariant: ["tabular-nums"] },
  track: { height: 8, borderRadius: 4, backgroundColor: "#262D34", overflow: "hidden" },
  bar: { height: 8, borderRadius: 4 },
  tick: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "#07090B" },
  tickLabel: { color: "#6E7882", fontSize: 10.5 },
  card: { gap: 8, padding: 14, borderRadius: 14, backgroundColor: "#14202B" },
  bolt: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#2A3037" },
});
