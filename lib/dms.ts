import { supabase } from "./supabase";
import { isBlocked } from "./community";

export type DmMessage = {
  id: string; thread_id: string; user_id: string; body: string | null; photo_path: string | null;
  reply_to: string | null; deleted: boolean; created_at: string;
};
export type DmPerson = { id: string; display_name: string; avatar_path: string | null; car_model: string | null };
export type DmThread = {
  id: string; last_at: string; other_id: string; unread: number;
  last: { body: string | null; photo_path: string | null; user_id: string; deleted: boolean; created_at: string } | null;
  other?: DmPerson;
};

const FIELDS = "id,thread_id,user_id,body,photo_path,reply_to,deleted,created_at";

/** Opens (or reuses) the chat with a connected driver and returns its id. */
export async function startDm(otherId: string): Promise<string> {
  const { data, error } = await supabase.rpc("start_dm", { other: otherId });
  if (error) throw new Error(error.message.includes("Connect first") ? "You can message drivers in your crew. Connect first." : error.message);
  return data as string;
}

export async function fetchInbox(): Promise<DmThread[]> {
  const { data, error } = await supabase.from("dm_inbox").select("*").order("last_at", { ascending: false });
  if (error) throw error;
  const rows = ((data ?? []) as DmThread[]).filter((r) => !isBlocked(r.other_id));
  const ids = [...new Set(rows.map((r) => r.other_id))];
  if (ids.length) {
    const { data: ps } = await supabase.from("profiles").select("id,display_name,avatar_path,car_model").in("id", ids);
    const map = new Map((ps ?? []).map((p: any) => [p.id, p]));
    rows.forEach((r) => (r.other = map.get(r.other_id)));
  }
  return rows;
}

export async function unreadDms(): Promise<number> {
  const { data } = await supabase.from("dm_inbox").select("unread,other_id");
  return (data ?? []).filter((r: any) => !isBlocked(r.other_id)).reduce((n: number, r: any) => n + (r.unread ?? 0), 0);
}

export async function fetchThread(threadId: string): Promise<{ other: DmPerson | null; canSend: boolean }> {
  const { data: other_id } = await supabase.rpc("thread_other", { t: threadId });
  if (!other_id) return { other: null, canSend: false };
  const [{ data: p }, { data: ok }] = await Promise.all([
    supabase.from("profiles").select("id,display_name,avatar_path,car_model").eq("id", other_id).maybeSingle(),
    supabase.rpc("can_dm", { other: other_id }),
  ]);
  return { other: (p as DmPerson) ?? null, canSend: !!ok };
}

export async function fetchDmMessages(threadId: string, before?: string): Promise<DmMessage[]> {
  let q = supabase.from("dm_messages").select(FIELDS).eq("thread_id", threadId).order("created_at", { ascending: false }).limit(50);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DmMessage[];
}

export async function fetchDm(id: string): Promise<DmMessage | null> {
  const { data } = await supabase.from("dm_messages").select(FIELDS).eq("id", id).maybeSingle();
  return (data as DmMessage) ?? null;
}

export async function sendDm(threadId: string, userId: string, body: string, photoPath: string | null, replyTo: string | null) {
  const { data, error } = await supabase.from("dm_messages")
    .insert({ thread_id: threadId, user_id: userId, body: body.trim() || null, photo_path: photoPath, reply_to: replyTo })
    .select(FIELDS).single();
  if (error) throw new Error(error.message.includes("row-level security") ? "You can only message drivers in your crew." : error.message);
  return data as DmMessage;
}

export async function deleteDm(id: string) {
  await supabase.from("dm_messages").update({ deleted: true, body: null, photo_path: null }).eq("id", id);
}

export async function markDmRead(threadId: string) {
  await supabase.rpc("mark_dm_read", { t: threadId });
}

export function subscribeDm(threadId: string, onNew: (id: string) => void, onChange: (id: string) => void) {
  const ch = supabase
    .channel(`dm-${threadId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` }, (p: any) => onNew(p.new.id))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` }, (p: any) => onChange(p.new.id))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/** Any new DM to me: used to refresh the inbox and unread badge. */
export function subscribeInbox(onAny: () => void) {
  const ch = supabase
    .channel(`dm-inbox-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, () => onAny())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
