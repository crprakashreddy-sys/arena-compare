import { supabase } from "./supabase";
import { isBlocked } from "./community";

export type DmMessage = {
  id: string; thread_id: string; user_id: string; body: string | null; photo_path: string | null;
  reply_to: string | null; deleted: boolean; created_at: string;
  gif_url?: string | null; sticker?: string | null;
};
export type DmPerson = { id: string; display_name: string; avatar_path: string | null; car_model: string | null };
export type DmThread = {
  id: string; last_at: string; other_id: string; unread: number;
  last: { body: string | null; photo_path: string | null; gif_url?: string | null; sticker?: string | null; user_id: string; deleted: boolean; created_at: string } | null;
  other?: DmPerson;
};

const FIELDS = "id,thread_id,user_id,body,photo_path,gif_url,sticker,reply_to,deleted,created_at";

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

/** When the other person last opened the chat (for "Seen"). */
export function otherReadAt(row: any, me: string): string | null {
  if (!row) return null;
  return row.user_a === me ? row.b_read_at : row.a_read_at;
}

export async function fetchThread(threadId: string, me: string): Promise<{ other: DmPerson | null; canSend: boolean; seenAt: string | null }> {
  const { data: other_id } = await supabase.rpc("thread_other", { t: threadId });
  if (!other_id) return { other: null, canSend: false, seenAt: null };
  const [{ data: p }, { data: ok }, { data: th }] = await Promise.all([
    supabase.from("profiles").select("id,display_name,avatar_path,car_model").eq("id", other_id).maybeSingle(),
    supabase.rpc("can_dm", { other: other_id }),
    supabase.from("dm_threads").select("user_a,a_read_at,b_read_at").eq("id", threadId).maybeSingle(),
  ]);
  return { other: (p as DmPerson) ?? null, canSend: !!ok, seenAt: otherReadAt(th, me) };
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

export async function sendDm(threadId: string, userId: string, body: string, photoPath: string | null, replyTo: string | null,
  extra: { gif_url?: string; sticker?: string } = {}) {
  const { data, error } = await supabase.from("dm_messages")
    .insert({ thread_id: threadId, user_id: userId, body: body.trim() || null, photo_path: photoPath, reply_to: replyTo, ...extra })
    .select(FIELDS).single();
  if (error) throw new Error(error.message.includes("row-level security") ? "You can only message drivers in your crew." : error.message);
  return data as DmMessage;
}

export async function deleteDm(id: string) {
  await supabase.from("dm_messages").update({ deleted: true, body: null, photo_path: null }).eq("id", id);
}

const readListeners = new Set<() => void>();
/** Fires after I read a chat, so unread badges refresh straight away. */
export function onDmRead(fn: () => void) { readListeners.add(fn); return () => { readListeners.delete(fn); }; }

export async function markDmRead(threadId: string) {
  await supabase.rpc("mark_dm_read", { t: threadId });
  readListeners.forEach((f) => f());
}

export function subscribeDm(threadId: string, onNew: (id: string) => void, onChange: (id: string) => void, onThread?: (row: any) => void) {
  const ch = supabase
    .channel(`dm-${threadId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` }, (p: any) => onNew(p.new.id))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` }, (p: any) => onChange(p.new.id))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_threads", filter: `id=eq.${threadId}` }, (p: any) => onThread?.(p.new))
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
