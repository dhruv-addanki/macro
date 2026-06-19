import type { MealPhoto } from "@macro/shared";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { FastifyReply } from "fastify";
import { env } from "../../lib/env";
import { createId, nowIso } from "../../lib/http";
import {
  deleteMealPhotoFromPrisma,
  getMealPhotoFromPrisma,
  listMealPhotosFromPrisma,
  listRetainedMealPhotosBeforeFromPrisma,
  persistMealPhotoInPrisma
} from "../../lib/prismaStore";
import { DEMO_USER_ID, saveStore, store } from "../../lib/store";

const DEFAULT_MIME_TYPE = "image/jpeg";
const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);

type LocalAccessGrant = {
  userId: string;
  photoId: string;
  storageKey: string;
  mimeType: string;
  expiresAtMs: number;
};

const localAccessGrants = new Map<string, LocalAccessGrant>();

function photoStorageDir(): string {
  return process.env.MACRO_PHOTO_DIR ?? resolve(process.cwd(), "../../.macro-data/photos");
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("heic")) return "heic";
  return "jpg";
}

function normalizeMimeType(mimeType?: string): string {
  const normalized = (mimeType?.trim().toLowerCase() || DEFAULT_MIME_TYPE).replace("image/jpg", "image/jpeg");
  return normalized;
}

function isSupportedMimeType(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.has(mimeType);
}

function detectedImageMimeType(bytes: Buffer): string | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("ascii").toLowerCase();
    if (["heic", "heix", "hevc", "hevx", "heif", "mif1", "msf1"].includes(brand)) {
      return "image/heif";
    }
  }
  return undefined;
}

function isMimeTypeCompatible(claimedMimeType: string, detectedMimeType: string): boolean {
  if (claimedMimeType === detectedMimeType) return true;
  const heifTypes = new Set(["image/heic", "image/heif"]);
  return heifTypes.has(claimedMimeType) && heifTypes.has(detectedMimeType);
}

function stripDataUrlPrefix(value: string): string {
  const [, base64] = value.match(/^data:[^;]+;base64,(.+)$/) ?? [];
  return base64 ?? value;
}

function photoFilePath(storageKey: string): string {
  const root = resolve(photoStorageDir());
  const path = resolve(root, storageKey);
  if (!path.startsWith(`${root}/`) && path !== root) {
    throw new Error("Invalid photo storage key");
  }
  return path;
}

let s3Client: S3Client | null = null;
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when MACRO_PHOTO_STORAGE_DRIVER=supabase");
  }
  supabaseClient ??= createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return supabaseClient;
}

function supabaseBucket(): string {
  if (!env.supabaseStorageBucket) {
    throw new Error("MACRO_SUPABASE_STORAGE_BUCKET is required when MACRO_PHOTO_STORAGE_DRIVER=supabase");
  }
  return env.supabaseStorageBucket;
}

function getS3Client(): S3Client {
  s3Client ??= new S3Client({
    region: env.s3Region,
    endpoint: env.s3Endpoint,
    forcePathStyle: env.s3ForcePathStyle,
    credentials: env.s3AccessKeyId && env.s3SecretAccessKey
      ? {
          accessKeyId: env.s3AccessKeyId,
          secretAccessKey: env.s3SecretAccessKey
        }
      : undefined
  });
  return s3Client;
}

function s3Bucket(): string {
  if (!env.s3Bucket) {
    throw new Error("MACRO_S3_BUCKET is required when MACRO_PHOTO_STORAGE_DRIVER=s3");
  }
  return env.s3Bucket;
}

async function writePhoto(storageKey: string, bytes: Buffer, mimeType: string): Promise<void> {
  if (env.photoStorageDriver === "supabase") {
    const { error } = await getSupabaseClient()
      .storage
      .from(supabaseBucket())
      .upload(storageKey, bytes, {
        contentType: mimeType,
        upsert: false
      });
    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }
    return;
  }

  if (env.photoStorageDriver === "s3") {
    await getS3Client().send(new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: storageKey,
      Body: bytes,
      ContentType: mimeType
    }));
    return;
  }

  const path = photoFilePath(storageKey);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

async function removePhoto(storageKey: string): Promise<void> {
  if (env.photoStorageDriver === "supabase") {
    const { error } = await getSupabaseClient()
      .storage
      .from(supabaseBucket())
      .remove([storageKey]);
    if (error) {
      throw new Error(`Supabase Storage delete failed: ${error.message}`);
    }
    return;
  }

  if (env.photoStorageDriver === "s3") {
    await getS3Client().send(new DeleteObjectCommand({
      Bucket: s3Bucket(),
      Key: storageKey
    }));
    return;
  }

  const path = photoFilePath(storageKey);
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
}

function publicBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function pruneExpiredLocalAccessGrants(nowMs = Date.now()): void {
  for (const [token, grant] of localAccessGrants) {
    if (grant.expiresAtMs <= nowMs) {
      localAccessGrants.delete(token);
    }
  }
}

function createLocalAccessToken(grant: Omit<LocalAccessGrant, "expiresAtMs">): { token: string; expiresAt: string } {
  pruneExpiredLocalAccessGrants();
  const token = randomBytes(24).toString("base64url");
  const expiresAtMs = Date.now() + env.photoAccessTtlSeconds * 1000;
  localAccessGrants.set(token, { ...grant, expiresAtMs });
  return { token, expiresAt: new Date(expiresAtMs).toISOString() };
}

function shouldPersistDirectlyToPrisma(): boolean {
  return env.storeDriver === "prisma" && process.env.NODE_ENV !== "test";
}

async function persistMealPhotoMetadata(mealPhoto: MealPhoto): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await persistMealPhotoInPrisma({
      mealPhoto,
      user: store.authUsers.find((user) => user.id === mealPhoto.userId)
    });
    return;
  }

  saveStore();
}

async function deleteMealPhotoMetadata(userId: string, id: string): Promise<void> {
  if (shouldPersistDirectlyToPrisma()) {
    await deleteMealPhotoFromPrisma(userId, id);
    return;
  }

  saveStore();
}

export async function retainMealPhoto(input: {
  userId?: string;
  imageBase64?: string;
  retainPhoto?: boolean;
  source?: MealPhoto["source"];
  mimeType?: string;
}): Promise<MealPhoto | undefined> {
  if (!input.retainPhoto || !input.imageBase64) return undefined;

  const mimeType = normalizeMimeType(input.mimeType);
  if (!isSupportedMimeType(mimeType)) return undefined;
  const photoId = createId("photo");
  const userId = input.userId ?? DEMO_USER_ID;
  const storageKey = `${userId}/${photoId}.${extensionForMimeType(mimeType)}`;
  const bytes = Buffer.from(stripDataUrlPrefix(input.imageBase64), "base64");
  if (bytes.byteLength === 0) return undefined;
  if (bytes.byteLength > env.photoMaxBytes) return undefined;
  const detectedMimeType = detectedImageMimeType(bytes);
  if (!detectedMimeType || !isMimeTypeCompatible(mimeType, detectedMimeType)) return undefined;

  await writePhoto(storageKey, bytes, mimeType);

  const mealPhoto: MealPhoto = {
    id: photoId,
    userId,
    storageKey,
    thumbnailKey: null,
    retained: true,
    source: input.source ?? "unknown",
    mimeType,
    byteLength: bytes.byteLength,
    uploadedAt: nowIso()
  };

  store.mealPhotos.push(mealPhoto);
  try {
    await persistMealPhotoMetadata(mealPhoto);
  } catch (error) {
    store.mealPhotos = store.mealPhotos.filter((photo) => photo.id !== mealPhoto.id);
    try {
      await removePhoto(storageKey);
    } catch {
      // Metadata persistence failed; best effort cleanup avoids orphaned retained images.
    }
    throw error;
  }
  return mealPhoto;
}

export function listMealPhotos(): MealPhoto[] {
  return listMealPhotosForUser(DEMO_USER_ID);
}

