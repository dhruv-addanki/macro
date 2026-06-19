import { cleanupRetainedMealPhotos } from "../modules/photos/service";
import { env } from "../lib/env";

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply");
const retentionDaysArg = process.argv.find((arg) => arg.startsWith("--days="));
const retentionDays = retentionDaysArg ? Number(retentionDaysArg.slice("--days=".length)) : env.retainedPhotoRetentionDays;

if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
  console.error("Retention days must be a positive number. Use --days=90 or MACRO_RETAINED_PHOTO_RETENTION_DAYS=90.");
  process.exit(1);
}

const result = await cleanupRetainedMealPhotos({
  dryRun,
  retentionDays
});

console.log(JSON.stringify({
  ok: result.failed.length === 0,
  dryRun: result.dryRun,
  retentionDays,
  cutoffIso: result.cutoffIso,
  candidateCount: result.candidates.length,
  deletedCount: result.deleted.length,
  failed: result.failed.map(({ mealPhoto, error }) => ({
    id: mealPhoto.id,
    userId: mealPhoto.userId,
    uploadedAt: mealPhoto.uploadedAt,
    error
  })),
  candidates: result.candidates.map((mealPhoto) => ({
    id: mealPhoto.id,
    userId: mealPhoto.userId,
    uploadedAt: mealPhoto.uploadedAt,
    byteLength: mealPhoto.byteLength ?? null
  }))
}, null, 2));

if (result.failed.length > 0) {
  process.exit(1);
}
