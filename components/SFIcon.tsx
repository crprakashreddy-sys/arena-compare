import React from "react";
import { Platform, type ColorValue, type StyleProp, type TextStyle } from "react-native";
import { Ionicons as VectorIonicons } from "@expo/vector-icons";
import { SymbolView, type SFSymbol } from "expo-symbols";

/**
 * Drop-in for Ionicons. On iPhone it draws Apple's own SF Symbols (the icons iOS itself uses),
 * so every glyph matches the system font weight and stays razor sharp. Android keeps Ionicons.
 */
const SF: Record<string, string> = {
  flash: "bolt.fill", "flash-outline": "bolt", "flash-off": "bolt.slash.fill",
  "chevron-forward": "chevron.right", "chevron-back": "chevron.left", "chevron-down": "chevron.down", "chevron-up": "chevron.up",
  add: "plus", remove: "minus", close: "xmark", "close-circle": "xmark.circle.fill", checkmark: "checkmark",
  "checkmark-circle": "checkmark.circle.fill", "checkmark-done": "checkmark.circle",
  "ellipsis-horizontal": "ellipsis", "ellipsis-horizontal-circle": "ellipsis.circle",
  camera: "camera.fill", "camera-outline": "camera", "arrow-up": "arrow.up", "arrow-forward": "arrow.right", "arrow-back": "arrow.left",
  search: "magnifyingglass", people: "person.2.fill", person: "person.fill", "person-circle": "person.crop.circle.fill",
  image: "photo.fill", "image-outline": "photo", images: "photo.on.rectangle.angled", "images-outline": "photo.on.rectangle",
  trophy: "trophy.fill", navigate: "location.fill", location: "mappin.circle.fill", "location-outline": "mappin.and.ellipse",
  locate: "location", "car-sport": "car.fill", "car-sport-outline": "car",
  "add-circle": "plus.circle.fill", "add-circle-outline": "plus.circle",
  "trending-down": "chart.line.downtrend.xyaxis", "trending-down-outline": "chart.line.downtrend.xyaxis",
  "trash-outline": "trash", trash: "trash.fill", "share-outline": "square.and.arrow.up", refresh: "arrow.clockwise",
  "notifications-off": "bell.slash.fill", notifications: "bell.fill", "notifications-outline": "bell",
  map: "map.fill", "map-outline": "map", earth: "globe.asia.australia.fill",
  "help-circle-outline": "questionmark.circle", heart: "heart.fill", "heart-outline": "heart", "hand-left": "hand.raised.fill",
  "git-branch-outline": "point.topleft.down.to.point.bottomright.curvepath", funnel: "line.3.horizontal.decrease",
  "flag-outline": "flag", "create-outline": "square.and.pencil", "arrow-undo-outline": "arrowshape.turn.up.left",
  chatbubbles: "bubble.left.and.bubble.right.fill", "chatbubble-ellipses": "ellipsis.bubble.fill", "chatbubble-ellipses-outline": "ellipsis.bubble",
  construct: "wrench.and.screwdriver.fill", calendar: "calendar", key: "key.fill", star: "star.fill", "star-outline": "star",
  "lock-closed": "lock.fill", "paper-plane": "paperplane.fill", moon: "moon.fill", cafe: "cup.and.saucer.fill", restaurant: "fork.knife",
  water: "drop.fill", leaf: "leaf.fill", sparkles: "sparkles", "color-palette": "paintpalette.fill", glasses: "eyeglasses",
  shuffle: "shuffle", "musical-notes": "music.note", flame: "flame.fill", "timer-outline": "timer", timer: "timer",
  bicycle: "bicycle", "information-circle": "info.circle.fill", "information-circle-outline": "info.circle",
  "time-outline": "clock", time: "clock.fill", "settings-outline": "gearshape", settings: "gearshape.fill",
  "log-out-outline": "rectangle.portrait.and.arrow.right", "mail-outline": "envelope", "shield-checkmark": "checkmark.shield.fill",
  "battery-charging": "battery.100.bolt", "speedometer-outline": "speedometer", speedometer: "speedometer",
  "eye-outline": "eye", "eye-off-outline": "eye.slash", "copy-outline": "doc.on.doc", "link-outline": "link", "cash-outline": "indianrupeesign.circle",
};

export function sfName(ion: string): string | undefined { return SF[ion]; }

type IonName = React.ComponentProps<typeof VectorIonicons>["name"];
type Props = { name: IonName; size?: number; color?: ColorValue; style?: StyleProp<TextStyle>; bounce?: unknown };

function SFIcon({ name, size = 24, color = "#1A1A1A", style, bounce }: Props) {
  const sf = Platform.OS === "ios" ? SF[name] : undefined;
  const fallback = <VectorIonicons name={name} size={size} color={color as any} style={style} />;
  if (!sf) return fallback;
  return (
    <SymbolView name={sf as SFSymbol} size={size * 0.92} tintColor={color as any} weight="semibold" resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style as any]} fallback={fallback}
      animationSpec={bounce ? { effect: { type: "bounce" }, repeating: false } : undefined} />
  );
}
export const Ionicons = Object.assign(SFIcon, { glyphMap: VectorIonicons.glyphMap });
