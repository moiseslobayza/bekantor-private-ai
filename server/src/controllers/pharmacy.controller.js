import fs from "fs/promises";
import { createHash } from "node:crypto";
import { inspectPharmacyCsv, parsePharmacyCsv } from "../services/csv-import.service.js";
import { DuplicateImportError, getImportSummary, saveImport } from "../data/pharmacy.repository.js";
import { getDashboard } from "../services/pharmacy-analytics.service.js";

export async function importCsv(req, res) {
  if (!req.file) return res.status(400).json({ error: "Seleccioná un archivo CSV." });
  let phase = "read";
  try {
    const content = await fs.readFile(req.file.path);
    phase = "parse";
    const records = parsePharmacyCsv(content.toString("utf8"));
    const contentHash = createHash("sha256").update(content).digest("hex");
    phase = "save";
    const importId = saveImport({
      originalFilename: req.file.originalname,
      storedFilename: req.file.filename,
      contentHash,
      records,
    });
    return res.status(201).json({ message: "CSV importado correctamente.", importId, recordCount: records.length });
  } catch (error) {
    await fs.unlink(req.file.path).catch(() => {});
    if (error instanceof DuplicateImportError) {
      return res.status(409).json({ error: error.message });
    }
    if (phase === "parse") return res.status(400).json({ error: error.message || "El CSV no es válido." });
    console.error("No se pudo guardar la importación:", error);
    return res.status(500).json({ error: "No se pudo guardar el CSV en la base local." });
  }
}

export function importStatus(req, res) { res.json(getImportSummary()); }

export function dashboard(req, res) { res.json(getDashboard()); }

export async function previewCsv(req, res) {
  if (!req.file) return res.status(400).json({ error: "Seleccioná un archivo CSV." });
  try {
    const inspected = inspectPharmacyCsv(req.file.buffer.toString("utf8"));
    return res.json({
      rowCount: inspected.records.length,
      separator: inspected.delimiter,
      columns: Object.fromEntries(Object.entries(inspected.mapping).map(([field, index]) => [field, inspected.headers[index]])),
      rows: inspected.records.slice(0, 5),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "No se pudo leer el CSV." });
  }
}
