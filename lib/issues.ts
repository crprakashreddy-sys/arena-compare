import { supabase } from "./supabase";
import { isBlocked } from "./community";

export const ISSUE_TAGS = [
  { key: "charging", label: "Charging", icon: "flash" },
  { key: "battery", label: "Battery & range", icon: "battery-half" },
  { key: "software", label: "Software & app", icon: "phone-portrait" },
  { key: "service", label: "Service centre", icon: "construct" },
  { key: "noise", label: "Noise & ride", icon: "volume-high" },
  { key: "tyres", label: "Tyres & brakes", icon: "disc" },
  { key: "accessories", label: "Accessories", icon: "bag-handle" },
  { key: "other", label: "Other", icon: "help-circle" },
] as const;
export type IssueTag = (typeof ISSUE_TAGS)[number]["key"];
export const tagLabel = (k: string) => ISSUE_TAGS.find((t) => t.key === k)?.label ?? k;

type Author = { display_name: string; car_model: string | null } | null;
export type Issue = {
  id: string; club_id: string; user_id: string; title: string; body: string | null; photo_path: string | null;
  tags: string[]; solved: boolean; solution_id: string | null; deleted: boolean; created_at: string;
  last_activity_at: string; replies: number; metoo: number; profiles?: Author;
};
export type Reply = {
  id: string; post_id: string; user_id: string; body: string | null; photo_path: string | null;
  deleted: boolean; created_at: string; profiles?: Author; votes: number; votedByMe: boolean;
};

// The list view has no link to profiles, so names are looked up separately.
async function withAuthors<T extends { user_id: string }>(rows: T[]): Promise<(T & { profiles: Author })[]> {
  const ids = [...new Set(rows.map((r) => r.user_id))];
  if (!ids.length) return rows as any;
  const { data } = await supabase.from("profiles").select("id,display_name,car_model").in("id", ids);
  const by = new Map((data ?? []).map((p: any) => [p.id, { display_name: p.display_name, car_model: p.car_model }]));
  return rows.map((r) => ({ ...r, profiles: by.get(r.user_id) ?? null }));
}

export async function fetchIssues(clubId: string, opts: { q?: string; filter?: "all" | "open" | "solved"; tag?: string | null } = {}) {
  let q = supabase.from("club_post_list").select("*").eq("club_id", clubId).eq("deleted", false)
    .order("last_activity_at", { ascending: false }).limit(100);
  if (opts.filter === "open") q = q.eq("solved", false);
  if (opts.filter === "solved") q = q.eq("solved", true);
  if (opts.tag) q = q.contains("tags", [opts.tag]);
  if (opts.q?.trim()) {
    const s = opts.q.trim().replace(/[%,()]/g, " ");
    q = q.or(`title.ilike.%${s}%,body.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message.includes("does not exist") ? "Issues aren't set up yet. Run supabase/issues.sql in Supabase." : error.message);
  return withAuthors(((data ?? []) as Issue[]).filter((p) => !isBlocked(p.user_id)));
}

export async function fetchIssue(id: string): Promise<Issue | null> {
  const { data } = await supabase.from("club_post_list").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return (await withAuthors([data as Issue]))[0];
}

export async function createIssue(clubId: string, userId: string, title: string, body: string, tags: string[], photoPath: string | null) {
  const { data, error } = await supabase.from("club_posts")
    .insert({ club_id: clubId, user_id: userId, title: title.trim(), body: body.trim() || null, tags, photo_path: photoPath })
    .select("id").single();
  if (error) throw new Error(error.message.includes("check") ? "Give it a title of at least 5 characters." : error.message);
  return data.id as string;
}

export async function deleteIssue(id: string) {
  await supabase.from("club_posts").update({ deleted: true }).eq("id", id);
}

export async function markSolved(postId: string, replyId: string | null) {
  const { error } = await supabase.from("club_posts").update({ solved: !!replyId || false, solution_id: replyId }).eq("id", postId);
  if (error) throw new Error(error.message);
}
export async function setSolvedFlag(postId: string, solved: boolean) {
  const { error } = await supabase.from("club_posts").update({ solved, ...(solved ? {} : { solution_id: null }) }).eq("id", postId);
  if (error) throw new Error(error.message);
}

export async function fetchReplies(postId: string, me?: string): Promise<Reply[]> {
  const { data } = await supabase.from("club_replies").select("id,post_id,user_id,body,photo_path,deleted,created_at,profiles(display_name,car_model)")
    .eq("post_id", postId).order("created_at");
  const rows = ((data ?? []) as any[]).filter((r) => !isBlocked(r.user_id));
  const ids = rows.map((r) => r.id);
  const votes = ids.length ? (await supabase.from("club_reply_votes").select("reply_id,user_id").in("reply_id", ids)).data ?? [] : [];
  return rows.map((r) => ({
    ...r,
    votes: votes.filter((v: any) => v.reply_id === r.id).length,
    votedByMe: !!me && votes.some((v: any) => v.reply_id === r.id && v.user_id === me),
  }));
}

export async function addReply(postId: string, userId: string, body: string, photoPath: string | null) {
  const { error } = await supabase.from("club_replies").insert({ post_id: postId, user_id: userId, body: body.trim() || null, photo_path: photoPath });
  if (error) throw new Error("Reply didn't post. Try again.");
}
export async function deleteReply(id: string) {
  await supabase.from("club_replies").update({ deleted: true, body: null, photo_path: null }).eq("id", id);
}

export async function toggleVote(replyId: string, userId: string, on: boolean) {
  if (on) await supabase.from("club_reply_votes").upsert({ reply_id: replyId, user_id: userId }, { onConflict: "reply_id,user_id", ignoreDuplicates: true });
  else await supabase.from("club_reply_votes").delete().eq("reply_id", replyId).eq("user_id", userId);
}

export async function hasMeToo(postId: string, userId: string) {
  const { data } = await supabase.from("club_post_metoo").select("post_id").eq("post_id", postId).eq("user_id", userId).maybeSingle();
  return !!data;
}
export async function toggleMeToo(postId: string, userId: string, on: boolean) {
  if (on) await supabase.from("club_post_metoo").upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
  else await supabase.from("club_post_metoo").delete().eq("post_id", postId).eq("user_id", userId);
}
