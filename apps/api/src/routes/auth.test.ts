import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server";
import { DEMO_USER_ID, store } from "../lib/store";

describe("auth routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    store.authUsers = [
      {
        id: DEMO_USER_ID,
        email: "demo@macro.local",
        displayName: "Demo User",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastLoginAt: null
      }
    ];
    store.authSessions = [];
    app = await buildServer();
  });

  afterEach(async () => {
    await app.close();
  });

  it("signs up, reads the session, rejects duplicate signup, and logs out", async () => {
    const signup = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        email: "Test@Macro.Local",
        displayName: "Test User"
      }
    });

    expect(signup.statusCode).toBe(200);
    const signupBody = signup.json();
    expect(signupBody.user.email).toBe("test@macro.local");
    expect(signupBody.sessionToken).toMatch(/^session_/);
    expect(store.authSessions[0]?.token).toBeUndefined();
    expect(store.authSessions[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const session = await app.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        authorization: `Bearer ${signupBody.sessionToken}`
      }
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      authenticated: true,
      user: {
        email: "test@macro.local"
      }
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        email: "test@macro.local",
        displayName: "Test User"
      }
    });
    expect(duplicate.statusCode).toBe(409);

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        authorization: `Bearer ${signupBody.sessionToken}`
      },
      payload: {}
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ ok: true });

    const afterLogout = await app.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        authorization: `Bearer ${signupBody.sessionToken}`
      }
    });
    expect(afterLogout.json()).toEqual({ authenticated: false, user: null });
  });

  it("logs in existing local users and rejects unknown email", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "demo@macro.local"
      }
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().sessionToken).toMatch(/^session_/);

    const missing = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "missing@macro.local"
      }
    });
    expect(missing.statusCode).toBe(404);
  });
});
