// zingd database health check. Confirms every table, column, view and function the app uses
// exists in your Supabase project, and tells you which SQL file to run if something's missing.
// Read-only: it never changes data. Run: node scripts/check-db.mjs
import fs from "node:fs";

const env = Object.fromEntries(
  (fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "").split("\n")
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const URL = env.EXPO_PUBLIC_SUPABASE_URL, KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.log("   ⚠️  No Supabase keys in .env, skipping database check."); process.exit(0); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// [table or view, columns, SQL file that creates them]
const TABLES = [
  ["profiles", "id,display_name,car_model,city,vehicle_verified", "schema.sql"],
  ["profiles", "avatar_path,bio,vehicle_kind", "profile.sql"],
  ["profiles", "notify_clubs,notify_replies,notify_events,notify_crew", "notifications.sql"],
  ["profiles", "notify_dms", "dms.sql"],
  ["chargers", "id,name,network,lat,lng,power_kw,connectors,speed", "schema.sql"],
  ["checkins", "id,charger_id,user_id,status,photo_path,expires_at,zap_score", "schema.sql"],
  ["connections", "requester_id,addressee_id,status", "schema.sql"],
  ["clubs", "id,kind,make,name,description,city,emoji,color,is_private,invite_code,created_by", "clubs.sql"],
  ["club_members", "club_id,user_id,role,joined_at,muted,last_read_at", "clubs.sql"],
  ["club_messages", "id,club_id,user_id,body,photo_path,reply_to,deleted", "clubs.sql"],
  ["club_stats", "id,members", "clubs.sql"],
  ["club_posts", "id,club_id,title,solved", "issues.sql"],
  ["club_replies", "id,post_id,body", "issues.sql"],
  ["club_events", "id,club_id,title,starts_at", "events.sql"],
  ["push_tokens", "token,user_id", "notifications.sql"],
  ["dm_threads", "id,user_a,user_b,a_read_at,b_read_at", "dms.sql"],
  ["dm_messages", "id,thread_id,user_id,body", "dms.sql"],
  ["dm_inbox", "id,other_id,unread", "dms.sql"],
  ["charge_speeds", "charger_id,kind,kw", "speeds.sql"],
  ["charger_speed_stats", "charger_id,kind,typical_kw,charges", "speeds.sql"],
  ["clubs", "rules,pinned_message_id", "clubs_plus.sql"],
  ["club_reactions", "message_id,user_id,emoji", "clubs_plus.sql"],
  ["club_messages", "gif_url,sticker", "gifs.sql"],
  ["dm_messages", "gif_url,sticker", "gifs.sql"],
  ["clubs", "photo_path", "gifs.sql"],
  ["checkins", "keep", "zings_plus.sql"],
  ["profiles", "interests,prompts", "bumble.sql"],
  ["checkins", "media,video_path,music,audience", "zing_video.sql"],
  ["checkins", "place_name,place_lat,place_lng", "zing_places.sql"],
  ["profiles", "personality", "personality.sql"],
  ["profiles", "traits", "traits.sql"],
  ["clubs", "req_min_profile,req_personalities,req_traits,req_same_city", "club_rules.sql"],
  ["connections", "note", "bumble.sql"],
  ["zing_views", "checkin_id,viewer_id", "zings_plus.sql"],
  ["zing_reactions", "checkin_id,user_id,emoji", "zings_plus.sql"],
];
// [function, safe dummy arguments, SQL file]. Called signed-out, so they do nothing.
// Joins the app makes. "More than one relationship" here breaks loading names on messages.
const EMBEDS = [
  ["club_messages", "id,profiles!club_messages_user_id_fkey(display_name)", "clubs.sql"],
  ["club_replies", "id,profiles!club_replies_user_id_fkey(display_name)", "issues.sql"],
];
const FUNCS = [
  ["start_dm", { other: "00000000-0000-0000-0000-000000000000" }, "dms.sql"],
  ["mark_dm_read", { t: "00000000-0000-0000-0000-000000000000" }, "dms.sql"],
  ["club_activity", {}, "clubs_plus.sql"],
  ["club_info_stats", { c: "__check__" }, "clubs_plus.sql"],
  ["driver_suggestions", { lim: 1 }, "crew.sql"],
  ["zing_streak", { u: "00000000-0000-0000-0000-000000000000" }, "zings_plus.sql"],
];

const missing = new Map(); // file -> reasons
const note = (file, why) => missing.set(file, [...(missing.get(file) ?? []), why]);
let networkErr = null;

async function check(path, init) {
  try { return await fetch(`${URL}/rest/v1/${path}`, { headers: H, ...init }); }
  catch (e) { networkErr = e.message; return null; }
}

for (const [table, cols, file] of TABLES) {
  const r = await check(`${table}?select=${cols}&limit=0`);
  if (!r || r.ok) continue;
  const b = await r.json().catch(() => ({}));
  const msg = String(b.message ?? r.status);
  if (/does not exist|Could not find|PGRST205|PGRST204|42703|42P01/.test(msg + (b.code ?? ""))) note(file, `${table}: ${msg.replace(/\s+/g, " ").slice(0, 90)}`);
}
for (const [table, sel, file] of EMBEDS) {
  const r = await check(`${table}?select=${sel}&limit=0`);
  if (!r || r.ok) continue;
  const b = await r.json().catch(() => ({}));
  note(file, `${table}: ${String(b.message ?? r.status).slice(0, 90)}`);
}
for (const [fn, args, file] of FUNCS) {
  const r = await check(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
  if (!r || r.ok) continue;
  const b = await r.json().catch(() => ({}));
  if (b.code === "PGRST202" || r.status === 404) note(file, `function ${fn} is missing`);
}

if (networkErr) { console.log(`   ⚠️  Couldn't reach Supabase (${networkErr}). Check your internet.`); process.exit(0); }
if (!missing.size) { console.log("   ✅ Database matches the app."); process.exit(0); }
const order = ["schema.sql", "profile.sql", "clubs.sql", "issues.sql", "events.sql", "notifications.sql", "dms.sql", "speeds.sql", "clubs_plus.sql", "crew.sql", "gifs.sql", "zings_plus.sql", "bumble.sql", "zing_video.sql", "zing_places.sql", "personality.sql", "traits.sql", "club_rules.sql"];
const files = [...missing.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
console.log("   ❌ Your database is missing parts the app needs:");
for (const f of files) { console.log(`      • supabase/${f}`); missing.get(f).slice(0, 3).forEach((w) => console.log(`          ${w}`)); }
fs.writeFileSync(".db-missing", files.join(" "));
process.exit(1);
