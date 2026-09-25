import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bekantor-chat-audit-"));
process.env.FARMACIA_DATA_DIR = directory;
const { resolvePharmacyIntent, getPharmacyAnswer, answerPharmacyQuestion } = await import("../src/services/pharmacy-chat.service.js");
const { default: database } = await import("../src/data/database.js");
test.after(() => { database.close(); fs.rmSync(directory, { recursive: true }); });

const dashboard = {
  period: { from: "2026-09-01", to: "2026-09-30" }, salesTotal: 250, unitsSold: 12,
  lowStockCount: 1, lowStockThreshold: 10, lowRotationMaxUnits: 5,
  topProducts: [{ productName: "Producto A", unitsSold: 9 }],
  lowStockProducts: [{ productName: "Producto B", currentStock: 3 }],
  lowRotationProducts: [{ productName: "Producto B", unitsSold: 3 }],
};

test("resuelve preguntas operativas explícitas", () => {
  assert.equal(resolvePharmacyIntent("¿Cuánto vendimos en los últimos 30 días?"), "salesTotal");
  assert.equal(resolvePharmacyIntent("¿Cuántas unidades vendimos?"), "unitsSold");
  assert.equal(resolvePharmacyIntent("¿Cuál fue el producto más vendido?"), "bestProduct");
  assert.equal(resolvePharmacyIntent("¿Cuáles son los productos más vendidos?"), "topProducts");
  assert.equal(resolvePharmacyIntent("¿Qué productos tienen stock bajo?"), "lowStock");
  assert.equal(resolvePharmacyIntent("¿Qué productos tienen baja rotación?"), "lowRotation");
  assert.equal(resolvePharmacyIntent("¿Quién sos?"), null);
});

test("redacta cifras a partir del resultado autorizado", () => {
  assert.match(getPharmacyAnswer("salesTotal", dashboard), /250/);
  assert.match(getPharmacyAnswer("unitsSold", dashboard), /12 unidades/);
  assert.match(getPharmacyAnswer("bestProduct", dashboard), /Producto A \(9 unidades\)/);
  assert.match(getPharmacyAnswer("lowStock", dashboard), /Producto B \(3\)/);
});

test("la salida del modelo no altera el resultado determinístico", async () => {
  const result = await answerPharmacyQuestion("¿Cuánto vendimos?", async () => "Vendimos 999999.", dashboard);
  assert.equal(result.intent, "salesTotal");
  assert.doesNotMatch(result.response, /999999/);
});

test("rechaza período, filtro, métrica y múltiples intenciones no soportados", async () => {
  for (const question of ["¿Cuánto vendimos ayer?", "¿Cuánto vendimos de paracetamol?", "¿Qué productos tienen sin stock?", "¿Cuál fue el margen?", "¿Cuáles son los productos más vendidos por importe?", "¿Cuánto vendimos y cuántas unidades vendimos?", "¿Y el mes anterior?", "¿Cuántos clientes tenemos?"]) {
    const result = await answerPharmacyQuestion(question, async () => { assert.fail("No se debe consultar el modelo"); }, dashboard);
    assert.equal(result.intent, "unsupported", question);
    assert.match(result.response, /no está soportada/);
  }
});
