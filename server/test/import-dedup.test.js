import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "fs";
import os from "os";
import path from "path";

const testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "bekantor-farmacia-test-"));
process.env.FARMACIA_DATA_DIR = testDataDirectory;

const { parsePharmacyCsv } = await import("../src/services/csv-import.service.js");
const { DuplicateImportError, getImportSummary, saveImport } = await import("../src/data/pharmacy.repository.js");
const { default: database } = await import("../src/data/database.js");

const csv = [
  "sku,producto,categoria,fecha,unidades_vendidas,importe_venta,stock_actual",
  "PARA-500,Paracetamol 500 mg,Analgesicos,2026-09-01,18,45000,24",
  "VITA-C-1G,Vitamina C 1 g,Vitaminas,2026-09-01,9,31500,65",
  "SHAMP-400,Shampoo neutro 400 ml,Cuidado personal,2026-09-02,4,28000,12",
  "PARA-500,Paracetamol 500 mg,Analgesicos,2026-09-03,22,55000,2",
  "GASA-10,Gasa esteril x10,Primeros auxilios,2026-09-03,6,9600,140",
].join("\n");
const contentHash = createHash("sha256").update(Buffer.from(csv)).digest("hex");
const records = parsePharmacyCsv(csv);

test("guarda la primera importación válida", () => {
  const importId = saveImport({
    originalFilename: "farmacia-ejemplo.csv",
    storedFilename: "primera.csv",
    contentHash,
    records,
  });

  assert.equal(importId, 1);
  assert.deepEqual(getImportSummary().importCount, 1);
  assert.deepEqual(getImportSummary().recordCount, 5);
});

test("rechaza el mismo contenido y conserva la importación original", () => {
  assert.throws(
    () => saveImport({
      originalFilename: "otro-nombre.csv",
      storedFilename: "segunda.csv",
      contentHash,
      records,
    }),
    DuplicateImportError
  );

  const summary = getImportSummary();
  assert.equal(summary.importCount, 1);
  assert.equal(summary.recordCount, 5);
});

test.after(() => {
  database.close();
  fs.rmSync(testDataDirectory, { recursive: true, force: true });
});
