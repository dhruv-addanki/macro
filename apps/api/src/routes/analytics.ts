import type { FastifyInstance } from "fastify";
import { resolveUserIdFromAuthHeaderAsync } from "../modules/auth/service";
import { getAnalyticsSummaryForUser } from "../modules/analytics/service";

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  app.get("/analytics/summary", async (request) => getAnalyticsSummaryForUser(await resolveUserIdFromAuthHeaderAsync(request.headers.authorization)));
}
