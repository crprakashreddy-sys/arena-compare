// Premium AI cartoon: redraws the user's own photo as art with Google's Gemini image model,
// keeping faces, poses, the car and the scene. Costs one credit (1 free per person, then packs).
// Deploy: sh ai-setup.sh   (sets GEMINI_API_KEY and deploys this function)
import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-3.1-flash-image-preview";
const KEEP =
  "Redraw THIS exact photo. Keep every person's face, identity, age, skin tone, hairstyle, expression, clothing and pose exactly the same so each person is instantly recognisable. " +
  "Keep the vehicle exactly as in the photo (same shape, colour, badges and details), the same background, the same framing and camera angle. Do not add or remove people or objects. No text, no watermark.";
const STYLES: Record<string, string> = {
  comic: "Style: premium hand-inked graphic-novel illustration. Clean confident ink outlines, rich cel shading with soft gradients, detailed fabric folds and reflections, warm cinematic lighting, vibrant but natural colours.",
  anime: "Style: high-end anime feature-film still. Crisp line art, luminous soft lighting with gentle bloom, expressive eyes while keeping each person's real features, beautifully painted background.",
  "3d": "Style: premium 3D animated movie render. Soft global illumination, subtle subsurface skin, stylised but faithful proportions, glossy car paint, shallow depth of field.",
  watercolor: "Style: elegant watercolour painting on textured paper. Loose but accurate washes, fine ink details on faces, soft bleeding edges, airy light.",
  oil: "Style: classical oil painting portrait. Visible confident brushstrokes, rich warm palette, dramatic chiaroscuro lighting, gallery quality.",
  sketch: "Style: detailed graphite pencil sketch on cream paper. Precise linework and cross-hatching, subtle smudged shading, artist sketchbook quality.",
};

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "AI cartoons aren't switched on yet." }, 503);

  const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Sign in to make an AI cartoon." }, 401);

  let body: { image?: string; style?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const image = body.image ?? "";
  if (!image || image.length > 9_000_000) return json({ error: "Photo is missing or too big." }, 400);
  const style = STYLES[body.style ?? "comic"] ?? STYLES.comic;

  const admin = createClient(url, service);
  const { data: ok } = await admin.rpc("take_ai_credit", { u: user.id });
  if (!ok) return json({ error: "no_credits" }, 402);

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: image } }, { text: `${KEEP}\n${style}` }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    });
    const j = await r.json();
    const parts: any[] = j?.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p) => p.inlineData || p.inline_data);
    const data: string | undefined = img?.inlineData?.data ?? img?.inline_data?.data;
    const mime: string = img?.inlineData?.mimeType ?? img?.inline_data?.mime_type ?? "image/png";
    if (!data) {
      const raw: string = j?.error?.message ?? "";
      console.error("gemini", r.status, raw.slice(0, 300)); // full detail stays in the server logs
      if (r.status === 429 || /quota|rate/i.test(raw)) throw new Error("AI cartoons are busy right now. Try again in a minute.");
      if (r.status === 400 && /api key|API_KEY/i.test(raw)) throw new Error("AI cartoons aren't set up correctly yet.");
      throw new Error(j?.candidates?.[0]?.finishReason === "SAFETY" ? "This photo can't be turned into a cartoon. Try another one." : "No image came back. Try again.");
    }
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const path = `${user.id}/ai-${Date.now()}.${mime.includes("jpeg") ? "jpg" : "png"}`;
    const up = await admin.storage.from("snaps").upload(path, bytes, { contentType: mime, upsert: false });
    if (up.error) throw new Error("Couldn't save the cartoon.");
    const { data: left } = await admin.from("ai_credits").select("credits").eq("user_id", user.id).single();
    return json({ path, credits: left?.credits ?? 0 });
  } catch (e) {
    await admin.rpc("refund_ai_credit", { u: user.id });
    return json({ error: e instanceof Error ? e.message : "Something went wrong." }, 500);
  }
});
