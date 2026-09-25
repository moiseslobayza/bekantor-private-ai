import test from "node:test";
import assert from "node:assert/strict";

process.env.OLLAMA_URL = "http://127.0.0.1:11434";
process.env.OLLAMA_MODEL = "modelo-prueba:1";
const originalFetch = globalThis.fetch;
const { warmModel, currentModelState, localOllamaUrl } = await import("../src/services/ollama-status.service.js");

test("solo permite un Ollama en loopback", () => {
  assert.equal(localOllamaUrl("http://localhost:11434"), "http://127.0.0.1:11434");
  assert.throws(() => localOllamaUrl("https://example.com"), /Ollama local/);
});

test("informa modelo ausente y modelo listo sin depender de Ollama real", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [] }) });
  await warmModel();
  assert.equal(currentModelState().model, "missing");

  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url.endsWith("/api/tags")) return { ok: true, json: async () => ({ models: [{ name: "modelo-prueba:1" }] }) };
    return { ok: true, json: async () => ({ done: true }) };
  };
  await warmModel();
  assert.equal(currentModelState().model, "ready");
  assert.equal(calls.some((url) => url.endsWith("/api/generate")), true);
});

test.after(() => { globalThis.fetch = originalFetch; });

test("timeout de carga libera la comprobación y conserva la API operativa", async () => {
  const timeout = AbortSignal.timeout;
  AbortSignal.timeout = () => timeout(5);
  globalThis.fetch = async (url, { signal }) => {
    if (url.endsWith("/api/tags")) return { ok: true, json: async () => ({ models: [{ name: "modelo-prueba:1" }] }) };
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  };
  const keepAlive = setInterval(() => {}, 100);
  try {
    await warmModel();
    assert.equal(currentModelState().model, "unavailable");
  } finally { AbortSignal.timeout = timeout; clearInterval(keepAlive); }
});

test("detecta caída de Ollama y no considera listo un warm-up fallido", async () => {
  globalThis.fetch = async () => { throw new Error("offline de prueba"); };
  await warmModel();
  assert.equal(currentModelState().ollama, "offline");
  assert.equal(currentModelState().model, "unavailable");
  let complete;
  let loads = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect, "error");
    if (url.endsWith("/api/tags")) return { ok: true, json: async () => ({ models: [{ name: "modelo-prueba:1" }] }) };
    loads++;
    return new Promise((resolve) => { complete = () => resolve({ ok: true, json: async () => ({ error: "sin memoria" }) }); });
  };
  const first = warmModel();
  const second = warmModel();
  assert.equal(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(currentModelState().model, "loading");
  assert.equal(loads, 1);
  complete();
  await first;
  assert.equal(currentModelState().model, "unavailable");
});
