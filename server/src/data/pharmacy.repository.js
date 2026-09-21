import database from "./database.js";

export class DuplicateImportError extends Error {
  constructor() {
    super("Este archivo ya fue importado anteriormente.");
    this.name = "DuplicateImportError";
  }
}

export function saveImport({ originalFilename, storedFilename, contentHash, records }) {
  const insertImport = database.prepare(`
    INSERT INTO imports (original_filename, stored_filename, content_hash, record_count)
    VALUES (?, ?, ?, ?)
  `);
  const insertRecord = database.prepare(`
    INSERT INTO pharmacy_records (import_id, sku, product_name, category, sale_date, units_sold, sales_amount, current_stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  database.exec("BEGIN TRANSACTION");
  try {
    const result = insertImport.run(originalFilename, storedFilename, contentHash, records.length);
    const importId = Number(result.lastInsertRowid);
    for (const record of records) {
      insertRecord.run(importId, record.sku, record.productName, record.category, record.saleDate, record.unitsSold, record.salesAmount, record.currentStock);
    }
    database.exec("COMMIT");
    return importId;
  } catch (error) {
    database.exec("ROLLBACK");
    if (error.message.includes("imports.content_hash")) throw new DuplicateImportError();
    throw error;
  }
}

export function getImportSummary() {
  const totals = database.prepare(`
    SELECT (SELECT COUNT(*) FROM imports) AS importCount,
           (SELECT COUNT(*) FROM pharmacy_records) AS recordCount,
           (SELECT MAX(imported_at) FROM imports) AS lastImportedAt
  `).get();
  const imports = database.prepare(`
    SELECT id, original_filename AS originalFilename, imported_at AS importedAt, record_count AS recordCount
    FROM imports ORDER BY id DESC LIMIT 10
  `).all();
  return { importCount: Number(totals.importCount), recordCount: Number(totals.recordCount), lastImportedAt: totals.lastImportedAt, imports };
}
