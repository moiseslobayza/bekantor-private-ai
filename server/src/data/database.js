import fs from "fs";
import path from "path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const dataDirectory = process.env.FARMACIA_DATA_DIR || path.resolve(__dirname, "../../data");
export const uploadsDirectory = path.join(dataDirectory, "uploads");
fs.mkdirSync(uploadsDirectory, { recursive: true });

const database = new DatabaseSync(path.join(dataDirectory, "farmacia.sqlite"));
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    content_hash TEXT,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    record_count INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pharmacy_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL,
    sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Sin categoría',
    sale_date TEXT NOT NULL,
    units_sold REAL NOT NULL,
    sales_amount REAL NOT NULL,
    current_stock REAL NOT NULL,
    FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_pharmacy_records_import_id ON pharmacy_records(import_id);
`);

const columns = database.prepare("PRAGMA table_info(imports)").all();
if (!columns.some((column) => column.name === "content_hash")) {
  database.exec("ALTER TABLE imports ADD COLUMN content_hash TEXT");
}

const legacyImports = database.prepare(`
  SELECT id, stored_filename FROM imports WHERE content_hash IS NULL
`).all();
const updateHash = database.prepare("UPDATE imports SET content_hash = ? WHERE id = ?");

for (const importedFile of legacyImports) {
  const filePath = path.join(uploadsDirectory, importedFile.stored_filename);
  if (fs.existsSync(filePath)) {
    const hash = createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
    updateHash.run(hash, importedFile.id);
  }
}

const duplicateHashes = database.prepare(`
  SELECT content_hash FROM imports
  WHERE content_hash IS NOT NULL
  GROUP BY content_hash HAVING COUNT(*) > 1
`).all();

for (const duplicate of duplicateHashes) {
  const duplicateImports = database.prepare(`
    SELECT id FROM imports WHERE content_hash = ? ORDER BY id ASC
  `).all(duplicate.content_hash);
  const duplicateIds = duplicateImports.slice(1).map((record) => record.id);
  if (duplicateIds.length) {
    database.prepare(`DELETE FROM imports WHERE id IN (${duplicateIds.map(() => "?").join(", ")})`).run(...duplicateIds);
  }
}

database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_imports_content_hash ON imports(content_hash)");

export default database;
