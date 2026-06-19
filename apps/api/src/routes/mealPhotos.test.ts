import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEMO_USER_ID, store } from "../lib/store";
import { retainMealPhoto } from "../modules/photos/service";
import { buildServer } from "../server";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

describe("meal photo access routes", () => {
  let app: FastifyInstance;
  let tempDir = "";

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "macro-photo-access-"));
    process.env.MACRO_PHOTO_DIR = tempDir;
    store.mealPhotos = [];
    app = await buildServer();
  });

  afterEach(async () => {
    await app.close();
    store.mealPhotos = [];
    delete process.env.MACRO_PHOTO_DIR;
    rmSync(tempDir, { force: true, recursive: true });
  });

  it("issues short-lived local access URLs and invalidates them on delete", async () => {
    const image = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");
    const photo = await retainMealPhoto({
      userId: DEMO_USER_ID,
      imageBase64: image.toString("base64"),
      retainPhoto: true,
      mimeType: "image/png",
      source: "camera"
    });

    expect(photo).toBeTruthy();
    expect(existsSync(join(tempDir, photo!.storageKey))).toBe(true);

    const access = await app.inject({
      method: "GET",
      url: `/ai/meal-photos/${photo!.id}/access`
    });
    expect(access.statusCode).toBe(200);
    const accessBody = access.json() as { url: string; expiresAt: string };
    expect(accessBody.url).toContain("/ai/meal-photos/access/");
    expect(Date.parse(accessBody.expiresAt)).toBeGreaterThan(Date.now());

    const accessPath = new URL(accessBody.url).pathname;
    const file = await app.inject({
      method: "GET",
      url: accessPath
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("image/png");
    expect(Number(file.headers["content-length"])).toBe(image.byteLength);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/ai/meal-photos/${photo!.id}`
    });
    expect(deleted.statusCode).toBe(200);

    const afterDelete = await app.inject({
      method: "GET",
      url: accessPath
    });
    expect(afterDelete.statusCode).toBe(404);
  });
});
