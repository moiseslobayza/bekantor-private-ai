import "dotenv/config";

import { nodeConfig } from "../config/node.config.js";

const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://127.0.0.1:11434";

const MODEL =
  process.env.OLLAMA_MODEL || "qwen3:0.6b";

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
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",

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

  return cleanOutput(data.message?.content);
}