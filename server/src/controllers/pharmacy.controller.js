import fs from "fs/promises";
import { createHash } from "node:crypto";
import { parsePharmacyCsv } from "../services/csv-import.service.js";
import { DuplicateImportError, getImportSummary, saveImport } from "../data/pharmacy.repository.js";

export async function importCsv(req, res) {
  if (!req.file) return res.status(400).json({ error: "Seleccioná un archivo CSV." });
  try {
    const content = await fs.readFile(req.file.path);
    const records = parsePharmacyCsv(content.toString("utf8"));
    const contentHash = createHash("sha256").update(content).digest("hex");
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
    return res.status(400).json({ error: error.message || "No se pudo importar el CSV." });
  }
}

export function importStatus(req, res) { res.json(getImportSummary()); }
