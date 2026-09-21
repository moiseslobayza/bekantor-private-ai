import test from "node:test";
import assert from "node:assert/strict";
import { parsePharmacyCsv } from "../src/services/csv-import.service.js";

test("interpreta el esquema CSV de farmacia", () => {
  const records = parsePharmacyCsv([
    "codigo,nombre_producto,fecha,cantidad,importe,stock",
    "ABC-1,Producto de prueba,2026-09-01,3,1500,8",
  ].join("\n"));

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    sku: "ABC-1",
    productName: "Producto de prueba",
    saleDate: "2026-09-01",
    category: "Sin categoría",
    unitsSold: 3,
    salesAmount: 1500,
    currentStock: 8,
  });
});

test("rechaza un CSV sin columnas necesarias", () => {
  assert.throws(
    () => parsePharmacyCsv("producto,fecha\nProducto,2026-09-01"),
    /Faltan columnas requeridas/
  );
});
