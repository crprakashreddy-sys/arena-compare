import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Room the floating tab bar takes at the bottom of each tab screen. Content scrolls under it. */
export function useTabSpace() {
  const insets = useSafeAreaInsets();
  // On iOS the native tab bar is already inside the bottom safe area, so the inset alone is enough.
  return Platform.OS === "ios" ? insets.bottom + 4 : insets.bottom + 80;
}
