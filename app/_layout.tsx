import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "../lib/auth";
import { useTheme } from "../lib/theme";

export default function RootLayout() {
  const t = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerTintColor: t.accent,
            headerStyle: { backgroundColor: t.bg },
            headerTitleStyle: { color: t.text },
            contentStyle: { backgroundColor: t.bg },
            headerBackTitle: "Back",
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="charger/[id]" options={{ title: "Charger" }} />
          <Stack.Screen name="zap/[id]" options={{ title: "Drop a zap", presentation: "fullScreenModal" }} />
          <Stack.Screen name="edit-profile" options={{ title: "Edit profile", presentation: "modal" }} />
          <Stack.Screen name="review/[id]" options={{ title: "Your review", presentation: "modal" }} />
          <Stack.Screen name="facilities/[id]" options={{ title: "Facilities", presentation: "modal" }} />
          <Stack.Screen name="driver/[id]" options={{ title: "Driver" }} />
          <Stack.Screen name="leaderboard" options={{ title: "Leaderboard" }} />
          <Stack.Screen name="garage" options={{ title: "My vehicles", presentation: "modal" }} />
          <Stack.Screen name="trip" options={{ title: "Plan a trip" }} />
          <Stack.Screen name="log" options={{ title: "Charging log" }} />
          <Stack.Screen name="savings" options={{ title: "Savings" }} />
          <Stack.Screen name="login" options={{ title: "Join zappd", presentation: "modal" }} />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
