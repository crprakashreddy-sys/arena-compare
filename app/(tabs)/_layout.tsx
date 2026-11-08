import React, { useEffect } from "react";
import { useAuth } from "../../lib/auth";
import { useGarage } from "../../lib/vehicles";
import { syncVehicleKind } from "../../lib/community";
import { tapHaptic } from "../../lib/motion";
import { Pressable, View } from "react-native";
import { Tabs, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme";

export default function TabsLayout() {
  const t = useTheme();
  const { profile } = useAuth();
  const { vehicles } = useGarage();
  // Keep the profile's car / 2-wheeler / both flag in step with the garage, for the leaderboards.
  const hasCar = vehicles.some((v) => v.kind === "car"), hasTwo = vehicles.some((v) => v.kind !== "car");
  useEffect(() => {
    if (profile && (hasCar || hasTwo)) syncVehicleKind(profile.id, hasCar && hasTwo ? "both" : hasCar ? "car" : "two").catch(() => {});
  }, [profile?.id, hasCar, hasTwo]);
  return (
    <Tabs
      screenListeners={{ tabPress: () => tapHaptic() }}
      screenOptions={{
        tabBarActiveTintColor: t.accent,
        tabBarLabelStyle: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 11 },
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.line },
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: { color: t.text },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Map", headerShown: false, tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: "Zings",
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="flash" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="drop"
        options={{
          title: "Drop a zing",
          tabBarButton: () => (
            <Pressable
              onPress={() => router.push("/zap/nearest")}
              accessibilityRole="button"
              accessibilityLabel="Drop a zing"
              style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
            >
              <View style={{
                width: 54, height: 54, borderRadius: 27, backgroundColor: "#FCE38A", marginTop: -20,
                alignItems: "center", justifyContent: "center",
                shadowColor: "#FCE38A", shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
              }}>
                <Ionicons name="camera" size={26} color="#1A1A1A" />
              </View>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="clubs"
        options={{ title: "Clubs", headerShown: false, tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "You", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
