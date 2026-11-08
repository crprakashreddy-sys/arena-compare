import { supabase, isConfigured } from "./supabase";
import { isBlocked } from "./community";
import type { Model } from "./vehicles";

export type Club = {
  id: string; kind: "brand" | "model"; make: string; model_id: string | null;
  name: string; vehicle_kind: string | null; members: number;
};
export type ClubMessage = {
  id: string; club_id: string; user_id: string; body: string | null; photo_path: string | null;
  reply_to: string | null; deleted: boolean; created_at: string;
  profiles?: { display_name: string; car_model: string | null } | null;
};
export type MyClub = Club & { last?: ClubMessage | null; unread: number; muted: boolean };

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const brandClubId = (make: string) => `brand:${slug(make)}`;
export const modelClubId = (m: Pick<Model, "id">) => `model:${m.id}`;

const MSG_FIELDS = "id,club_id,user_id,body,photo_path,reply_to,deleted,created_at,profiles(display_name,car_model)";

export async function fetchClubs(): Promise<Club[]> {
  if (!isConfigured) return [];
  const { data, error } = await supabase.from("club_stats").select("*").order("kind").order("name");
  if (error) throw new Error(error.message.includes("does not exist") ? "Clubs aren't set up yet. Run supabase/clubs.sql in Supabase." : error.message);
  return (data ?? []) as Club[];
}

/** Clubs I'm in, with the newest message and how many I haven't read. */
export async function fetchMyClubs(userId: string): Promise<MyClub[]> {
  const { data: mem } = await supabase.from("club_members").select("club_id,muted,last_read_at").eq("user_id", userId);
  if (!mem?.length) return [];
  const ids = mem.map((m) => m.club_id as string);
  const { data: clubs } = await supabase.from("club_stats").select("*").in("id", ids);
  const out: MyClub[] = [];
  for (const c of (clubs ?? []) as Club[]) {
    const m = mem.find((x) => x.club_id === c.id)!;
    const { data: last } = await supabase.from("club_messages").select(MSG_FIELDS)
      .eq("club_id", c.id).order("created_at", { ascending: false }).limit(1);
    const { count } = await supabase.from("club_messages").select("id", { count: "exact", head: true })
      .eq("club_id", c.id).gt("created_at", m.last_read_at).neq("user_id", userId);
    out.push({ ...c, last: (last?.[0] as any) ?? null, unread: count ?? 0, muted: m.muted });
  }
  return out.sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
}

export async function joinClub(clubId: string, userId: string) {
  const { error } = await supabase.from("club_members").upsert({ club_id: clubId, user_id: userId }, { onConflict: "club_id,user_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}
export async function leaveClub(clubId: string, userId: string) {
  await supabase.from("club_members").delete().eq("club_id", clubId).eq("user_id", userId);
}
export async function setMuted(clubId: string, userId: string, muted: boolean) {
  await supabase.from("club_members").update({ muted }).eq("club_id", clubId).eq("user_id", userId);
}
export async function markRead(clubId: string, userId: string) {
  await supabase.from("club_members").update({ last_read_at: new Date().toISOString() }).eq("club_id", clubId).eq("user_id", userId);
}
export async function isMember(clubId: string, userId: string) {
  const { data } = await supabase.from("club_members").select("club_id").eq("club_id", clubId).eq("user_id", userId).maybeSingle();
  return !!data;
}

/** Join the brand and model clubs for every vehicle in my garage. Quietly does nothing if it can't. */
export async function autoJoinFor(vehicles: Pick<Model, "id" | "make">[], userId: string) {
  if (!isConfigured || !vehicles.length) return;
  const rows = vehicles.flatMap((v) => [brandClubId(v.make), modelClubId(v)]).map((club_id) => ({ club_id, user_id: userId }));
  await supabase.from("club_members").upsert(rows, { onConflict: "club_id,user_id", ignoreDuplicates: true });
}

export async function fetchMessages(clubId: string, before?: string): Promise<ClubMessage[]> {
  let q = supabase.from("club_messages").select(MSG_FIELDS).eq("club_id", clubId).order("created_at", { ascending: false }).limit(50);
  if (before) q = q.lt("created_at", before);
  const { data } = await q;
  return ((data ?? []) as any as ClubMessage[]).filter((m) => !isBlocked(m.user_id));
}

export async function fetchMessage(id: string): Promise<ClubMessage | null> {
  const { data } = await supabase.from("club_messages").select(MSG_FIELDS).eq("id", id).maybeSingle();
  return (data as any) ?? null;
}

export async function sendMessage(clubId: string, userId: string, body: string | null, photoPath: string | null, replyTo: string | null) {
  const { data, error } = await supabase.from("club_messages")
    .insert({ club_id: clubId, user_id: userId, body: body?.trim() || null, photo_path: photoPath, reply_to: replyTo })
    .select(MSG_FIELDS).single();
  if (error) throw new Error("Message didn't send. Check your connection and try again.");
  return data as any as ClubMessage;
}

export async function deleteMessage(id: string) {
  await supabase.from("club_messages").update({ deleted: true, body: null, photo_path: null }).eq("id", id);
}

/** Live new messages in a club. Returns an unsubscribe. */
export function subscribeClub(clubId: string, onNew: (id: string) => void, onChange: (id: string) => void) {
  const ch = supabase
    .channel(`club-${clubId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "club_messages", filter: `club_id=eq.${clubId}` },
      (p: any) => onNew(p.new.id))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "club_messages", filter: `club_id=eq.${clubId}` },
      (p: any) => onChange(p.new.id))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
