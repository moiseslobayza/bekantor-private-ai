import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import chatRouter from "./routes/chat.routes.js";
import pharmacyRouter from "./routes/pharmacy.routes.js";

dotenv.config();

const app = express();

app.use(cors());
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
  if (error) return res.status(400).json({ error: error.message || "Error al cargar el archivo." });
  return next();
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("BEKANTOR NODE #0000");
  console.log(`API activa en puerto ${PORT}`);
  console.log(`Interfaz: http://localhost:${PORT}`);
});
