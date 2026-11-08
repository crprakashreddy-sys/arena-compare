import React, { useEffect, useState } from "react";
import { AppState, DynamicColorIOS, Platform } from "react-native";
import { NativeTabs } from "expo-router/native-tabs";
import { useAuth } from "../../lib/auth";
import { useGarage } from "../../lib/vehicles";
import { syncVehicleKind } from "../../lib/community";
import { onDmRead, subscribeInbox, unreadDms } from "../../lib/dms";

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
        <NativeTabs.Trigger.Icon sf={{ default: "map", selected: "map.fill" }} md="map" />
        <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="feed">
        <NativeTabs.Trigger.Icon sf={{ default: "bolt", selected: "bolt.fill" }} md="bolt" />
        <NativeTabs.Trigger.Label>Zings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="clubs">
        <NativeTabs.Trigger.Icon sf={{ default: "person.2", selected: "person.2.fill" }} md="groups" />
        <NativeTabs.Trigger.Label>Clubs</NativeTabs.Trigger.Label>
        {dm > 0 && <NativeTabs.Trigger.Badge>{dm > 9 ? "9+" : String(dm)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} md="account_circle" />
        <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
