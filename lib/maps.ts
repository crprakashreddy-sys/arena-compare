import { Linking, Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { PROVIDER_GOOGLE } from "react-native-maps";
import { DAY_STYLE, NIGHT_STYLE } from "./mapStyle";

const IOS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY ?? "";
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Google Maps everywhere it can run: always on Android, and on iPhone in the real app once an
 * iOS Maps key is set. Expo Go on iPhone can only draw Apple Maps, so it falls back there.
 */
export const USE_GOOGLE = Platform.OS === "android" || (Platform.OS === "ios" && !!IOS_KEY && !inExpoGo);
export const MAP_PROVIDER = USE_GOOGLE ? PROVIDER_GOOGLE : undefined;

/** The zingd map look for Google maps (Apple Maps can't be restyled). */
export const zappdStyle = (scheme: "light" | "dark" | null | undefined) =>
  USE_GOOGLE ? (scheme === "dark" ? NIGHT_STYLE : DAY_STYLE) : undefined;

/** Turn-by-turn in the Google Maps app if it's installed, otherwise Google Maps on the web. */
export async function openDirections(lat: number, lng: number) {
  const app = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
  const web = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  if (Platform.OS === "ios") {
    try { if (await Linking.canOpenURL(app)) return Linking.openURL(app); } catch {}
  }
  return Linking.openURL(web);
}
