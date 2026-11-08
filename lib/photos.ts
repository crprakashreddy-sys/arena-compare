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

/** Square photo for a profile or club picture: the driver crops it, we shrink it to 640 px. */
export async function pickSquarePhoto(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const img = await ImageManipulator.manipulate(res.assets[0].uri).resize({ width: 640 }).renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  return uploadSnap(out.base64!);
}
