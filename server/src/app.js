import express from "express";
import "./config/env.js";
import path from "path";
import { fileURLToPath } from "url";

import chatRouter from "./routes/chat.routes.js";
import pharmacyRouter from "./routes/pharmacy.routes.js";
import { getImportSummary } from "./data/pharmacy.repository.js";
import { ensureRecentModelCheck, modelName, warmModel } from "./services/ollama-status.service.js";


const app = express();

app.use((req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    if (origin && origin !== `${req.protocol}://${req.get("host")}`) return res.status(403).json({ error: "Abrí BEKANTOR desde la dirección del nodo para realizar esta operación." });
  }
  next();
});

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientPath = path.resolve(__dirname, "../../client");

app.use(express.static(clientPath));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    node: "BEKANTOR NODE #0000",
  });
});

app.use("/api/chat", chatRouter);
app.use("/api/farmacia", pharmacyRouter);

app.use((error, req, res, next) => {
  console.error("Solicitud fallida:", error);
  if (res.headersSent) return next(error);
  if (error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "El CSV supera el máximo de 10 MB." });
  if (error.name === "MulterError") return res.status(400).json({ error: "Enviá un único CSV en el campo file." });
  if (error.type === "entity.parse.failed") return res.status(400).json({ error: "El formato de la solicitud no es válido." });
  if (error.type === "entity.too.large") return res.status(413).json({ error: "La solicitud supera el tamaño permitido." });
  if (error.status === 400) return res.status(400).json({ error: "Solo se permiten archivos CSV válidos." });
  return res.status(500).json({ error: "No se pudo completar la operación en el nodo local." });
});

app.get("/api/status", (req, res) => {
  try {
    const model = ensureRecentModelCheck();
    const imports = getImportSummary();
    res.json({ api: "online", sqlite: "online", ollama: model.ollama,
      model: { name: modelName, state: model.model, available: model.modelAvailable, detail: model.detail },
      data: { loaded: imports.recordCount > 0, importCount: imports.importCount, recordCount: imports.recordCount } });
  } catch (error) {
    console.error("Estado de SQLite:", error);
    res.status(503).json({ api: "online", sqlite: "error", error: "No se pudo consultar la base local." });
  }
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("BEKANTOR NODE #0000");
  console.log(`API activa en puerto ${PORT}`);
  console.log(`Interfaz: http://localhost:${PORT}`);
  void warmModel();
});
server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? `El puerto ${PORT} ya está ocupado. BEKANTOR no inició otra instancia.` : "No se pudo iniciar BEKANTOR.");
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  server.close();
  server.closeAllConnections();
  process.exit(0);
});
