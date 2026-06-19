import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { store } from "../../lib/store";
import { deleteMealPhoto, listMealPhotos, retainMealPhoto } from "./service";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

describe("photo service", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "macro-photos-"));
    process.env.MACRO_PHOTO_DIR = tempDir;
    store.mealPhotos = [];
  });

  afterEach(() => {
    store.mealPhotos = [];
    delete process.env.MACRO_PHOTO_DIR;
    rmSync(tempDir, { force: true, recursive: true });
  });

  it("only retains opted-in meal photos and deletes stored files", async () => {
    const imageBytes = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");
    const imageBase64 = imageBytes.toString("base64");

    await expect(retainMealPhoto({ imageBase64, retainPhoto: false })).resolves.toBeUndefined();
    expect(listMealPhotos()).toHaveLength(0);

    const photo = await retainMealPhoto({
      imageBase64: `data:image/png;base64,${imageBase64}`,
      mimeType: "image/png",
      retainPhoto: true,
      source: "camera"
    });

    expect(photo).toBeTruthy();
    expect(photo?.byteLength).toBe(imageBytes.byteLength);
    expect(photo?.source).toBe("camera");
    expect(listMealPhotos()).toHaveLength(1);
    expect(existsSync(join(tempDir, photo!.storageKey))).toBe(true);

    await expect(deleteMealPhoto(photo!.id)).resolves.toBe(true);
    expect(listMealPhotos()).toHaveLength(0);
    expect(existsSync(join(tempDir, photo!.storageKey))).toBe(false);
    await expect(deleteMealPhoto(photo!.id)).resolves.toBe(false);
  });

  it("rejects retained photo payloads whose bytes are not a supported image", async () => {
    const imageBase64 = Buffer.from("not-an-image").toString("base64");

    await expect(retainMealPhoto({
      imageBase64,
      mimeType: "image/jpeg",
      retainPhoto: true,
      source: "upload"
    })).resolves.toBeUndefined();

    expect(listMealPhotos()).toHaveLength(0);
  });
});
