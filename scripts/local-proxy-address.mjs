export function localProxyAddress(settings = {}, environment = process.env) {
  const host = (environment.MACRO_VOICE_HOST ?? settings.MACRO_VOICE_HOST ?? "127.0.0.1").trim();
  const port = Number(environment.MACRO_VOICE_PORT ?? settings.MACRO_VOICE_PORT ?? 4001);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid MACRO_VOICE_PORT");
  const connectHost = host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
  const authority = connectHost.includes(":") ? `[${connectHost}]` : connectHost;
  return { host, port, url: new URL(`http://${authority}:${port}`).origin };
}
