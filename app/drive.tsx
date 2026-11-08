import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { endDrive, startDrive } from "../lib/drive";
import { useTheme } from "../lib/theme";
import { successHaptic } from "../lib/motion";

/**
 * zingd://drive?state=start|end, opened by the driver's Shortcuts automation when the phone
 * connects to or disconnects from the car. Records the drive, then gets out of the way.
 */
export default function DriveLink() {
  const t = useTheme();
  const { state } = useLocalSearchParams<{ state?: string }>();
  const [msg, setMsg] = useState(state === "end" ? "Saving your drive…" : "Starting your drive…");
  useEffect(() => {
    (async () => {
      if (state === "end") {
        const r = await endDrive();
        successHaptic();
        setMsg(r.km > 0 ? `Drive saved: ${r.km} km${r.used ? `, about ${r.used}% battery used` : ""}` : "Drive saved");
      } else {
        await startDrive();
        successHaptic();
        setMsg("Drive started. Have a good one ⚡");
      }
      setTimeout(() => (router.canGoBack() ? router.back() : router.replace("/")), 1200);
    })();
  }, [state]);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: "center", justifyContent: "center", gap: 14, padding: 30 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={{ fontSize: 52 }}>{state === "end" ? "🅿️" : "🚗"}</Text>
      <Text style={{ color: t.text, fontWeight: "900", fontFamily: "SpaceGrotesk_700Bold", fontSize: 20, textAlign: "center" }}>{msg}</Text>
      <ActivityIndicator color={t.muted} />
    </View>
  );
}
