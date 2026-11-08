import React, { useEffect, useState } from "react";
import { AppState, DynamicColorIOS, Platform } from "react-native";
import { NativeTabs } from "expo-router/native-tabs";
import { usePathname } from "expo-router";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useAuth } from "../../lib/auth";
import { useGarage } from "../../lib/vehicles";
import { syncVehicleKind } from "../../lib/community";
import { onDmRead, subscribeInbox, unreadDms } from "../../lib/dms";

// Colourful tab icons (drawn for zingd), shown in their own colours instead of one flat tint.
// The softer "-off" version marks the tabs you're not on.
const ICONS = {
  map: { default: require("../../assets/tabs/map-off.png"), selected: require("../../assets/tabs/map.png") },
  zings: { default: require("../../assets/tabs/zings-off.png"), selected: require("../../assets/tabs/zings.png") },
  clubs: { default: require("../../assets/tabs/clubs-off.png"), selected: require("../../assets/tabs/clubs.png") },
  you: { default: require("../../assets/tabs/you-off.png"), selected: require("../../assets/tabs/you.png") },
};
// Expo Go streams images from your computer, and the native tab bar can't show those, so in
// Expo Go we use Apple's SF Symbols; the real App Store build bundles the colourful icons.
const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const SF = {
  map: { default: "map", selected: "map.fill" },
  zings: { default: "bolt", selected: "bolt.fill" },
  clubs: { default: "person.2", selected: "person.2.fill" },
  you: { default: "person.crop.circle", selected: "person.crop.circle.fill" },
} as const;
// NativeTabs reads its <Icon> children by type, so this must be called as a function that returns
// the Icon element itself (a wrapper component would hide it and the tab shows no icon).
function tabIcon(name: keyof typeof ICONS, md: string) {
  if (Platform.OS !== "ios") return <NativeTabs.Trigger.Icon md={md as any} />;
  return IN_EXPO_GO
    ? <NativeTabs.Trigger.Icon sf={SF[name] as any} />
    : <NativeTabs.Trigger.Icon src={ICONS[name]} renderingMode="original" />;
}

const TAB_COLORS = { map: "#14A37F", zings: "#FF8A00", clubs: "#5B5CFF", you: "#FF4F8B" };

const INK_OR_WHITE = Platform.OS === "ios" ? DynamicColorIOS({ light: "#1A1A1A", dark: "#FFFFFF" }) : "#1A1A1A";
const LABEL = Platform.OS === "ios" ? DynamicColorIOS({ light: "#6B6B6B", dark: "#A0A0A0" }) : "#6B6B6B";

/**
 * Apple's native tab bar. On iOS 26 it's Liquid Glass: it floats over the map, refracts what's
 * behind it and shrinks while you scroll. Older iPhones and Android get their own native bar.
 */
export default function TabsLayout() {
  const { profile, session } = useAuth();
  const { vehicles } = useGarage();
  const [dm, setDm] = useState(0);
  // Each tab lights up in its own colour when selected (matches the colourful icons).
  const path = usePathname();
  const tint = path.startsWith("/feed") ? TAB_COLORS.zings : path.startsWith("/clubs") ? TAB_COLORS.clubs : path.startsWith("/profile") ? TAB_COLORS.you : TAB_COLORS.map;

  // Keep the profile's car / 2-wheeler / both flag in step with the garage, for the leaderboards.
  const hasCar = vehicles.some((v) => v.kind === "car"), hasTwo = vehicles.some((v) => v.kind !== "car");
  useEffect(() => {
    if (profile && (hasCar || hasTwo)) syncVehicleKind(profile.id, hasCar && hasTwo ? "both" : hasCar ? "car" : "two").catch(() => {});
  }, [profile?.id, hasCar, hasTwo]);

  // Unread direct messages, shown as a badge on Clubs.
  useEffect(() => {
    if (!session) { setDm(0); return; }
    const refresh = () => unreadDms().then(setDm).catch(() => {});
    refresh();
    const offNew = subscribeInbox(refresh);
    const offRead = onDmRead(refresh);
    const app = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => { offNew(); offRead(); app.remove(); };
  }, [session?.user.id]);

  return (
    <NativeTabs minimizeBehavior="onScrollDown" tintColor={tint}
      labelStyle={{ fontFamily: "SpaceGrotesk_700Bold", fontSize: 10.5, color: LABEL }}>
      <NativeTabs.Trigger name="index">
        {tabIcon("map", "map")}
        <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="feed">
        {tabIcon("zings", "bolt")}
        <NativeTabs.Trigger.Label>Zings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="clubs">
        {tabIcon("clubs", "groups")}
        <NativeTabs.Trigger.Label>Clubs</NativeTabs.Trigger.Label>
        {dm > 0 && <NativeTabs.Trigger.Badge>{dm > 9 ? "9+" : String(dm)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        {tabIcon("you", "account_circle")}
        <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
