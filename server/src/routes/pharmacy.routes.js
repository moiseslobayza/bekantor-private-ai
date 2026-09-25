import path from "path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { uploadsDirectory } from "../data/database.js";
import { dashboard, importCsv, importStatus, previewCsv } from "../controllers/pharmacy.controller.js";

const storage = multer.diskStorage({
  destination: uploadsDirectory,
  filename: (req, file, callback) => callback(null, `${randomUUID()}.csv`),
});
const upload = multer({
  storage, limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const isCsv = path.extname(file.originalname).toLowerCase() === ".csv";
    callback(isCsv ? null : Object.assign(new Error("Solo se permiten archivos CSV."), { status: 400 }), isCsv);
  },
});
const router = Router();
router.post("/import", upload.single("file"), importCsv);
router.post("/preview", multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } }).single("file"), previewCsv);
router.get("/imports", importStatus);
router.get("/dashboard", dashboard);
export default router;
