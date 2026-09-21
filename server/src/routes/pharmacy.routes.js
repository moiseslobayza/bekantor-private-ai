import path from "path";
import { Router } from "express";
import multer from "multer";
import { uploadsDirectory } from "../data/database.js";
import { importCsv, importStatus } from "../controllers/pharmacy.controller.js";

const storage = multer.diskStorage({
  destination: uploadsDirectory,
  filename: (req, file, callback) => callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase() || ".csv"}`),
});
const upload = multer({
  storage, limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const isCsv = path.extname(file.originalname).toLowerCase() === ".csv";
    callback(isCsv ? null : new Error("Solo se permiten archivos CSV."), isCsv);
  },
});
const router = Router();
router.post("/import", upload.single("file"), importCsv);
router.get("/imports", importStatus);
export default router;
