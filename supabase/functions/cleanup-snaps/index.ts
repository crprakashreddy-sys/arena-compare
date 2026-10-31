// Removes photos from check-ins older than 24 hours, so snaps really disappear.
// The status record stays (it counts toward driver points and charger history).
// Deploy: supabase functions deploy cleanup-snaps
// Schedule hourly: Dashboard → Integrations → Cron → new job calling this function.
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let removed = 0;
  for (let round = 0; round < 10; round++) {
    const { data, error } = await sb
      .from("checkins")
      .select("id, photo_path")
      .lt("expires_at", new Date().toISOString())
      .not("photo_path", "is", null)
      .limit(500);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    if (!data || data.length === 0) break;

    const paths = data.map((r) => r.photo_path as string);
    await sb.storage.from("snaps").remove(paths);
    await sb.from("checkins").update({ photo_path: null }).in("id", data.map((r) => r.id));
    removed += paths.length;
  }

  return new Response(JSON.stringify({ removed }), {
    headers: { "Content-Type": "application/json" },
  });
});
