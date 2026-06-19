import type { FastifyInstance } from "fastify";
import {
  AuthLoginRequestSchema,
  AuthLogoutRequestSchema,
  AuthSignupRequestSchema
} from "@macro/shared";
import { parseBody, sendZodError } from "../lib/http";
import { getSessionTokenFromHeader, login, logout, sessionForTokenAsync, signup } from "../modules/auth/service";

function requestSessionToken(request: { headers: Record<string, unknown>; body?: unknown }): string | undefined {
  const authorization = getSessionTokenFromHeader(request.headers.authorization);
  if (authorization) return authorization;

  const body = request.body as { sessionToken?: unknown } | undefined;
  return typeof body?.sessionToken === "string" ? body.sessionToken : undefined;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/auth/signup", async (request, reply) => {
    try {
      const input = parseBody(AuthSignupRequestSchema, request.body);
      const result = await signup(input);
      if ("error" in result) {
        return reply.code(409).send({ error: result.error, message: "An account already exists for this email." });
      }
      return result;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/auth/login", async (request, reply) => {
    try {
      const input = parseBody(AuthLoginRequestSchema, request.body);
      const result = await login(input);
      if ("error" in result) {
        return reply.code(404).send({ error: result.error, message: "No local account exists for this email." });
      }
      return result;
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    try {
      const input = parseBody(AuthLogoutRequestSchema, request.body ?? {});
      const token = requestSessionToken({ headers: request.headers, body: input });
      return { ok: await logout(token) };
    } catch (error) {
      if (!sendZodError(reply, error)) throw error;
    }
  });

  app.get("/auth/session", async (request) => {
    const token = getSessionTokenFromHeader(request.headers.authorization);
    return sessionForTokenAsync(token);
  });
}
