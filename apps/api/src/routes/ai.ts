import type { FastifyInstance, FastifyReply } from "fastify";
import {
  CorrectionRequestSchema,
  PhotoMealEstimateRequestSchema,
  SavedMealMatchRequestSchema,
  TextMealEstimateRequestSchema
} from "@macro/shared";
import { parseBody, sendZodError } from "../lib/http";
import { applyCorrection, estimatePhotoMeal, estimateTextMeal, findPersonalMealMatchesForUser, getAiHistoryForUser } from "../modules/ai/service";
import {
  completeAiUsageEvent,
  failAiUsageEvent,
  getAiUsageSummary,
  reserveAiRequest,
  type AiRateLimitRejection
} from "../modules/ai/usage";
import {
  createMealPhotoAccessForUser,
  deleteMealPhotoForUser,
  listMealPhotosForUserFromSource,
  retainMealPhoto,
  sendLocalMealPhotoAccess
} from "../modules/photos/service";
import { resolveUserIdFromAuthHeaderAsync, userIdForSessionTokenAsync } from "../modules/auth/service";
import { recordAnalyticsEvent } from "../modules/analytics/service";
import { env } from "../lib/env";

function safeDeleteRedirect(value: unknown): string {
  if (typeof value !== "string") return "http://localhost:8082/profile";
  if (value.startsWith("/") && !value.startsWith("//")) return value;

  try {
    const url = new URL(value);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return value;
    }
  } catch {
    return "http://localhost:8082/profile";
  }

  return "http://localhost:8082/profile";
}

function requestBaseUrl(request: { headers: Record<string, unknown>; protocol?: string; hostname?: string }): string {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const forwardedHost = request.headers["x-forwarded-host"];
  const host = typeof forwardedHost === "string" ? forwardedHost : typeof request.headers.host === "string" ? request.headers.host : request.hostname;
  const protocol = typeof forwardedProto === "string" ? forwardedProto.split(",")[0]?.trim() : request.protocol ?? "http";
  return `${protocol}://${host ?? "localhost:4000"}`;
}

function sendAiRateLimit(reply: FastifyReply, rejection: AiRateLimitRejection) {
  return reply
    .header("Retry-After", String(rejection.retryAfterSeconds))
    .code(429)
    .send({
      error: rejection.error,
      message: rejection.message,
      limit: rejection.limit,
      remaining: rejection.remaining,
      resetAt: rejection.resetAt,
      retryAfterSeconds: rejection.retryAfterSeconds
    });
}

