import { generateResponse } from "../services/inference.service.js";
import { answerPharmacyQuestion } from "../services/pharmacy-chat.service.js";
import { currentModelState, isModelReady } from "../services/ollama-status.service.js";

import {
  getConversation,
  addMessage,
} from "../services/conversation.service.js";
const busySessions = new Set();

export async function chat(req, res) {
  let lockedSession;
  try {
    const { message, sessionId } = req.body || {};

    if (typeof message !== "string" || !message.trim() || message.length > 4000) {
      return res.status(400).json({
        error: "El campo message es obligatorio",
      });
    }

    if (typeof sessionId !== "string" || !sessionId.trim() || sessionId.length > 128) {
      return res.status(400).json({
        error: "El campo sessionId es obligatorio",
      });
    }

    if (busySessions.has(sessionId)) return res.status(409).json({ error: "Esperá la respuesta anterior antes de enviar otra consulta." });
    busySessions.add(sessionId);
    lockedSession = sessionId;
    const pharmacy = await answerPharmacyQuestion(message, isModelReady() ? generateResponse : async () => { throw new Error("Modelo no listo"); });
    // No mezclar cifras analíticas con memoria libre del modelo.
    let response = pharmacy?.response;
    if (!pharmacy) {
      if (!isModelReady()) throw new Error("Modelo local no preparado");
      const conversation = getConversation(sessionId);
      response = await generateResponse([...conversation, { role: "user", content: message }]);
      addMessage(sessionId, "user", message);
      addMessage(sessionId, "assistant", response);
    }

    res.json({
      response,
      ...(pharmacy ? { source: "farmacia" } : {}),
    });

  } catch (error) {
    console.error(error);
    const modelState = currentModelState();
    res.status(503).json({
      error: modelState.model === "loading" || modelState.model === "checking"
        ? "El modelo local está cargando. Intentá de nuevo en unos segundos."
        : "No se pudo obtener respuesta del modelo local. Revisá el estado del nodo.",
    });
  } finally { if (lockedSession) busySessions.delete(lockedSession); }
}
