import Fastify from "fastify";
import cors from "@fastify/cors";
import { assertValidRuntimeConfig, env } from "./lib/env";
import { closeStorePersistence, getStorePersistenceStatus, initializeStorePersistence } from "./lib/store";
import { registerAuthRoutes } from "./routes/auth";
import { registerAiRoutes } from "./routes/ai";
import { registerAnalyticsRoutes } from "./routes/analytics";
import { registerBarcodeRoutes } from "./routes/barcode";
import { registerDiaryRoutes } from "./routes/diary";
import { registerFoodRoutes } from "./routes/foods";
import { registerProgressRoutes } from "./routes/progress";
import { registerRecipeRoutes } from "./routes/recipes";
import { registerSavedMealRoutes } from "./routes/savedMeals";
import { registerUserRoutes } from "./routes/users";

export async function buildServer() {
  assertValidRuntimeConfig();
  await initializeStorePersistence();

  const app = Fastify({
    logger: env.nodeEnv === "development"
      ? {
          level: "info",
          transport: {
            target: "pino-pretty"
          }
        }
      : true
  });

  await app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({
    ok: true,
    service: "macro-api",
    openaiConfigured: Boolean(env.openaiApiKey),
    authDriver: env.authDriver,
    photoStorageDriver: env.photoStorageDriver,
    persistence: getStorePersistenceStatus()
  }));

  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerDiaryRoutes(app);
  await registerFoodRoutes(app);
  await registerBarcodeRoutes(app);
  await registerAiRoutes(app);
  await registerSavedMealRoutes(app);
  await registerRecipeRoutes(app);
  await registerProgressRoutes(app);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const errorStatusCode = (error as { statusCode?: unknown }).statusCode;
    const statusCode = typeof errorStatusCode === "number" ? errorStatusCode : 500;
    const isPayloadTooLarge = statusCode === 413;
    reply.status(statusCode).send({
      error: isPayloadTooLarge ? "payload_too_large" : statusCode >= 500 ? "internal_error" : "request_error",
      message: isPayloadTooLarge
        ? "Photo upload is too large. Try a smaller image."
        : statusCode < 500 || env.nodeEnv === "development"
          ? message
          : "Something went wrong"
    });
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = await buildServer();
  app.addHook("onClose", async () => {
    await closeStorePersistence();
  });

  let closing = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, "Shutting down Macro API");
    await app.close();
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  await app.listen({ port: env.port, host: "0.0.0.0" });
}
