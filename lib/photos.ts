import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { uploadSnap } from "./community";

/** Let the driver pick a photo, shrink it to 1280 px wide JPEG and upload it. Returns the storage path, or null if they cancelled. */
export async function pickAndUploadPhoto(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const img = await ImageManipulator.manipulate(res.assets[0].uri).resize({ width: 1280 }).renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  return uploadSnap(out.base64!);
}
