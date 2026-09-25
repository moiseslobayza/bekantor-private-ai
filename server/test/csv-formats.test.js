import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { inspectPharmacyCsv } from "../src/services/csv-import.service.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const read = (name) => fs.readFileSync(path.join(fixtures, name), "utf8");

test("acepta esquema BEKANTOR y decimal con punto", () => {
  const result = inspectPharmacyCsv(read("bekantor.csv"));
  assert.equal(result.records[0].salesAmount, 120.5);
});

test("normaliza alias, espacios, guiones y fecha argentina", () => {
  const result = inspectPharmacyCsv(read("alternativo.csv"));
  assert.equal(result.records[0].sku, "XYZ");
  assert.equal(result.records[0].saleDate, "2026-09-02");
});

test("detecta punto y coma, tildes, comillas y número argentino", () => {
  const result = inspectPharmacyCsv(`\uFEFF${read("argentino.csv")}`);
  assert.equal(result.delimiter, ";");
  assert.equal(result.records[0].productName, "Producto, especial");
  assert.equal(result.records[0].salesAmount, 1234.5);
});

test("BOM UTF-8 también funciona con primer encabezado entre comillas", () => {
  const content = `\uFEFF"SKU",producto,fecha,unidades_vendidas,importe_venta,stock_actual\nX,Producto X,2026-09-01,1,10,3`;
  assert.equal(inspectPharmacyCsv(content).records[0].sku, "X");
});

test("CSV inválido informa columnas faltantes", () => {
  assert.throws(() => inspectPharmacyCsv(read("invalido.csv")), /Faltan columnas requeridas:.*SKU/);
});

test("rechaza fechas imposibles y filas truncadas", () => {
  assert.throws(() => inspectPharmacyCsv(read("bekantor.csv").replace("2026-09-01", "31/02/2026")), /fecha inexistente/);
  assert.throws(() => inspectPharmacyCsv(read("bekantor.csv").replace(",9", "")), /se esperaban 7 columnas/);
});
