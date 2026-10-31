import { decode } from "base64-arraybuffer";
import { isConfigured, supabase } from "./supabase";
import { bbox } from "./geo";
import type { Checkin, FacilityKey, FacilitySummary, FoodTip, LiveStatus, Review, ScorePart, Status } from "./types";
import type { ZapFix } from "./zapscore";

const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000; // status reports count for 3 hours

// ───────── Blocks: hide people the viewer has blocked ─────────
let blockedIds = new Set<string>();
export async function loadBlocks() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) { blockedIds = new Set(); return; }
  const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", u.user.id);
  blockedIds = new Set((data ?? []).map((r) => r.blocked_id));
}
const visible = <T extends { user_id: string }>(rows: T[]) => rows.filter((r) => !blockedIds.has(r.user_id));

// ───────── Live status ─────────
/** Demo mode only: a steady, made-up status for some chargers so the map shows what live status looks like. */
function demoHash(id: string) { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
function demoStatus(ids: string[]): Record<string, LiveStatus> {
  const out: Record<string, LiveStatus> = {};
  for (const id of ids) {
    const h = demoHash(id) % 10;
    if (h > 5) continue;
    out[id] = { status: h < 3 ? "working" : h < 5 ? "busy" : "broken", reports: 1 + (h % 3), lastAt: new Date(Date.now() - (10 + h * 17) * 60000).toISOString() };
  }
  return out;
}

export async function fetchLiveStatus(chargerIds: string[]): Promise<Record<string, LiveStatus>> {
  if (!chargerIds.length) return {};
  if (!isConfigured) return demoStatus(chargerIds);
  const since = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
  const out: Record<string, LiveStatus> = {};
  for (let i = 0; i < chargerIds.length; i += 150) {
    const { data } = await supabase
      .from("checkins")
      .select("charger_id,user_id,status,created_at")
      .in("charger_id", chargerIds.slice(i, i + 150))
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    for (const r of visible((data ?? []) as any[])) {
      const cur = out[r.charger_id];
      if (!cur) out[r.charger_id] = { status: r.status as Status, reports: 1, lastAt: r.created_at };
      else cur.reports += 1;
    }
  }
  return out;
}

// ───────── Snaps and check-ins ─────────
const CHECKIN_FIELDS = "id,charger_id,user_id,status,note,photo_path,created_at,expires_at,distance_m,zap_score,score_breakdown,issue,profiles(display_name,car_model)";

export async function fetchSnaps(chargerId: string): Promise<Checkin[]> {
  const { data } = await supabase
    .from("checkins")
    .select(CHECKIN_FIELDS)
    .eq("charger_id", chargerId)
    .not("photo_path", "is", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(30);
  return visible((data ?? []) as any);
}

export async function fetchFeed(lat: number, lng: number, km = 25): Promise<Checkin[]> {
  const b = bbox(lat, lng, km);
  const { data } = await supabase
    .from("checkins")
    .select(`${CHECKIN_FIELDS},chargers!inner(name,lat,lng,network)`)
    .not("photo_path", "is", null)
    .gt("expires_at", new Date().toISOString())
    .gte("chargers.lat", b.minLat).lte("chargers.lat", b.maxLat)
    .gte("chargers.lng", b.minLng).lte("chargers.lng", b.maxLng)
    .order("created_at", { ascending: false })
    .limit(60);
  return visible((data ?? []) as any);
}

/** Upload an edited JPEG (base64) to the viewer's own folder and return its storage path. */
export async function uploadSnap(base64Jpeg: string): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to post a photo.");
  const path = `${u.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from("snaps").upload(path, decode(base64Jpeg), {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error("Your photo didn't upload. Check your connection and try again.");
  return path;
}

/** Post a zap. The database scores it from how close `fix` is to the charger and returns the result. */
export const ISSUES = [
  { key: "not_starting", label: "Won't start" },
  { key: "payment", label: "Payment failed" },
  { key: "app_down", label: "App or QR not working" },
  { key: "cable_damaged", label: "Cable or gun damaged" },
  { key: "no_power", label: "No power" },
  { key: "slow", label: "Charging slowly" },
  { key: "queue", label: "Long queue" },
  { key: "ice_parked", label: "Petrol car in the spot" },
] as const;
export type IssueKey = typeof ISSUES[number]["key"];
export const issueLabel = (k?: string | null) => ISSUES.find((i) => i.key === k)?.label ?? null;

/** Problems reported at a charger in the last 48 hours, newest first, with a count per problem. */
export async function fetchIssues(chargerId: string) {
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("checkins")
    .select("issue,created_at,user_id")
    .eq("charger_id", chargerId)
    .not("issue", "is", null)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = visible((data ?? []) as any[]);
  const out: { key: string; label: string; count: number; lastAt: string }[] = [];
  for (const r of rows) {
    const cur = out.find((x) => x.key === r.issue);
    if (cur) cur.count += 1;
    else out.push({ key: r.issue, label: issueLabel(r.issue) ?? r.issue, count: 1, lastAt: r.created_at });
  }
  return out;
}

export async function postCheckin(
  chargerId: string, status: Status, note: string, photoPath: string | null, look?: string, fix?: ZapFix | null, issue?: IssueKey | null,
): Promise<{ zap_score: number; score_breakdown: ScorePart[]; distance_m: number | null }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to drop a zap.");
  const { data, error } = await supabase.from("checkins").insert({
    charger_id: chargerId,
    user_id: u.user.id,
    status,
    note: note.trim() || null,
    photo_path: photoPath,
    look: look ?? null,
    taken_lat: fix?.lat ?? null,
    taken_lng: fix?.lng ?? null,
    taken_accuracy_m: fix?.accuracy ?? null,
    taken_mocked: fix?.mocked ?? null,
    issue: status === "working" ? null : issue ?? null,
  }).select("zap_score,score_breakdown,distance_m").single();
  if (error) throw new Error("Your zap didn't post. Try again.");
  return {
    zap_score: (data?.zap_score as number) ?? 0,
    score_breakdown: (data?.score_breakdown as ScorePart[]) ?? [],
    distance_m: (data?.distance_m as number | null) ?? null,
  };
}

export async function deleteCheckin(c: Checkin) {
  if (c.photo_path) await supabase.storage.from("snaps").remove([c.photo_path]);
  await supabase.from("checkins").delete().eq("id", c.id);
}

/** For the map: how many live zaps each charger has, and the newest photo to show in its bubble. */
export async function fetchZapBubbles(chargerIds: string[]): Promise<Record<string, { count: number; photo: string }>> {
  if (!chargerIds.length) return {};
  const out: Record<string, { count: number; photo: string }> = {};
  for (let i = 0; i < chargerIds.length; i += 150) {
    const { data } = await supabase
      .from("checkins")
      .select("charger_id,user_id,photo_path,created_at")
      .in("charger_id", chargerIds.slice(i, i + 150))
      .not("photo_path", "is", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    for (const r of visible((data ?? []) as any[])) {
      const cur = out[r.charger_id];
      if (!cur) out[r.charger_id] = { count: 1, photo: r.photo_path as string };
      else cur.count += 1;
    }
  }
  return out;
}

export async function fetchUserZaps(userId: string) {
  const { data } = await supabase
    .from("checkins")
    .select("id,charger_id,status,photo_path,created_at,zap_score,distance_m,chargers(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as any[];
}

export async function fetchUserStats(userId: string) {
  const [z, r] = await Promise.all([
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  return { zaps: z.count ?? 0, reviews: r.count ?? 0 };
}

// ───────── Ratings and reviews ─────────
export const REVIEW_TAGS = [
  "Fast charging", "Reliable", "Clean washroom", "Safe at night", "Easy to find",
  "Good food nearby", "Queue at evenings", "Often broken", "Slow charging", "Hard to find",
];
export const NEGATIVE_TAGS = new Set(["Queue at evenings", "Often broken", "Slow charging", "Hard to find"]);

export async function fetchRating(chargerId: string) {
  const { data } = await supabase.from("charger_ratings").select("avg_rating,review_count").eq("charger_id", chargerId).maybeSingle();
  return data ? { avg: Number(data.avg_rating), count: data.review_count as number } : { avg: 0, count: 0 };
}

export async function fetchRatings(ids: string[]) {
  if (!ids.length) return {} as Record<string, number>;
  if (!isConfigured) return Object.fromEntries(ids.map((id) => [id, 3.5 + (demoHash(id) % 15) / 10]));
  const { data } = await supabase.from("charger_ratings").select("charger_id,avg_rating").in("charger_id", ids.slice(0, 300));
  const out: Record<string, number> = {};
  (data ?? []).forEach((r) => (out[r.charger_id] = Number(r.avg_rating)));
  return out;
}

export async function fetchTopTags(chargerId: string) {
  const { data } = await supabase.from("review_tags").select("tag,n").eq("charger_id", chargerId).order("n", { ascending: false }).limit(5);
  return (data ?? []) as { tag: string; n: number }[];
}

export async function fetchReviews(chargerId: string): Promise<Review[]> {
  const { data: u } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("reviews")
    .select("id,charger_id,user_id,rating,tags,body,created_at,profiles(display_name,car_model),review_votes(user_id)")
    .eq("charger_id", chargerId)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = visible((data ?? []) as any[]).map((r) => ({
    ...r,
    helpful: (r.review_votes ?? []).length,
    votedByMe: !!u.user && (r.review_votes ?? []).some((v: any) => v.user_id === u.user!.id),
  })) as Review[];
  return rows.sort((a, b) => b.helpful - a.helpful || b.created_at.localeCompare(a.created_at));
}

export async function fetchMyReview(chargerId: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase.from("reviews").select("rating,tags,body").eq("charger_id", chargerId).eq("user_id", u.user.id).maybeSingle();
  return data as { rating: number; tags: string[]; body: string | null } | null;
}

export async function saveReview(chargerId: string, rating: number, tags: string[], body: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to write a review.");
  const { error } = await supabase.from("reviews").upsert(
    { charger_id: chargerId, user_id: u.user.id, rating, tags, body: body.trim() || null, updated_at: new Date().toISOString() },
    { onConflict: "charger_id,user_id" },
  );
  if (error) throw new Error("Your review didn't save. Try again.");
}

export async function toggleHelpful(review: Review) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to vote.");
  if (review.votedByMe) await supabase.from("review_votes").delete().eq("review_id", review.id).eq("user_id", u.user.id);
  else await supabase.from("review_votes").insert({ review_id: review.id, user_id: u.user.id });
}

// ───────── Facilities ─────────
export const FACILITIES: { key: FacilityKey; label: string; icon: string }[] = [
  { key: "washroom", label: "Washroom", icon: "water-outline" },
  { key: "cafe", label: "Cafe on site", icon: "cafe-outline" },
  { key: "parking", label: "Free parking", icon: "car-outline" },
  { key: "open_24x7", label: "Open 24×7", icon: "time-outline" },
  { key: "covered", label: "Covered", icon: "umbrella-outline" },
  { key: "security", label: "Security", icon: "shield-checkmark-outline" },
  { key: "accessible", label: "Wheelchair access", icon: "accessibility-outline" },
  { key: "waiting_area", label: "Waiting area", icon: "people-outline" },
  { key: "wifi", label: "Wi-Fi", icon: "wifi-outline" },
];

export async function fetchFacilities(chargerId: string): Promise<FacilitySummary[]> {
  const { data } = await supabase.from("charger_facilities").select("facility,yes,no").eq("charger_id", chargerId);
  return (data ?? []) as FacilitySummary[];
}

export async function fetchMyFacilityVotes(chargerId: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return {} as Partial<Record<FacilityKey, boolean>>;
  const { data } = await supabase.from("facility_votes").select("facility,value").eq("charger_id", chargerId).eq("user_id", u.user.id);
  const out: Partial<Record<FacilityKey, boolean>> = {};
  (data ?? []).forEach((r) => (out[r.facility as FacilityKey] = r.value));
  return out;
}

export async function saveFacilityVotes(chargerId: string, votes: Partial<Record<FacilityKey, boolean>>) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to mark facilities.");
  const rows = Object.entries(votes).map(([facility, value]) => ({
    charger_id: chargerId, user_id: u.user!.id, facility, value, updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  const { error } = await supabase.from("facility_votes").upsert(rows, { onConflict: "charger_id,user_id,facility" });
  if (error) throw new Error("Facilities didn't save. Try again.");
}

// ───────── Food tips from drivers ─────────
export async function fetchFoodTips(chargerId: string): Promise<FoodTip[]> {
  const { data } = await supabase
    .from("food_tips")
    .select("id,user_id,name,note,created_at,profiles(display_name)")
    .eq("charger_id", chargerId)
    .order("created_at", { ascending: false })
    .limit(20);
  return visible((data ?? []) as any);
}

export async function addFoodTip(chargerId: string, name: string, note: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to recommend a spot.");
  const { error } = await supabase.from("food_tips").insert({
    charger_id: chargerId, user_id: u.user.id, name: name.trim(), note: note.trim() || null,
  });
  if (error) throw new Error("Your tip didn't save. Try again.");
}

// ───────── Safety ─────────
export async function report(kind: "checkin" | "review" | "food_tip" | "user", targetId: string, reason: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to report.");
  const { error } = await supabase.from("reports").insert({ reporter_id: u.user.id, target_kind: kind, target_id: targetId, reason });
  if (error && !error.message.includes("duplicate")) throw new Error("Your report didn't send. Try again.");
}

export async function blockUser(userId: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to block someone.");
  await supabase.from("blocks").upsert({ blocker_id: u.user.id, blocked_id: userId }, { onConflict: "blocker_id,blocked_id" });
  blockedIds.add(userId);
}

export async function fetchPoints(userId: string) {
  const { data } = await supabase.from("driver_points").select("points").eq("user_id", userId).maybeSingle();
  return (data?.points as number) ?? 0;
}

/** Badge from lifetime points. One on-site photo zap is about 120 to 145 points. */
export function badgeFor(points: number) {
  if (points >= 10000) return "Charging legend";
  if (points >= 3000) return "Top zapper";
  if (points >= 600) return "Regular";
  return "New zapper";
}

export type LeaderRow = { user_id: string; display_name: string; car_model: string | null; city: string | null; vehicle_verified: boolean; week_score: number; week_zaps: number };

/** This week's top zappers, in one city when given. */
export async function fetchLeaderboard(city?: string | null, limit = 20): Promise<LeaderRow[]> {
  let q = supabase.from("zap_leaderboard").select("*").order("week_score", { ascending: false }).limit(limit);
  if (city) q = q.ilike("city", city);
  const { data } = await q;
  return visible((data ?? []) as any[]) as LeaderRow[];
}

// ───────── Drivers and connections ─────────
export async function fetchProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id,display_name,car_model,city,vehicle_verified,created_at")
    .eq("id", userId)
    .maybeSingle();
  return data as (import("./types").Profile & { created_at: string }) | null;
}

export async function fetchConnectionCount(userId: string) {
  const { data } = await supabase.from("connection_counts").select("connections").eq("user_id", userId).maybeSingle();
  return (data?.connections as number) ?? 0;
}

export async function connectionState(otherId: string): Promise<import("./types").ConnectionState> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return "none";
  const me = u.user.id;
  const { data } = await supabase
    .from("connections")
    .select("requester_id,addressee_id,status")
    .or(`and(requester_id.eq.${me},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${me})`);
  const row = (data ?? [])[0];
  if (!row) return "none";
  if (row.status === "accepted") return "connected";
  return row.requester_id === me ? "sent" : "received";
}

export async function sendRequest(otherId: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to connect.");
  const { error } = await supabase.from("connections").insert({ requester_id: u.user.id, addressee_id: otherId });
  if (error && !error.message.includes("duplicate")) throw new Error("Your request didn't send. Try again.");
}

export async function acceptRequest(otherId: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("connections")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("requester_id", otherId).eq("addressee_id", u.user.id);
}

/** Decline a request, cancel one you sent, or remove a connection. */
export async function removeConnection(otherId: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const me = u.user.id;
  await supabase.from("connections").delete()
    .or(`and(requester_id.eq.${me},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${me})`);
}

export type DriverLite = { id: string; display_name: string; car_model: string | null; vehicle_verified: boolean };

export async function fetchMyNetwork() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { requests: [] as DriverLite[], connections: [] as DriverLite[] };
  const me = u.user.id;
  const { data } = await supabase
    .from("connections")
    .select("requester_id,addressee_id,status,requester:profiles!connections_requester_id_fkey(id,display_name,car_model,vehicle_verified),addressee:profiles!connections_addressee_id_fkey(id,display_name,car_model,vehicle_verified)")
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
  const requests: DriverLite[] = [];
  const connections: DriverLite[] = [];
  for (const r of (data ?? []) as any[]) {
    const other = r.requester_id === me ? r.addressee : r.requester;
    if (!other || blockedIds.has(other.id)) continue;
    if (r.status === "accepted") connections.push(other);
    else if (r.addressee_id === me) requests.push(other);
  }
  return { requests, connections };
}

// ───────── Vehicle verification ─────────
export const PLATE_RE = /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$/;
export const normalisePlate = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function verifyVehicle(reg: string): Promise<{ verified: boolean; checked: boolean }> {
  const { data, error } = await supabase.functions.invoke("verify-vehicle", { body: { reg_number: normalisePlate(reg) } });
  if (error) {
    let msg = "We couldn't check that vehicle number. Try again.";
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  return { verified: !!data?.verified, checked: !!data?.checked };
}
