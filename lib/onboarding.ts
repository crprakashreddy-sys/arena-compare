import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "zappd.onboarded.v1";
let state: boolean | null = null; // null until read from the phone
const subs = new Set<(v: boolean) => void>();

async function load() {
  if (state !== null) return state;
  try { state = (await AsyncStorage.getItem(KEY)) === "1"; } catch { state = false; }
  subs.forEach((f) => f(state!));
  return state;
}

/** Whether the driver has seen the welcome screens. null while still checking. */
export function useOnboarded() {
  const [v, setV] = useState<boolean | null>(state);
  useEffect(() => {
    subs.add(setV);
    load().then(setV);
    return () => { subs.delete(setV); };
  }, []);
  return v;
}

export function finishOnboarding() {
  state = true;
  subs.forEach((f) => f(true));
  AsyncStorage.setItem(KEY, "1").catch(() => {});
}

/** For testing: show the welcome screens again on next open. */
export function resetOnboarding() {
  state = false;
  subs.forEach((f) => f(false));
  AsyncStorage.removeItem(KEY).catch(() => {});
}
