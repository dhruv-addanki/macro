import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { VoiceInterpretRequestSchema, validateVoiceResult } from "@macro/shared";
import { z, ZodError } from "zod";
import { readVoiceEnv, type VoiceEnv } from "./lib/voiceEnv";
import { VoiceAccess } from "./lib/voiceAccess";
import { createVoiceAI, type VoiceAI } from "./modules/ai/voiceLogging";

type Cached = { hash: string; expires: number; promise: Promise<unknown> };

export async function buildVoiceServer(options: { env?: VoiceEnv; ai?: VoiceAI } = {}) {
  const env = options.env ?? readVoiceEnv();
  const access = new VoiceAccess(env);
  const ai = options.ai ?? createVoiceAI(env);
  const app = Fastify({ logger: false, bodyLimit: 128 * 1024 });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0, parts: 1 } });
  const cache = new Map<string, Cached>();
  const principals = new WeakMap<object, string>();
  const rateWindows = new Map<string, { start: number; requests: number }>();
  let active = 0;

  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (request.url === "/health") return;
    const client = access.authenticate(request.headers.authorization);
    if (!client) return reply.code(401).send({ error: "unauthorized", message: "The API credential is not valid. Check Profile > API connection." });
    principals.set(request, client);
    const window = rateWindows.get(client);
    if (!window || Date.now() - window.start >= 60000) rateWindows.set(client, { start: Date.now(), requests: 1 });
    else if (++window.requests > 30) return reply.code(429).header("Retry-After", "60").send({ error: "rate_limited", message: "Too many requests. Please wait a minute." });
  });

  async function deduplicate(id: string, hash: string, work: () => Promise<unknown>) {
    for (const [key, entry] of cache) if (entry.expires < Date.now()) cache.delete(key);
    const existing = cache.get(id);
    if (existing) {
      if (existing.hash !== hash) throw Object.assign(new Error("This request ID was already used for different content."), { statusCode: 409 });
      return existing.promise;
    }
    if (active >= 3 || cache.size >= 100) throw Object.assign(new Error("The local proxy is busy. Try again shortly."), { statusCode: 429 });
    access.reserveCall();
    active++;
    const promise = Promise.resolve().then(work).catch((error) => { cache.delete(id); throw error; }).finally(() => { active--; });
    cache.set(id, { hash, expires: Date.now() + 10 * 60000, promise });
    return promise;
  }

  app.get("/health", async () => ({ ok: true, service: "macro-voice" }));
  app.get("/v1/status", async () => ({ ok: true, service: "macro-voice", openaiConfigured: Boolean(env.key), model: env.model, transcriptionModel: env.transcriptionModel }));

  app.post("/v1/meals/interpret", async (request) => {
    const input = VoiceInterpretRequestSchema.parse(request.body);
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    return deduplicate(`${principals.get(request)}:meal:${input.requestID}`, hash, async () => validateVoiceResult(await ai.interpret(input), input));
  });

  app.post("/v1/audio/transcribe", async (request) => {
    const id = request.headers["idempotency-key"];
    if (!z.string().uuid().safeParse(id).success) throw Object.assign(new Error("A valid recording request ID is required."), { statusCode: 400 });
    const extensions: Record<string, string> = { "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "webm" };
    let data: Buffer | undefined;
    let mime = "";
    for await (const part of request.parts()) {
      if (part.type !== "file") throw Object.assign(new Error("Only a recording file is accepted."), { statusCode: 400 });
      mime = part.mimetype;
      if (!extensions[mime]) throw Object.assign(new Error("Unsupported audio format."), { statusCode: 415 });
      data = await part.toBuffer();
    }
    if (!data) throw Object.assign(new Error("Attach a recording."), { statusCode: 400 });
    if (data.length < 32) throw Object.assign(new Error("The recording is empty."), { statusCode: 422 });
    const hash = createHash("sha256").update(data).digest("hex");
    const recording = data;
    return deduplicate(`${principals.get(request)}:audio:${id}`, hash, async () => ({ text: await ai.transcribe(recording, `meal.${extensions[mime]}`, mime) }));
  });

  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof ZodError ? 422 : (error as { statusCode?: number }).statusCode ?? (error as { status?: number }).status ?? 502;
    const safeStatus = status >= 400 && status <= 599 ? status : 502;
    const upstream = error instanceof Error ? error.message : "The estimate could not be completed.";
    const message = error instanceof ZodError ? "The food data was incomplete or invalid. Try describing it again." : /api.key|authentication|incorrect.*key/i.test(upstream) && safeStatus !== 503 ? "The OpenAI key was rejected. Update the server key and restart the proxy." : safeStatus >= 500 && safeStatus !== 503 ? "The AI request could not be completed. Check the configured model/key, or try again. Your diary has not changed." : upstream;
    reply.code(safeStatus).send({ error: (error as { code?: string }).code ?? "request_failed", message });
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = readVoiceEnv();
  const app = await buildVoiceServer({ env });
  await app.listen({ host: env.host, port: env.port });
  console.log(`Macro voice proxy listening on http://${env.host}:${env.port} (OpenAI ${env.key ? "configured" : "not configured"})`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
}
