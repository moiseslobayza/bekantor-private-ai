import "../config/env.js";

import { nodeConfig } from "../config/node.config.js";
import { modelName as MODEL, ollamaUrl as OLLAMA_URL, markInferenceError } from "./ollama-status.service.js";

function cleanOutput(text = "") {
  // Defensa adicional por si el modelo devuelve etiquetas de pensamiento.
  if (text.includes("</think>")) {
    return text.split("</think>").pop().trim();
  }

  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
}

export async function generateResponse(messages) {
  try {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20000),

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      model: MODEL,

      messages: [
        {
          role: "system",
          content: `${nodeConfig.systemPrompt}

 /no_think`,
        },

        ...messages,
      ],

      stream: false,
      think: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();

    throw new Error(
      `Ollama error ${response.status}: ${error}`
    );
  }

  const data = await response.json();

  if (data.error || typeof data.message?.content !== "string") throw new Error("Respuesta de Ollama inválida");
  const answer = cleanOutput(data.message.content);
  if (!answer) throw new Error("Respuesta de Ollama vacía");
  return answer;
  } catch (error) { markInferenceError(); throw error; }
}
