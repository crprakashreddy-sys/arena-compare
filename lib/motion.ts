import { LayoutAnimation, Platform, UIManager } from "react-native";
import * as Haptics from "expo-haptics";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Springy layout change for the next state update (sheets, expanding cards). */
export function springNext() {
  LayoutAnimation.configureNext({
    duration: 380,
    create: { type: "spring", springDamping: 0.78, property: "opacity" },
    update: { type: "spring", springDamping: 0.78 },
    delete: { type: "easeOut", property: "opacity", duration: 160 },
  });
}

const safe = (f: () => Promise<void>) => { f().catch(() => {}); };
/** Light tap: chips, toggles, tabs. */
export const tapHaptic = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
/** Notches on sliders. */
export const tickHaptic = () => safe(() => Haptics.selectionAsync());
/** Something good happened: posted, joined, scored. */
export const successHaptic = () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