export function listMealPhotosForUser(userId: string): MealPhoto[] {
  return store.mealPhotos
    .filter((mealPhoto) => mealPhoto.userId === userId && mealPhoto.retained)
    .slice()
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function listMealPhotosForUserFromSource(userId: string): Promise<MealPhoto[]> {
  if (shouldPersistDirectlyToPrisma()) {
    return listMealPhotosFromPrisma(userId);
  }
  return listMealPhotosForUser(userId);
}

export function deleteMealPhoto(id: string): Promise<boolean> {
  return deleteMealPhotoForUser(DEMO_USER_ID, id);
}

export async function deleteMealPhotoForUser(userId: string, id: string): Promise<boolean> {
  const index = store.mealPhotos.findIndex((mealPhoto) => mealPhoto.userId === userId && mealPhoto.id === id);
  const mealPhoto = index === -1 && shouldPersistDirectlyToPrisma()
    ? await getMealPhotoFromPrisma(userId, id)
    : store.mealPhotos[index];
  if (!mealPhoto) return false;

  if (index >= 0) {
    store.mealPhotos.splice(index, 1);
  }
  if (mealPhoto.storageKey) {
    try {
      await removePhoto(mealPhoto.storageKey);
    } catch (error) {
      if (index >= 0) {
        store.mealPhotos.splice(index, 0, mealPhoto);
      }
      throw error;
    }
  }
  for (const [token, grant] of localAccessGrants) {
    if (grant.userId === userId && grant.photoId === id) {
      localAccessGrants.delete(token);
    }
  }

  try {
    await deleteMealPhotoMetadata(userId, id);
  } catch (error) {
    if (index >= 0) {
      store.mealPhotos.splice(index, 0, mealPhoto);
    }
    throw error;
  }
  return true;
}

async function listRetainedMealPhotosBefore(cutoffIso: string): Promise<MealPhoto[]> {
  if (shouldPersistDirectlyToPrisma()) {
    return listRetainedMealPhotosBeforeFromPrisma(cutoffIso);
  }
  return store.mealPhotos
    .filter((mealPhoto) => mealPhoto.retained && mealPhoto.uploadedAt < cutoffIso)
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}

export async function cleanupRetainedMealPhotos(input?: {
  dryRun?: boolean;
  retentionDays?: number;
  now?: Date;
}): Promise<{
  cutoffIso: string;
  dryRun: boolean;
  candidates: MealPhoto[];
  deleted: MealPhoto[];
  failed: Array<{ mealPhoto: MealPhoto; error: string }>;
}> {
  const retentionDays = input?.retentionDays ?? env.retainedPhotoRetentionDays;
  const now = input?.now ?? new Date();
  const cutoffIso = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const candidates = await listRetainedMealPhotosBefore(cutoffIso);
  const dryRun = input?.dryRun ?? true;
  const deleted: MealPhoto[] = [];
  const failed: Array<{ mealPhoto: MealPhoto; error: string }> = [];

  if (!dryRun) {
    for (const mealPhoto of candidates) {
      try {
        const didDelete = await deleteMealPhotoForUser(mealPhoto.userId, mealPhoto.id);
        if (didDelete) {
          deleted.push(mealPhoto);
        }
      } catch (error) {
        failed.push({
          mealPhoto,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  return {
    cutoffIso,
    dryRun,
    candidates,
    deleted,
    failed
  };
}

export async function createMealPhotoAccessForUser(userId: string, id: string, baseUrl: string): Promise<{
  url: string;
  expiresAt: string;
} | null> {
  const mealPhoto = shouldPersistDirectlyToPrisma()
    ? await getMealPhotoFromPrisma(userId, id)
    : store.mealPhotos.find((photo) => photo.userId === userId && photo.id === id && photo.retained);
  if (!mealPhoto) return null;

  const expiresAt = new Date(Date.now() + env.photoAccessTtlSeconds * 1000).toISOString();
  if (env.photoStorageDriver === "supabase") {
    const { data, error } = await getSupabaseClient()
      .storage
      .from(supabaseBucket())
      .createSignedUrl(mealPhoto.storageKey, env.photoAccessTtlSeconds);
    if (error || !data?.signedUrl) {
      throw new Error(`Supabase Storage signed URL failed: ${error?.message ?? "missing signed URL"}`);
    }
    return { url: data.signedUrl, expiresAt };
  }

  if (env.photoStorageDriver === "s3") {
    const url = await getSignedUrl(
      getS3Client(),
      new GetObjectCommand({
        Bucket: s3Bucket(),
        Key: mealPhoto.storageKey
      }),
      { expiresIn: env.photoAccessTtlSeconds }
    );
    return { url, expiresAt };
  }

  if (!existsSync(photoFilePath(mealPhoto.storageKey))) return null;

  const grant = createLocalAccessToken({
    userId,
    photoId: id,
    storageKey: mealPhoto.storageKey,
    mimeType: mealPhoto.mimeType ?? DEFAULT_MIME_TYPE
  });
  return {
    url: `${publicBaseUrl(baseUrl)}/ai/meal-photos/access/${encodeURIComponent(grant.token)}`,
    expiresAt: grant.expiresAt
  };
}

export function sendLocalMealPhotoAccess(token: string, reply: FastifyReply): boolean {
  pruneExpiredLocalAccessGrants();
  const grant = localAccessGrants.get(token);
  if (!grant) return false;

  const path = photoFilePath(grant.storageKey);
  if (!existsSync(path)) {
    localAccessGrants.delete(token);
    return false;
  }

  const stat = statSync(path);
  reply.header("Content-Type", grant.mimeType);
  reply.header("Content-Length", String(stat.size));
  reply.header("Cache-Control", "private, max-age=60");
  reply.send(createReadStream(path));
  return true;
}
