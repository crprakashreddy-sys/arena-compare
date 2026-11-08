import { requireOptionalNativeModule } from "expo";

/**
 * On-device AI cartoons (Apple Image Playground). Only in the App Store build on Apple Intelligence
 * iPhones; in Expo Go or on older phones `available` resolves to an empty list.
 */
type Native = {
  availableStyles(): Promise<string[]>;
  generate(sourceUri: string, prompt: string, style: string): Promise<string>;
};
const native = requireOptionalNativeModule<Native>("ZingdImagine");

export type AiStyle = "illustration" | "animation" | "sketch";
export async function aiStyles(): Promise<AiStyle[]> {
  if (!native) return [];
  try { return (await native.availableStyles()) as AiStyle[]; } catch { return []; }
}
export async function aiCartoon(sourceUri: string, prompt: string, style: AiStyle): Promise<string> {
  if (!native) throw new Error("AI cartoons work in the App Store version of zingd, on iPhone 15 Pro or newer.");
  return native.generate(sourceUri, prompt, style);
}
