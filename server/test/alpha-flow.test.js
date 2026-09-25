import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "bekantor-alpha-test-"));
process.env.FARMACIA_DATA_DIR = testDir;
const { parsePharmacyCsv } = await import("../src/services/csv-import.service.js");
const { saveImport, getImportSummary } = await import("../src/data/pharmacy.repository.js");
const { getDashboard } = await import("../src/services/pharmacy-analytics.service.js");
const { answerPharmacyQuestion } = await import("../src/services/pharmacy-chat.service.js");
const { default: database } = await import("../src/data/database.js");

test("CSV → SQLite → dashboard → chat → persistencia", async () => {
  const csv = "sku,producto,fecha,unidades_vendidas,importe_venta,stock_actual\nA,Producto A,2026-09-01,2,100,8\n";
  const records = parsePharmacyCsv(csv);
  saveImport({ originalFilename: "alpha.csv", storedFilename: "alpha.csv", contentHash: createHash("sha256").update(csv).digest("hex"), records });
  assert.equal(getImportSummary().recordCount, 1);
  assert.equal(getDashboard().salesTotal, 100);
  const answer = await answerPharmacyQuestion("¿Cuánto vendimos?", async () => { throw new Error("Ollama apagado"); });
  assert.match(answer.response, /100/);
  database.close();
  const reopened = new DatabaseSync(path.join(testDir, "farmacia.sqlite"));
  assert.equal(reopened.prepare("SELECT COUNT(*) AS total FROM pharmacy_records").get().total, 1);
  reopened.close();
});

test.after(() => {
  try { database.close(); } catch { /* cerrado por el test */ }
  fs.rmSync(testDir, { recursive: true, force: true });
});
