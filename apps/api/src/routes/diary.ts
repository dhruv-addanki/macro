import type { FastifyInstance } from "fastify";
import { CopyDiaryDayRequestSchema, CreateDiaryEntrySchema, LogEstimateRequestSchema, UpdateDiaryEntrySchema } from "@macro/shared";
import { parseBody, sendZodError } from "../lib/http";
import {
  createDiaryEntry,
  copyDiaryDay,
  deleteDiaryEntry,
  duplicateDiaryEntry,
  getDiaryForUser,
  updateDiaryEntry
} from "../modules/diary/service";
import { resolveUserIdFromAuthHeaderAsync } from "../modules/auth/service";
import { recordAnalyticsEvent, recordLoggedEntry } from "../modules/analytics/service";

export async function registerDiaryRoutes(app: FastifyInstance) {
  app.get("/diary", async (request) => {
    const query = request.query as { date?: string };
    return getDiaryForUser(await resolveUserIdFromAuthHeaderAsync(request.headers.authorization), query.date);
  });

  app.post("/diary/entries", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(CreateDiaryEntrySchema, request.body);
      const entry = await createDiaryEntry(userId, input);
      await recordLoggedEntry(entry, { route: "diary" });
      return entry;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/diary/copy-day", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(CopyDiaryDayRequestSchema, request.body);
      return { entries: await copyDiaryDay(userId, input.fromDate, input.toDate) };
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/diary/entries/from-estimate", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(LogEstimateRequestSchema, request.body);
      const entry = await createDiaryEntry(userId, {
        date: input.date,
        mealGroupId: input.mealGroupId,
        displayName: input.estimate.dishName,
        quantity: input.estimate.portion.quantity,
        unit: input.estimate.portion.unit,
        grams: input.estimate.portion.estimatedWeightG,
        macros: input.estimate.macros,
        sourceType: input.sourceType,
        confidence: input.estimate.confidence,
        assumptions: [...input.estimate.assumptions, ...input.assumptions]
      });
      await recordLoggedEntry(entry, { estimateId: input.estimateId ?? null, route: "from_estimate" });
      await recordAnalyticsEvent({
        userId,
        eventType: "ai_estimate_logged",
        status: "success",
        sourceType: input.sourceType,
        metadata: {
          entryId: entry.id,
          estimateId: input.estimateId ?? null,
          confidence: input.estimate.confidence
        }
      });
      return entry;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.patch("/diary/entries/:id", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const params = request.params as { id: string };
      const input = parseBody(UpdateDiaryEntrySchema, request.body);
      const entry = await updateDiaryEntry(userId, params.id, input);
      if (!entry) {
        reply.status(404).send({ error: "not_found" });
        return;
      }
      return entry;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.delete("/diary/entries/:id", async (request, reply) => {
    const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
    const params = request.params as { id: string };
    const deleted = await deleteDiaryEntry(userId, params.id);
    if (!deleted) {
      reply.status(404).send({ error: "not_found" });
      return;
    }
    return { ok: true };
  });

  app.post("/diary/entries/:id/duplicate", async (request, reply) => {
    const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as { date?: string };
    const entry = await duplicateDiaryEntry(userId, params.id, body.date);
    if (!entry) {
      reply.status(404).send({ error: "not_found" });
      return;
    }
    return entry;
  });
}
