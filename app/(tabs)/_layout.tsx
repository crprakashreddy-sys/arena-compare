import React, { useEffect, useState } from "react";
import { AppState, DynamicColorIOS, Platform } from "react-native";
import { NativeTabs } from "expo-router/native-tabs";
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
function TabIcon({ name, md }: { name: keyof typeof ICONS; md: string }) {
  if (Platform.OS !== "ios") return <NativeTabs.Trigger.Icon md={md as any} />;
  return IN_EXPO_GO
    ? <NativeTabs.Trigger.Icon sf={SF[name] as any} />
    : <NativeTabs.Trigger.Icon src={ICONS[name]} renderingMode="original" />;
}

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
    <NativeTabs minimizeBehavior="onScrollDown" tintColor={INK_OR_WHITE}
      labelStyle={{ fontFamily: "SpaceGrotesk_700Bold", fontSize: 10.5, color: LABEL }}>
      <NativeTabs.Trigger name="index">
        <TabIcon name="map" md="map" />
        <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="feed">
        <TabIcon name="zings" md="bolt" />
        <NativeTabs.Trigger.Label>Zings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="clubs">
        <TabIcon name="clubs" md="groups" />
        <NativeTabs.Trigger.Label>Clubs</NativeTabs.Trigger.Label>
        {dm > 0 && <NativeTabs.Trigger.Badge>{dm > 9 ? "9+" : String(dm)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <TabIcon name="you" md="account_circle" />
        <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
