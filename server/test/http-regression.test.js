import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
const root = path.resolve(import.meta.dirname, "..");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bekantor-http-audit-"));
let child;
let mockOllama;
let base;
let installed = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function stop() {
  if (child && child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
}
async function start() {
  const portProbe = http.createServer();
  portProbe.listen(0, "127.0.0.1"); await once(portProbe, "listening");
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["src/app.js"], { cwd: root, windowsHide: true,
    env: { ...process.env, PORT: String(port), FARMACIA_DATA_DIR: directory, OLLAMA_URL: `http://127.0.0.1:${mockOllama.address().port}`, OLLAMA_MODEL: "not-installed" }, stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { }
    if (child.exitCode !== null) throw new Error("El servidor no inició");
    await sleep(50);
  }
  throw new Error("Timeout de arranque");
}
async function upload(route, content, name = "same.csv") {
  const form = new FormData(); form.append("file", new Blob([content]), name);
  return fetch(`${base}/api/farmacia/${route}`, { method: "POST", body: form });
}
const get = async (route) => (await fetch(`${base}${route}`)).json();

test("HTTP: preview sin escritura, validación, carreras de duplicados, chat, reinicio y status", async () => {
  mockOllama = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/generate") return res.end(JSON.stringify({ done: true }));
    if (req.url === "/api/chat") return setTimeout(() => res.end(JSON.stringify({ message: { content: "Soy BEKANTOR." } })), 100);
    res.end(JSON.stringify({ models: installed ? [{ name: "not-installed" }] : [] }));
  });
  mockOllama.listen(0, "127.0.0.1"); await once(mockOllama, "listening");
  await start();
  assert.equal((await get("/api/farmacia/dashboard")).salesTotal, 0);
  const csv = fs.readFileSync(path.join(root, "examples/farmacia-ejemplo.csv"));
  assert.equal((await upload("preview", csv)).status, 200);
  assert.equal((await get("/api/farmacia/imports")).recordCount, 0);
  assert.deepEqual(fs.readdirSync(path.join(directory, "uploads")), []);
  const bad = await upload("import", "sku,producto\nA,B");
  assert.equal(bad.status, 400);
  assert.equal((await get("/api/farmacia/imports")).importCount, 0);
  const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => upload("import", csv, `${i}.csv`)));
  assert.deepEqual(responses.map((res) => res.status).sort(), [201, 409, 409, 409, 409, 409]);
  assert.equal((await get("/api/farmacia/imports")).recordCount, 5);
  assert.equal(fs.readdirSync(path.join(directory, "uploads")).length, 1);
  const dashboard = await get("/api/farmacia/dashboard");
  assert.equal(dashboard.salesTotal, 169100);
  assert.equal(dashboard.unitsSold, 59);
  const chat = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "¿Cuánto vendimos?", sessionId: "http" }) });
  assert.match((await chat.json()).response, /169\.100/);
  const invalid = await fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: {}, sessionId: 3 }) });
  assert.equal(invalid.status, 400);
  const foreign = await fetch(`${base}/api/chat`, { method: "POST", headers: { Origin: "https://example.com", "Content-Type": "application/json" }, body: "{}" });
  assert.equal(foreign.status, 403);
  const page = await fetch(base); assert.equal(page.headers.get("access-control-allow-origin"), null);
  assert.match(await page.text(), /Dashboard operativo/);
  await stop(); await start();
  assert.equal((await get("/api/farmacia/imports")).recordCount, 5);
  assert.equal((await upload("import", csv)).status, 409);
  const status = await get("/api/status");
  assert.equal(status.sqlite, "online");
  assert.equal(status.model.state, "missing");
  assert.equal(status.data.recordCount, 5);
  assert.doesNotMatch(JSON.stringify(status), /uploads|sqlite"\s*:\s*"[A-Z]:|stack|password|token/);
});

test("chat general conserva servicio y serializa mensajes de la misma sesión", async () => {
  await stop(); installed = true; await start();
  for (let i = 0; i < 40; i++) {
    if ((await get("/api/status")).model.state === "ready") break;
    await sleep(25);
  }
  const send = () => fetch(`${base}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "¿Quién sos?", sessionId: "same-session" }) });
  const responses = await Promise.all([send(), send()]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await responses.find((r) => r.status === 200).json()).response, "Soy BEKANTOR.");
});

test.after(async () => {
  await stop();
  if (mockOllama) await new Promise((resolve) => mockOllama.close(resolve));
  fs.rmSync(directory, { recursive: true });
});
