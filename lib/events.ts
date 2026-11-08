import { Linking, Platform } from "react-native";
import { supabase, isConfigured } from "./supabase";
import { isBlocked } from "./community";
import { bbox } from "./geo";

export const EVENT_KINDS = [
  { key: "meetup", label: "Meetup", emoji: "☕" },
  { key: "drive", label: "Drive", emoji: "🛣️" },
  { key: "charging", label: "Charging hangout", emoji: "⚡" },
  { key: "other", label: "Other", emoji: "🎉" },
] as const;
export type EventKind = (typeof EVENT_KINDS)[number]["key"];
export const kindOf = (k: string) => EVENT_KINDS.find((x) => x.key === k) ?? EVENT_KINDS[3];

export type ClubEvent = {
  id: string; club_id: string; user_id: string; title: string; description: string | null; kind: EventKind;
  starts_at: string; place_name: string | null; lat: number; lng: number; destination: string | null;
  max_people: number | null; cancelled: boolean; created_at: string;
  club_name: string; club_kind: "brand" | "model" | "custom"; club_make: string; club_emoji: string | null; club_color: string | null;
  going: number; interested: number;
};
export type Rsvp = { user_id: string; status: "going" | "interested"; profiles?: { display_name: string; car_model: string | null } | null };
export type EventDraft = {
  title: string; description: string; kind: EventKind; starts_at: Date; place_name: string;
  lat: number; lng: number; destination: string; max_people: number | null;
};

const nowIso = () => new Date(Date.now() - 3 * 3600e3).toISOString(); // keep events visible for 3 hours after they start

export async function fetchClubEvents(clubId: string): Promise<ClubEvent[]> {
  const { data, error } = await supabase.from("club_event_list").select("*").eq("club_id", clubId)
    .gte("starts_at", nowIso()).order("starts_at").limit(50);
  if (error) throw new Error(error.message.includes("does not exist") ? "Events aren't set up yet. Run supabase/events.sql in Supabase." : error.message);
  return ((data ?? []) as ClubEvent[]).filter((e) => !isBlocked(e.user_id));
}

/** Upcoming public events near a point, for the map. */
export async function fetchEventsNear(lat: number, lng: number, km = 60): Promise<ClubEvent[]> {
  if (!isConfigured) return [];
  const b = bbox(lat, lng, km);
  const { data } = await supabase.from("club_event_list").select("*")
    .eq("cancelled", false).gte("starts_at", nowIso()).lte("starts_at", new Date(Date.now() + 30 * 864e5).toISOString())
    .gte("lat", b.minLat).lte("lat", b.maxLat).gte("lng", b.minLng).lte("lng", b.maxLng).limit(50);
  return ((data ?? []) as ClubEvent[]).filter((e) => !isBlocked(e.user_id));
}

export async function fetchEvent(id: string): Promise<ClubEvent | null> {
  const { data } = await supabase.from("club_event_list").select("*").eq("id", id).maybeSingle();
  return (data as any) ?? null;
}

export async function createEvent(clubId: string, userId: string, d: EventDraft): Promise<string> {
  const { data, error } = await supabase.from("club_events").insert({
    club_id: clubId, user_id: userId, title: d.title.trim(), description: d.description.trim() || null, kind: d.kind,
    starts_at: d.starts_at.toISOString(), place_name: d.place_name.trim() || null, lat: d.lat, lng: d.lng,
    destination: d.destination.trim() || null, max_people: d.max_people,
  }).select("id").single();
  if (error) throw new Error(error.message.includes("check") ? "Give it a title of 4 to 80 characters." : error.message);
  await rsvp(data.id, userId, "going").catch(() => {});
  return data.id as string;
}

export async function cancelEvent(id: string, cancelled = true) {
  const { error } = await supabase.from("club_events").update({ cancelled }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchRsvps(eventId: string): Promise<Rsvp[]> {
  const { data } = await supabase.from("club_event_rsvps").select("user_id,status,profiles(display_name,car_model)")
    .eq("event_id", eventId).order("created_at");
  return ((data ?? []) as any as Rsvp[]).filter((r) => !isBlocked(r.user_id));
}

export async function rsvp(eventId: string, userId: string, status: "going" | "interested" | null) {
  if (!status) { await supabase.from("club_event_rsvps").delete().eq("event_id", eventId).eq("user_id", userId); return; }
  const { error } = await supabase.from("club_event_rsvps").upsert({ event_id: eventId, user_id: userId, status }, { onConflict: "event_id,user_id" });
  if (error) throw new Error(error.message.includes("full") ? "This event is full." : error.message);
}

export function openDirections(e: Pick<ClubEvent, "lat" | "lng" | "place_name">) {
  const label = encodeURIComponent(e.place_name ?? "Meetup");
  const url = Platform.OS === "ios"
    ? `http://maps.apple.com/?daddr=${e.lat},${e.lng}&q=${label}`
    : `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}`;
  Linking.openURL(url);
}

export function fmtWhen(iso: string) {
  const d = new Date(iso);
  const today = new Date(); const tmr = new Date(Date.now() + 864e5);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = same(d, today) ? "Today" : same(d, tmr) ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  return `${day} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}
