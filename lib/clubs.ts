import { supabase, isConfigured } from "./supabase";
import { isBlocked } from "./community";
import type { Model } from "./vehicles";

export type Club = {
  id: string; kind: "brand" | "model" | "custom"; make: string; model_id: string | null;
  name: string; vehicle_kind: string | null; members: number;
  description?: string | null; city?: string | null; emoji?: string | null; color?: string | null;
  is_private?: boolean; invite_code?: string | null; created_by?: string | null;
  rules?: string | null; pinned_message_id?: string | null;
};
export type ClubMember = {
  user_id: string; role: "member" | "admin"; joined_at: string;
  profiles?: { display_name: string; car_model: string | null; avatar_path?: string | null } | null;
};
export type ClubDraft = {
  name: string; description: string; city: string; emoji: string; color: string; is_private: boolean;
};
export type ClubMessage = {
  id: string; club_id: string; user_id: string; body: string | null; photo_path: string | null;
  reply_to: string | null; deleted: boolean; created_at: string;
  profiles?: { display_name: string; car_model: string | null; avatar_path?: string | null } | null;
};
export type MyClub = Club & { last?: ClubMessage | null; unread: number; muted: boolean };

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const brandClubId = (make: string) => `brand:${slug(make)}`;
export const modelClubId = (m: Pick<Model, "id">) => `model:${m.id}`;

const MSG_FIELDS = "id,club_id,user_id,body,photo_path,reply_to,deleted,created_at,profiles!club_messages_user_id_fkey(display_name,car_model,avatar_path)";

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
  if (error) {
    // Say what really happened: a database step not yet run looks very different from bad signal.
    const m = error.message ?? "";
    if (/does not exist|Could not find|schema cache/i.test(m)) throw new Error(`The database needs an update (run sh update.sh and the SQL it opens).\n\n${m}`);
    if (/row-level security|permission/i.test(m)) throw new Error("You need to be a member of this club to post. Try leaving and joining again.");
    if (/JWT|token/i.test(m)) throw new Error("Your sign-in expired. Go to You → Sign out, then sign in again.");
    throw new Error(m || "Message didn't send. Check your connection and try again.");
  }
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

// ───────── Driver-made clubs ─────────

export async function createClub(d: ClubDraft, userId: string): Promise<string> {
  const id = `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await supabase.from("clubs").insert({
    id, kind: "custom", make: "community", name: d.name.trim(), description: d.description.trim() || null,
    city: d.city.trim() || null, emoji: d.emoji, color: d.color, is_private: d.is_private, created_by: userId,
  });
  if (error) throw new Error(error.message.includes("up to 5") ? "You can run up to 5 clubs." : error.message.includes("clubs_text_check") ? "Use a name of 3 to 50 characters." : error.message);
  return id;
}

export async function updateClub(id: string, d: ClubDraft) {
  const { error } = await supabase.from("clubs").update({
    name: d.name.trim(), description: d.description.trim() || null, city: d.city.trim() || null,
    emoji: d.emoji, color: d.color, is_private: d.is_private,
  }).eq("id", id);
  if (error) throw new Error(error.message.includes("clubs_text_check") ? "Use a name of 3 to 50 characters." : error.message);
}

export async function deleteClub(id: string) {
  const { error } = await supabase.from("clubs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchClub(id: string): Promise<Club | null> {
  const { data } = await supabase.from("club_stats").select("*").eq("id", id).maybeSingle();
  return (data as any) ?? null;
}

export async function myRole(clubId: string, userId: string): Promise<"admin" | "member" | null> {
  const { data } = await supabase.from("club_members").select("role").eq("club_id", clubId).eq("user_id", userId).maybeSingle();
  return (data?.role as any) ?? null;
}

export async function fetchMembers(clubId: string): Promise<ClubMember[]> {
  const { data } = await supabase.from("club_members").select("user_id,role,joined_at,profiles(display_name,car_model,avatar_path)")
    .eq("club_id", clubId).order("role").order("joined_at").limit(500);
  return ((data ?? []) as any as ClubMember[]).filter((m) => !isBlocked(m.user_id));
}

export async function setRole(clubId: string, userId: string, role: "member" | "admin") {
  const { error } = await supabase.from("club_members").update({ role }).eq("club_id", clubId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function removeMember(clubId: string, userId: string) {
  const { error } = await supabase.from("club_members").delete().eq("club_id", clubId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function joinWithCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc("join_club_with_code", { code });
  if (error) throw new Error(error.message.includes("didn't match") || error.message.includes("didn''t") ? "That invite code didn't match a club." : error.message);
  return data as string;
}


export const CLUB_COLORS = ["#FCE38A", "#1A1A1A", "#B8E0D2", "#F6C6C7", "#C9B8FF", "#A9DDF3", "#FFC371", "#9AD28A"];

// ───────── Reactions, pins, rules, activity ─────────

export const REACTIONS = ["⚡", "❤️", "👍", "😂", "😮", "🙏"] as const;
export type Reaction = (typeof REACTIONS)[number];
/** message id → emoji → user ids */
export type ReactionMap = Record<string, Partial<Record<Reaction, string[]>>>;

export async function fetchReactions(messageIds: string[]): Promise<ReactionMap> {
  if (!messageIds.length) return {};
  const { data } = await supabase.from("club_reactions").select("message_id,user_id,emoji").in("message_id", messageIds);
  const out: ReactionMap = {};
  (data ?? []).forEach((r: any) => {
    const m = (out[r.message_id] ??= {});
    (m[r.emoji as Reaction] ??= []).push(r.user_id);
  });
  return out;
}

export async function toggleReaction(messageId: string, userId: string, emoji: Reaction, on: boolean) {
  if (on) await supabase.from("club_reactions").insert({ message_id: messageId, user_id: userId, emoji });
  else await supabase.from("club_reactions").delete().eq("message_id", messageId).eq("user_id", userId).eq("emoji", emoji);
}

export function subscribeReactions(onChange: (messageId: string) => void) {
  const ch = supabase
    .channel(`reactions-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "club_reactions" }, (p: any) => onChange((p.new?.message_id ?? p.old?.message_id) as string))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export async function pinMessage(clubId: string, messageId: string | null) {
  const { error } = await supabase.rpc("pin_club_message", { c: clubId, m: messageId });
  if (error) throw new Error(error.message);
}

export async function setRules(clubId: string, rules: string) {
  const { error } = await supabase.rpc("set_club_rules", { c: clubId, r: rules });
  if (error) throw new Error(error.message);
}

export type Activity = { msgs_today: number; active_week: number };
export async function fetchActivity(): Promise<Record<string, Activity>> {
  const { data } = await supabase.rpc("club_activity");
  const out: Record<string, Activity> = {};
  (data ?? []).forEach((r: any) => (out[r.club_id] = { msgs_today: r.msgs_today, active_week: r.active_week }));
  return out;
}

export function activityLine(a?: Activity, members = 0): string {
  if (a?.msgs_today) return `${a.msgs_today} message${a.msgs_today === 1 ? "" : "s"} today · ${a.active_week} active`;
  if (a?.active_week) return `${a.active_week} active this week`;
  return members ? `${members} member${members === 1 ? "" : "s"}` : "Be the first to join";
}

export type InfoStats = { members: number; msgs_week: number; active_week: number; issues_solved: number; issues_open: number; events_upcoming: number; since: string | null };
export async function fetchInfoStats(clubId: string): Promise<InfoStats | null> {
  const { data } = await supabase.rpc("club_info_stats", { c: clubId });
  return (data as InfoStats) ?? null;
}
