import { Platform } from "react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { supabase } from "./supabase";

/**
 * Premium AI cartoons: your photo is redrawn by Google's Gemini image model on zingd's server.
 * Everyone gets 1 free; after that, packs bought in the App Store (via RevenueCat).
 */
export type PremiumStyle = "comic" | "anime" | "3d" | "watercolor" | "oil" | "sketch";
export const PREMIUM_STYLES: { id: PremiumStyle; name: string; emoji: string }[] = [
  { id: "comic", name: "Comic", emoji: "💥" },
  { id: "anime", name: "Anime", emoji: "🌸" },
  { id: "3d", name: "3D movie", emoji: "🧸" },
  { id: "watercolor", name: "Watercolour", emoji: "🎨" },
  { id: "oil", name: "Oil painting", emoji: "🖼️" },
  { id: "sketch", name: "Pencil", emoji: "✏️" },
];
export const PACKS = [
  { id: "zingd.ai.cartoons5", cartoons: 5, price: "₹49" },
  { id: "zingd.ai.cartoons15", cartoons: 15, price: "₹129" },
];

export async function fetchAiCredits(): Promise<number> {
  const { data, error } = await supabase.rpc("my_ai_credits");
  if (error) return 0;
  return (data as number) ?? 0;
}

export class NoCreditsError extends Error {}

/** Sends the photo to zingd's server, returns the storage path of the finished cartoon. */
export async function makeAiCartoon(uri: string, style: PremiumStyle): Promise<{ path: string; credits: number }> {
  const img = await ImageManipulator.manipulate(uri).resize({ width: 1280 }).renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.88, base64: true });
  const { data, error } = await supabase.functions.invoke("cartoon", { body: { image: out.base64, style } });
  if (error) {
    let msg = "Couldn't make it. Try again.";
    try { const b = await (error as any).context?.json(); msg = b?.error ?? msg; } catch {}
    if (msg === "no_credits") throw new NoCreditsError("You're out of AI cartoons.");
    throw new Error(msg);
  }
  return data as { path: string; credits: number };
}

// ── App Store purchases through RevenueCat (works in the real app; Expo Go shows a preview) ──
let configured = false;
function purchases(): any | null {
  try { return require("react-native-purchases").default; } catch { return null; }
}
export async function setupPurchases(userId: string) {
  const P = purchases();
  const key = process.env.EXPO_PUBLIC_RC_IOS_KEY;
  if (!P || !key || configured || Platform.OS !== "ios") return;
  try { P.configure({ apiKey: key, appUserID: userId }); configured = true; } catch {}
}
/** Buys a pack. Credits arrive through the RevenueCat webhook a moment later. */
export async function buyPack(productId: string): Promise<"bought" | "cancelled"> {
  const P = purchases();
  if (!P || !configured) throw new Error("Buying packs works in the App Store version of zingd.");
  const products = await P.getProducts([productId], P.PRODUCT_CATEGORY?.NON_SUBSCRIPTION);
  if (!products?.length) throw new Error("This pack isn't available yet.");
  try {
    await P.purchaseStoreProduct(products[0]);
    return "bought";
  } catch (e: any) {
    if (e?.userCancelled) return "cancelled";
    throw new Error(e?.message ?? "The purchase didn't go through.");
  }
}
