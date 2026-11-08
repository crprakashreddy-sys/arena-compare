import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router } from "expo-router";
import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId as string | undefined;

/** Whether the phone already allows zingd notifications. */
export async function pushAllowed() {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

/** Ask for permission (shows the iPhone prompt the first time) and save this phone's push token. */
export async function enablePush(userId: string): Promise<boolean> {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return false;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await supabase.from("push_tokens").upsert({ token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() }, { onConflict: "token" });
    return true;
  } catch { return false; }
}

/** Keep the token fresh when already allowed, and open the right screen when a notification is tapped. */
export function usePush(userId?: string | null) {
  useEffect(() => {
    if (!userId) return;
    pushAllowed().then((ok) => { if (ok) enablePush(userId); }).catch(() => {});
  }, [userId]);
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      const url = r?.notification.request.content.data?.url;
      if (typeof url === "string" && url.startsWith("/")) setTimeout(() => router.push(url as any), 300);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

export type NotifyPrefs = { notify_clubs: boolean; notify_replies: boolean; notify_events: boolean; notify_crew: boolean; notify_dms: boolean };
export async function fetchNotifyPrefs(userId: string): Promise<NotifyPrefs | null> {
  const { data, error } = await supabase.from("profiles").select("notify_clubs,notify_replies,notify_events,notify_crew,notify_dms").eq("id", userId).maybeSingle();
  return error ? null : (data as any);
}
export async function saveNotifyPref(userId: string, key: keyof NotifyPrefs, on: boolean) {
  await supabase.from("profiles").update({ [key]: on }).eq("id", userId);
}
