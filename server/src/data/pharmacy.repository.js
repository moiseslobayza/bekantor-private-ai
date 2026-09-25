import database from "./database.js";

export function readSnapshot(read) {
  database.exec("BEGIN");
  try { const result = read(); database.exec("COMMIT"); return result; }
  catch (error) { database.exec("ROLLBACK"); throw error; }
}

export class DuplicateImportError extends Error {
  constructor() {
    super("Este archivo ya fue importado anteriormente.");
    this.name = "DuplicateImportError";
  }
}

export function saveImport({ originalFilename, storedFilename, contentHash, records }) {
  if (!/^[a-f0-9]{64}$/.test(contentHash || "") || !Array.isArray(records) || !records.length) throw new Error("Importación interna inválida.");
  const insertImport = database.prepare(`
    INSERT INTO imports (original_filename, stored_filename, content_hash, record_count)
    VALUES (?, ?, ?, ?)
  `);
  const insertRecord = database.prepare(`
    INSERT INTO pharmacy_records (import_id, sku, product_name, category, sale_date, units_sold, sales_amount, current_stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  database.exec("BEGIN IMMEDIATE");
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

export function getLatestSaleDate() {
  const invalid = database.prepare("SELECT 1 FROM pharmacy_records WHERE length(sale_date) <> 10 OR date(sale_date, '+0 days') IS NULL OR date(sale_date, '+0 days') <> sale_date LIMIT 1").get();
  if (invalid) throw new Error("Los datos históricos contienen fechas no canónicas; revisá los CSV originales antes de analizar.");
  const result = database.prepare("SELECT MAX(sale_date) AS saleDate FROM pharmacy_records").get();
  return result.saleDate || null;
}

export function getDashboardMetrics({ from, to, lowStockThreshold, lowRotationMaxUnits }) {
  const totals = database.prepare(`
    SELECT ROUND(COALESCE(SUM(sales_amount), 0), 2) AS salesTotal,
           ROUND(COALESCE(SUM(units_sold), 0), 2) AS unitsSold
    FROM pharmacy_records
    WHERE sale_date BETWEEN ? AND ?
  `).get(from, to);

  const topProducts = database.prepare(`
    SELECT r.sku, (SELECT product_name FROM pharmacy_records p WHERE p.sku = r.sku ORDER BY sale_date DESC, id DESC LIMIT 1) AS productName,
           ROUND(SUM(r.units_sold), 2) AS unitsSold,
           ROUND(SUM(r.sales_amount), 2) AS salesAmount
    FROM pharmacy_records r
    WHERE r.sale_date BETWEEN ? AND ?
    GROUP BY r.sku
    ORDER BY unitsSold DESC, productName ASC, r.sku ASC
    LIMIT 5
  `).all(from, to);

  const lowStockProducts = database.prepare(`
    WITH latest_stock AS (
      SELECT sku, product_name AS productName, category, current_stock AS currentStock,
             ROW_NUMBER() OVER (PARTITION BY sku ORDER BY sale_date DESC, id DESC) AS rowNumber
      FROM pharmacy_records
    )
    SELECT sku, productName, category, currentStock
    FROM latest_stock
    WHERE rowNumber = 1 AND currentStock <= ?
    ORDER BY currentStock ASC, productName ASC
  `).all(lowStockThreshold);

  const lowRotationProducts = database.prepare(`
    SELECT r.sku, (SELECT product_name FROM pharmacy_records p WHERE p.sku = r.sku ORDER BY sale_date DESC, id DESC LIMIT 1) AS productName,
           ROUND(SUM(r.units_sold), 2) AS unitsSold,
           ROUND(SUM(r.sales_amount), 2) AS salesAmount
    FROM pharmacy_records r
    WHERE r.sale_date BETWEEN ? AND ?
    GROUP BY r.sku
    HAVING ROUND(SUM(r.units_sold), 2) <= ?
    ORDER BY unitsSold ASC, productName ASC, r.sku ASC
  `).all(from, to, lowRotationMaxUnits);

  return {
    salesTotal: Number(totals.salesTotal),
    unitsSold: Number(totals.unitsSold),
    topProducts: topProducts.map((product) => ({ ...product, unitsSold: Number(product.unitsSold), salesAmount: Number(product.salesAmount) })),
    lowStockProducts: lowStockProducts.map((product) => ({ ...product, currentStock: Number(product.currentStock) })),
    lowRotationProducts: lowRotationProducts.map((product) => ({ ...product, unitsSold: Number(product.unitsSold), salesAmount: Number(product.salesAmount) })),
  };
}
