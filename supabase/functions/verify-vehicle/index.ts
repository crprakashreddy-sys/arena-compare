// Optional step: checks a vehicle number against the RTO record and gives the driver a
// "Verified EV" badge when the fuel type is electric. Anyone can use the app without it.
// Deploy: supabase functions deploy verify-vehicle
//
// Set these secrets (Dashboard → Edge Functions → Secrets) once you sign up with an
// RC verification provider such as Surepass, IDfy or Signzy:
//   RC_API_URL   the provider's RC lookup endpoint
//   RC_API_KEY   your API key (sent as "Authorization: Bearer <key>")
// Providers name fields differently; adjust readFuelType() to match yours.
import { createClient } from "jsr:@supabase/supabase-js@2";

const PLATE = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;      // TS09EV1234, KA01AB1234
const BH_PLATE = /^\d{2}BH\d{4}[A-Z]{1,2}$/;            // 22BH1234AA

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function readFuelType(payload: any): string | null {
  const d = payload?.data ?? payload?.result ?? payload;
  return d?.fuel_type ?? d?.fuelType ?? d?.fuel_descr ?? d?.fuel ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u.user) return json({ error: "Sign in first." }, 401);

  const { reg_number } = await req.json().catch(() => ({ reg_number: "" }));
  const reg = String(reg_number ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!PLATE.test(reg) && !BH_PLATE.test(reg)) {
    return json({ error: "That doesn't look like an Indian vehicle number. Try the format TS09EV1234." }, 400);
  }

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: taken } = await admin.from("vehicles").select("user_id").eq("reg_number", reg).maybeSingle();
  if (taken && taken.user_id !== u.user.id) {
    return json({ error: "This vehicle is already linked to another account." }, 409);
  }

  let fuel: string | null = null;
  const apiUrl = Deno.env.get("RC_API_URL");
  const apiKey = Deno.env.get("RC_API_KEY");
  if (apiUrl && apiKey) {
    try {
      const r = await fetch(apiUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id_number: reg }),
      });
      fuel = readFuelType(await r.json());
    } catch {
      fuel = null;
    }
  }

  // The community is open to everyone: a non-electric vehicle is saved but gets no badge.
  const isEV = !!fuel && /ELECTRIC|BOV|BATTERY/i.test(fuel);

  await admin.from("vehicles").upsert({
    user_id: u.user.id,
    reg_number: reg,
    fuel_type: fuel,
    verified_at: isEV ? new Date().toISOString() : null,
  });
  await admin.from("profiles").update({ vehicle_verified: isEV }).eq("id", u.user.id);

  return json({ verified: isEV, checked: !!fuel, reg_number: reg });
});
