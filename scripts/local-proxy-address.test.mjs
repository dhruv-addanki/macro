import test from "node:test";
import assert from "node:assert/strict";
import { localProxyAddress } from "./local-proxy-address.mjs";

test("defaults to Mac-only access", () => {
  assert.equal(localProxyAddress({}, {}).url, "http://127.0.0.1:4001");
});

test("health checks use the configured Wi-Fi interface instead of loopback", () => {
  const address = localProxyAddress({ MACRO_VOICE_HOST: "192.168.1.20", MACRO_VOICE_PORT: "4012" }, {});
  assert.equal(address.url, "http://192.168.1.20:4012");
  assert.equal(address.host, "192.168.1.20");
});

test("explicit process settings take precedence", () => {
  assert.equal(localProxyAddress({ MACRO_VOICE_HOST: "127.0.0.1" }, { MACRO_VOICE_HOST: "192.168.1.20" }).url, "http://192.168.1.20:4001");
});

test("wildcard listeners have concrete health-check addresses", () => {
  assert.equal(localProxyAddress({ MACRO_VOICE_HOST: "0.0.0.0" }, {}).url, "http://127.0.0.1:4001");
  assert.equal(localProxyAddress({ MACRO_VOICE_HOST: "::" }, {}).url, "http://[::1]:4001");
});

test("invalid ports fail before starting a proxy", () => {
  assert.throws(() => localProxyAddress({ MACRO_VOICE_PORT: "0" }, {}), /Invalid/);
});