export async function registerAiRoutes(app: FastifyInstance) {
  app.get("/ai/history", async (request) => getAiHistoryForUser(await resolveUserIdFromAuthHeaderAsync(request.headers.authorization)));

  app.get("/ai/usage", async (request) => getAiUsageSummary(await resolveUserIdFromAuthHeaderAsync(request.headers.authorization)));

  app.get("/ai/meal-photos", async (request) => ({
    mealPhotos: await listMealPhotosForUserFromSource(await resolveUserIdFromAuthHeaderAsync(request.headers.authorization))
  }));

  app.get("/ai/meal-photos/access/:token", async (request, reply) => {
    const params = request.params as { token?: string };
    if (!params.token || !sendLocalMealPhotoAccess(params.token, reply)) {
      return reply.code(404).send({ message: "Meal photo access link expired or not found." });
    }
    return reply;
  });

  app.post("/ai/meal-text/estimate", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(TextMealEstimateRequestSchema, request.body);
      const reservation = await reserveAiRequest({
        userId,
        endpoint: "meal-text-estimate",
        inputType: "text",
        costUnits: 1
      });
      if (!reservation.allowed) return sendAiRateLimit(reply, reservation);

      try {
        const response = await estimateTextMeal(userId, input);
        await completeAiUsageEvent(reservation.eventId, response);
        return response;
      } catch (error) {
        await failAiUsageEvent(reservation.eventId);
        await recordAnalyticsEvent({
          userId,
          eventType: "scan_failure",
          status: "failed",
          sourceType: "ai_text",
          metadata: {
            endpoint: "meal-text-estimate",
            reason: error instanceof Error ? error.message : "text_estimate_failed"
          }
        });
        throw error;
      }
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/ai/meal-photo/estimate", { bodyLimit: env.photoRequestBodyLimitBytes }, async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(PhotoMealEstimateRequestSchema, request.body);
      const reservation = await reserveAiRequest({
        userId,
        endpoint: "meal-photo-estimate",
        inputType: "photo",
        costUnits: 5
      });
      if (!reservation.allowed) return sendAiRateLimit(reply, reservation);

      try {
        const response = await estimatePhotoMeal(userId, input);
        const mealPhoto = await retainMealPhoto({
          userId,
          imageBase64: input.imageBase64,
          mimeType: input.mimeType,
          retainPhoto: input.retainPhoto,
          source: input.photoSource
        });
        await completeAiUsageEvent(reservation.eventId, response);
        return mealPhoto ? { ...response, mealPhoto } : response;
      } catch (error) {
        await failAiUsageEvent(reservation.eventId);
        throw error;
      }
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.delete("/ai/meal-photos/:id", async (request, reply) => {
    const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
    const params = request.params as { id?: string };
    const id = params.id;
    if (!id || !(await deleteMealPhotoForUser(userId, id))) {
      return reply.code(404).send({ message: "Meal photo not found." });
    }
    return { ok: true, deletedId: id };
  });

  app.get("/ai/meal-photos/:id/access", async (request, reply) => {
    const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
    const params = request.params as { id?: string };
    if (!params.id) {
      return reply.code(404).send({ message: "Meal photo not found." });
    }
    const access = await createMealPhotoAccessForUser(userId, params.id, requestBaseUrl(request));
    if (!access) {
      return reply.code(404).send({ message: "Meal photo not found." });
    }
    return access;
  });

  app.get("/ai/meal-photos/:id/delete-redirect", async (request, reply) => {
    const params = request.params as { id?: string };
    const query = request.query as { redirectTo?: string; sessionToken?: string };
    if (params.id) {
      const userId = (await userIdForSessionTokenAsync(query.sessionToken)) ?? await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      await deleteMealPhotoForUser(userId, params.id);
    }
    return reply.redirect(safeDeleteRedirect(query.redirectTo));
  });

  app.post("/ai/meal/correct", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(CorrectionRequestSchema, request.body);
      const reservation = await reserveAiRequest({
        userId,
        endpoint: "meal-correct",
        inputType: "correction",
        costUnits: 1
      });
      if (!reservation.allowed) return sendAiRateLimit(reply, reservation);

      try {
        const response = await applyCorrection(userId, input);
        await completeAiUsageEvent(reservation.eventId, response);
        await recordAnalyticsEvent({
          userId,
          eventType: "ai_correction_applied",
          status: "success",
          sourceType: null,
          metadata: {
            estimateId: input.estimateId ?? response.estimateId ?? null,
            promptVersion: response.promptVersion,
            usedFallback: response.usedFallback
          }
        });
        return response;
      } catch (error) {
        await failAiUsageEvent(reservation.eventId);
        throw error;
      }
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/ai/meal/match-saved", async (request, reply) => {
    try {
      const userId = await resolveUserIdFromAuthHeaderAsync(request.headers.authorization);
      const input = parseBody(SavedMealMatchRequestSchema, request.body);
      const reservation = await reserveAiRequest({
        userId,
        endpoint: "meal-match-saved",
        inputType: "saved_meal_match",
        costUnits: 1
      });
      if (!reservation.allowed) return sendAiRateLimit(reply, reservation);

      try {
        const matches = await findPersonalMealMatchesForUser(userId, input.query, input.limit);
        await completeAiUsageEvent(reservation.eventId, {
          model: "personal-memory",
          promptVersion: "saved-meal-match.v1",
          usedFallback: true
        });
        return { matches };
      } catch (error) {
        await failAiUsageEvent(reservation.eventId);
        throw error;
      }
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });
}
