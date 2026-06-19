import { Buffer } from "node:buffer";
import { deleteMealPhotoForUser, createMealPhotoAccessForUser, retainMealPhoto } from "../modules/photos/service";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MACRO_SUPABASE_STORAGE_BUCKET"];
const missing = requiredEnv.filter((name) => !process.env[name]);

if (process.env.MACRO_PHOTO_STORAGE_DRIVER !== "supabase") {
  missing.push("MACRO_PHOTO_STORAGE_DRIVER=supabase");
}

if (missing.length > 0) {
  console.error(`Missing Supabase storage config: ${missing.join(", ")}`);
  process.exit(1);
}

const userId = `storage_check_${Date.now()}`;
const bytes = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");
let photoId: string | undefined;

try {
  const photo = await retainMealPhoto({
    userId,
    imageBase64: bytes.toString("base64"),
    retainPhoto: true,
    mimeType: "image/png",
    source: "upload"
  });

  if (!photo) {
    throw new Error("No retained photo was created.");
  }

  photoId = photo.id;
  const access = await createMealPhotoAccessForUser(userId, photo.id, "http://localhost:4000");
  if (!access?.url) {
    throw new Error("No signed access URL was created.");
  }

  const response = await fetch(access.url);
  if (!response.ok) {
    throw new Error(`Signed URL fetch failed with ${response.status}`);
  }

  const body = Buffer.from(await response.arrayBuffer()).toString();
  if (body !== bytes.toString()) {
    throw new Error("Downloaded object did not match uploaded bytes.");
  }

  await deleteMealPhotoForUser(userId, photo.id);
  console.log(JSON.stringify({ ok: true, bucket: process.env.MACRO_SUPABASE_STORAGE_BUCKET, photoId: photo.id }, null, 2));
} catch (error) {
  if (photoId) {
    await deleteMealPhotoForUser(userId, photoId).catch(() => undefined);
  }
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
