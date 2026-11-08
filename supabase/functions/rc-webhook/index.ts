// RevenueCat → zingd: adds AI cartoon credits when someone buys a pack in the App Store.
// In RevenueCat: Project → Integrations → Webhooks → URL = https://<project>.supabase.co/functions/v1/rc-webhook,
// Authorization header = the RC_WEBHOOK_SECRET you set with ai-setup.sh. Deploy with --no-verify-jwt.
import { createClient } from "jsr:@supabase/supabase-js@2";

// Product id → cartoons in the pack. Must match the products in App Store Connect / RevenueCat.
const PACKS: Record<string, number> = { "zingd.ai.cartoons5": 5, "zingd.ai.cartoons15": 15 };

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== Deno.env.get("RC_WEBHOOK_SECRET")) return new Response("no", { status: 401 });
  const body = await req.json().catch(() => null);
  const ev = body?.event;
  if (!ev) return new Response("ignored");
  if (!["NON_RENEWING_PURCHASE", "INITIAL_PURCHASE"].includes(ev.type)) return new Response("ignored");
  const n = PACKS[ev.product_id];
  const userId: string | undefined = ev.app_user_id;
  if (!n || !userId || !/^[0-9a-f-]{36}$/i.test(userId)) return new Response("ignored");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin.rpc("add_ai_credits", { tx: String(ev.transaction_id ?? ev.id), u: userId, prod: ev.product_id, n });
  return new Response(error ? "error" : "ok", { status: error ? 500 : 200 });
});
