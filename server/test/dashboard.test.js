import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "fs";
import os from "os";
import path from "path";

const testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "bekantor-dashboard-test-"));
process.env.FARMACIA_DATA_DIR = testDataDirectory;
delete process.env.LOW_STOCK_THRESHOLD;

const { saveImport } = await import("../src/data/pharmacy.repository.js");
const { getDashboard } = await import("../src/services/pharmacy-analytics.service.js");
const { default: database } = await import("../src/data/database.js");

const records = [
  { sku: "A", productName: "Producto A", category: "A", saleDate: "2026-09-10", unitsSold: 8, salesAmount: 80, currentStock: 20 },
  { sku: "A", productName: "Producto A", category: "A", saleDate: "2026-09-30", unitsSold: 12, salesAmount: 120, currentStock: 8 },
  { sku: "B", productName: "Producto B", category: "B", saleDate: "2026-09-25", unitsSold: 5, salesAmount: 50, currentStock: 10 },
  { sku: "C", productName: "Producto C", category: "C", saleDate: "2026-09-05", unitsSold: 2, salesAmount: 20, currentStock: 11 },
  { sku: "D", productName: "Producto D", category: "D", saleDate: "2026-08-20", unitsSold: 100, salesAmount: 1000, currentStock: 4 },
  { sku: "E", productName: "Producto E", category: "E", saleDate: "2026-09-01", unitsSold: 1, salesAmount: 10, currentStock: 50 },
];

test("devuelve estados vacíos cuando no hay registros", () => {
  assert.deepEqual(getDashboard(), {
    period: { from: null, to: null },
    salesTotal: 0,
    unitsSold: 0,
    lowStockCount: 0,
    topProducts: [],
    lowStockProducts: [],
    lowRotationProducts: [],
    lowStockThreshold: 10,
    lowRotationMaxUnits: 5,
  });
});

test("calcula ventas, unidades, rankings y stock bajo en los últimos 30 días de datos", () => {
  saveImport({
    originalFilename: "controlado.csv",
    storedFilename: "controlado.csv",
    contentHash: createHash("sha256").update("controlado").digest("hex"),
    records,
  });

  const dashboard = getDashboard();
  assert.deepEqual(dashboard.period, { from: "2026-09-01", to: "2026-09-30" });
  assert.equal(dashboard.salesTotal, 280);
  assert.equal(dashboard.unitsSold, 28);
  assert.deepEqual(dashboard.topProducts.map((product) => [product.sku, product.unitsSold]), [
    ["A", 20], ["B", 5], ["C", 2], ["E", 1],
  ]);
  assert.equal(dashboard.lowStockCount, 3);
  assert.deepEqual(dashboard.lowStockProducts.map((product) => [product.sku, product.currentStock]), [
    ["D", 4], ["A", 8], ["B", 10],
  ]);
  assert.deepEqual(dashboard.lowRotationProducts.map((product) => [product.sku, product.unitsSold]), [
    ["E", 1], ["C", 2], ["B", 5],
  ]);
});

test.after(() => {
  database.close();
  fs.rmSync(testDataDirectory, { recursive: true, force: true });
});
