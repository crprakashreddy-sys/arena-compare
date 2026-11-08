import React from "react";
import { View, type ColorValue, type ViewStyle } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

/**
 * zingd's one icon language. Every icon in the app comes from here, so weights, sizes and
 * shapes match. Ionicons for most things; Material Community only where it has EV-specific glyphs.
 */
const MAP = {
  bolt: ["ion", "flash"], car: ["mci", "car-electric"], two: ["mci", "moped-electric"], bike: ["mci", "motorbike-electric"],
  camera: ["ion", "camera"], photo: ["ion", "image"], star: ["ion", "star"], check: ["ion", "checkmark-circle"],
  key: ["ion", "key"], chat: ["ion", "chatbubbles"], calendar: ["ion", "calendar"], wrench: ["ion", "construct"],
  pin: ["ion", "location"], shuffle: ["ion", "shuffle"], glasses: ["ion", "glasses"], beard: ["mci", "face-man-profile"],
  palette: ["ion", "color-palette"], sprout: ["ion", "leaf"], flame: ["ion", "flame"], crown: ["mci", "crown"],
  cafe: ["ion", "cafe"], road: ["mci", "road-variant"], sparkles: ["ion", "sparkles"], mountain: ["mci", "image-filter-hdr"],
  city: ["mci", "city-variant"], moon: ["ion", "moon"], food: ["ion", "restaurant"], people: ["ion", "people"],
  battery: ["mci", "battery-charging-high"], station: ["mci", "ev-station"], water: ["ion", "water"], trophy: ["ion", "trophy"],
  lock: ["ion", "lock-closed"], send: ["ion", "paper-plane"], mail: ["ion", "chatbubble-ellipses"],
  heart: ["ion", "heart"], music: ["ion", "musical-notes"], leaf: ["ion", "leaf"], rocket: ["ion", "rocket"],
} as const;
export type IconName = keyof typeof MAP;

export function Icon({ name, size = 18, color = "#1A1A1A" }: { name: IconName; size?: number; color?: ColorValue }) {
  const [fam, glyph] = MAP[name] ?? MAP.bolt;
  return fam === "mci"
    ? <MaterialCommunityIcons name={glyph as any} size={size} color={color as any} />
    : <Ionicons name={glyph as any} size={size} color={color as any} />;
}

/** An icon sitting in a soft rounded tile: for empty states, badges and feature rows. */
export function IconTile({ name, size = 56, bg = "#FCE38A", color = "#1A1A1A", round, style }: {
  name: IconName; size?: number; bg?: ColorValue; color?: ColorValue; round?: boolean; style?: ViewStyle;
}) {
  return (
    <View style={[{ width: size, height: size, borderRadius: round ? size / 2 : size * 0.3, backgroundColor: bg, alignItems: "center", justifyContent: "center" }, style]}>
      <Icon name={name} size={size * 0.48} color={color} />
    </View>
  );
}

/** Club icons drivers can pick. Stored as "i:<name>" so older emoji icons still show. */
export const CLUB_ICONS: IconName[] = ["bolt", "car", "two", "bike", "battery", "road", "mountain", "water", "cafe", "food", "camera", "wrench", "city", "moon", "sparkles", "people"];
export const clubIconName = (v?: string | null): IconName | null =>
  v && v.startsWith("i:") && (v.slice(2) in MAP) ? (v.slice(2) as IconName) : null;
