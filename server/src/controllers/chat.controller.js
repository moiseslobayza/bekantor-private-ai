import { generateResponse } from "../services/inference.service.js";

import {
  getConversation,
  addMessage,
} from "../services/conversation.service.js";

export async function chat(req, res) {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "El campo message es obligatorio",
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        error: "El campo sessionId es obligatorio",
      });
    }

    addMessage(
      sessionId,
      "user",
      message
    );

    const conversation =
      getConversation(sessionId);

    const response =
      await generateResponse(conversation);

    addMessage(
      sessionId,
      "assistant",
      response
    );

    res.json({
      response,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Error al generar la respuesta",
    });
  }
}