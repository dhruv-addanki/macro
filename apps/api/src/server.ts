import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./lib/env";
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
    reply.status(500).send({
      error: "internal_error",
      message: env.nodeEnv === "development" ? message : "Something went wrong"
    });
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = await buildServer();
  app.addHook("onClose", async () => {
    await closeStorePersistence();
  });
  await app.listen({ port: env.port, host: "0.0.0.0" });
}
