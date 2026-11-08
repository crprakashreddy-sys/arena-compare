import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Room the floating tab bar takes at the bottom of each tab screen. Content scrolls under it. */
export function useTabSpace() {
  const insets = useSafeAreaInsets();
  return Platform.OS === "ios" ? insets.bottom + 56 : insets.bottom + 80;
}
