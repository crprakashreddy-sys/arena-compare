import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isConfigured = url.startsWith("https://") && anonKey.length > 20;

// Demo mode (no backend yet): every database call fails at once instead of waiting on the network.
const offlineFetch: typeof fetch = async () =>
  new Response(JSON.stringify({ message: "Demo mode: backend not connected" }), { status: 503, headers: { "Content-Type": "application/json" } });

export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder", {
  global: { fetch: isConfigured ? fetch : offlineFetch },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the sign-in fresh only while the app is on screen.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export function snapUrl(path: string) {
  return supabase.storage.from("snaps").getPublicUrl(path).data.publicUrl;
}
