import React from "react";
import { Pressable, View } from "react-native";
import { Tabs, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme";

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.accent,
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
          title: "Zaps",
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="flash" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="drop"
        options={{
          title: "Drop a zap",
          tabBarButton: () => (
            <Pressable
              onPress={() => router.push("/zap/nearest")}
              accessibilityRole="button"
              accessibilityLabel="Drop a zap"
              style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
            >
              <View style={{
                width: 54, height: 54, borderRadius: 27, backgroundColor: "#FFD60A", marginTop: -20,
                alignItems: "center", justifyContent: "center",
                shadowColor: "#FFD60A", shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
              }}>
                <Ionicons name="camera" size={26} color="#14202B" />
              </View>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "You", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
