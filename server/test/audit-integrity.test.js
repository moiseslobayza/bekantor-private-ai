import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bekantor-integrity-audit-"));
process.env.FARMACIA_DATA_DIR = directory;
const { default: database } = await import("../src/data/database.js");
const { saveImport, getImportSummary } = await import("../src/data/pharmacy.repository.js");
const { getDashboard } = await import("../src/services/pharmacy-analytics.service.js");
const { parsePharmacyCsv } = await import("../src/services/csv-import.service.js");
const row = { sku: "A", productName: "A", category: "C", saleDate: "2026-09-30", unitsSold: 3, salesAmount: 0.1, currentStock: 0 };

test("rollback completo ante fallo a mitad de inserción; hash obligatorio", () => {
  assert.throws(() => saveImport({ originalFilename: "a", storedFilename: "a", contentHash: "a".repeat(64), records: [row, { ...row, productName: null }] }));
  assert.equal(getImportSummary().recordCount, 0);
  assert.equal(getImportSummary().importCount, 0);
  assert.throws(() => saveImport({ records: [row] }));
});

test("SKU renombrado no se divide en ranking o baja rotación y decimales exactos", () => {
  saveImport({ originalFilename: "a", storedFilename: "a", contentHash: "b".repeat(64), records: [row, { ...row, productName: "Renombrado", category: "Otro", salesAmount: 0.2 }] });
  const dashboard = getDashboard();
  assert.equal(dashboard.salesTotal, 0.3);
  assert.equal(dashboard.topProducts.length, 1);
  assert.equal(dashboard.topProducts[0].unitsSold, 6);
  assert.equal(dashboard.topProducts[0].productName, "Renombrado");
  assert.deepEqual(dashboard.lowRotationProducts, []);
  assert.equal(dashboard.lowStockCount, 1);
});

test("CSV rechaza números ambiguos, agrupaciones inválidas, filas vacías y encabezados ambiguos", () => {
  const header = "sku;producto;fecha;unidades;importe;stock\n";
  for (const amount of ["1.234", "1,234", "12.34,50", "1,234.50", "1 2", "-1", "1.2.3", "", "9007199254740993"]) {
    assert.throws(() => parsePharmacyCsv(`${header}A;A;2026-09-30;1;${amount};0`), /inválido|ambiguo|grande/);
  }
  assert.equal(parsePharmacyCsv(`${header}A;A;30/09/2026;0;0;0`)[0].salesAmount, 0);
  assert.throws(() => parsePharmacyCsv(`${header};;;;;`), /obligatorios/);
  assert.throws(() => parsePharmacyCsv(`${header.replace("producto", "producto;nombre")}A;A;A;2026-09-30;1;1;0`), /varias columnas/);
});

test("migración con duplicados aborta atómicamente sin borrar históricos", () => {
  const legacy = path.join(directory, "legacy");
  fs.mkdirSync(path.join(legacy, "uploads"), { recursive: true });
  const dbPath = path.join(legacy, "farmacia.sqlite");
  let db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE imports(id INTEGER PRIMARY KEY, original_filename TEXT, stored_filename TEXT, imported_at TEXT, record_count INTEGER); INSERT INTO imports VALUES(1,'a','a.csv','2026-01-01',0),(2,'b','b.csv','2026-01-01',0)");
  db.close();
  fs.writeFileSync(path.join(legacy, "uploads/a.csv"), "idéntico");
  fs.writeFileSync(path.join(legacy, "uploads/b.csv"), "idéntico");
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", "await import('./src/data/database.js')"], { cwd: path.resolve(import.meta.dirname, ".."), env: { ...process.env, FARMACIA_DATA_DIR: legacy }, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no se eliminaron datos/);
  db = new DatabaseSync(dbPath);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM imports").get().n, 2);
  assert.equal(db.prepare("PRAGMA table_info(imports)").all().some((c) => c.name === "content_hash"), false);
  db.close();
});

test.after(() => { database.close(); fs.rmSync(directory, { recursive: true }); });
