import React from "react";
import { Platform, View, type ColorValue, type ViewStyle } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
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

/** Apple's SF Symbol for each icon, used on iPhone. Missing ones fall back to the vector set. */
const SF: Partial<Record<IconName, string>> = {
  bolt: "bolt.fill", car: "bolt.car.fill", two: "scooter", camera: "camera.fill", photo: "photo.fill", star: "star.fill",
  check: "checkmark.circle.fill", key: "key.fill", chat: "bubble.left.and.bubble.right.fill", calendar: "calendar",
  wrench: "wrench.and.screwdriver.fill", pin: "mappin.circle.fill", shuffle: "shuffle", glasses: "eyeglasses", beard: "mustache.fill",
  palette: "paintpalette.fill", sprout: "leaf.fill", flame: "flame.fill", crown: "crown.fill", cafe: "cup.and.saucer.fill",
  road: "road.lanes", sparkles: "sparkles", mountain: "mountain.2.fill", city: "building.2.fill", moon: "moon.stars.fill",
  food: "fork.knife", people: "person.2.fill", battery: "battery.100.bolt", station: "ev.charger.fill", water: "drop.fill",
  trophy: "trophy.fill", lock: "lock.fill", send: "paperplane.fill", mail: "ellipsis.bubble.fill", heart: "heart.fill",
  music: "music.note", leaf: "leaf.fill",
};

export function Icon({ name, size = 18, color = "#1A1A1A" }: { name: IconName; size?: number; color?: ColorValue }) {
  const [fam, glyph] = MAP[name] ?? MAP.bolt;
  const sf = Platform.OS === "ios" ? SF[name] : undefined;
  if (sf) {
    const fb = fam === "mci" ? <MaterialCommunityIcons name={glyph as any} size={size} color={color as any} /> : <Ionicons name={glyph as any} size={size} color={color as any} />;
    return <SymbolView name={sf as SFSymbol} size={size * 0.92} tintColor={color as any} weight="semibold" type="hierarchical"
      style={{ width: size, height: size }} fallback={fb} />;
  }
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
