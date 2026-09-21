import { generateResponse } from "../services/inference.service.js";

export async function chat(req, res) {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "El campo message es obligatorio",
      });
    }

    const response = await generateResponse(message);

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