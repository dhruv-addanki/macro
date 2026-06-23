import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workspaceRoot = resolve(apiRoot, "../..");

dotenv.config({ path: resolve(workspaceRoot, ".env") });
dotenv.config({ path: resolve(apiRoot, ".env") });

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function storeDriver(): "json" | "prisma" {
  return process.env.MACRO_STORE_DRIVER === "prisma" ? "prisma" : "json";
}

function authDriver(): "local" | "supabase" {
  return process.env.MACRO_AUTH_DRIVER === "supabase" ? "supabase" : "local";
}

function photoStorageDriver(): "local" | "supabase" | "s3" {
  switch (process.env.MACRO_PHOTO_STORAGE_DRIVER) {
    case "supabase":
      return "supabase";
    case "s3":
      return "s3";
    default:
      return "local";
  }
}

const photoMaxBytes = numberEnv("MACRO_PHOTO_MAX_BYTES", 8 * 1024 * 1024);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL,
  storeDriver: storeDriver(),
  authDriver: authDriver(),
  photoStorageDriver: photoStorageDriver(),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseStorageBucket: process.env.MACRO_SUPABASE_STORAGE_BUCKET ?? "macro-meal-photos",
  s3Bucket: process.env.MACRO_S3_BUCKET,
  s3Region: process.env.MACRO_S3_REGION ?? "us-east-1",
  s3Endpoint: process.env.MACRO_S3_ENDPOINT,
  s3AccessKeyId: process.env.MACRO_S3_ACCESS_KEY_ID,
  s3SecretAccessKey: process.env.MACRO_S3_SECRET_ACCESS_KEY,
  s3ForcePathStyle: process.env.MACRO_S3_FORCE_PATH_STYLE === "true",
  photoAccessTtlSeconds: numberEnv("MACRO_PHOTO_ACCESS_TTL_SECONDS", 5 * 60),
  photoMaxBytes,
  photoRequestBodyLimitBytes: numberEnv("MACRO_PHOTO_REQUEST_BODY_LIMIT_BYTES", Math.ceil(photoMaxBytes * 1.5)),
  retainedPhotoRetentionDays: numberEnv("MACRO_RETAINED_PHOTO_RETENTION_DAYS", 90),
  openaiApiKey: process.env.OPENAI_API_KEY,
  usdaApiKey: process.env.USDA_API_KEY,
  aiPhotoModel: process.env.MACRO_AI_PHOTO_MODEL ?? "gpt-5.5",
  aiTextModel: process.env.MACRO_AI_TEXT_MODEL ?? "gpt-5.4-mini",
  aiCorrectionModel: process.env.MACRO_AI_CORRECTION_MODEL ?? "gpt-5.4-mini",
  aiBarcodeUnitModel: process.env.MACRO_AI_BARCODE_UNIT_MODEL ?? process.env.MACRO_AI_TEXT_MODEL ?? "gpt-5.4-mini",
  aiRateLimitWindowMs: numberEnv("MACRO_AI_RATE_LIMIT_WINDOW_MS", 60 * 60 * 1000),
  aiTextEstimateLimit: numberEnv("MACRO_AI_TEXT_ESTIMATE_LIMIT", 60),
  aiPhotoEstimateLimit: numberEnv("MACRO_AI_PHOTO_ESTIMATE_LIMIT", 20),
  aiCorrectionLimit: numberEnv("MACRO_AI_CORRECTION_LIMIT", 60),
  aiMatchSavedLimit: numberEnv("MACRO_AI_MATCH_SAVED_LIMIT", 120),
  aiDailyBudgetUnits: numberEnv("MACRO_AI_DAILY_BUDGET_UNITS", 200)
};
