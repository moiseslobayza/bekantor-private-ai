const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://127.0.0.1:11434";

const MODEL =
  process.env.OLLAMA_MODEL || "qwen3:0.6b";

export async function generateResponse(message) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      model: MODEL,

      messages: [
        {
          role: "user",
          content: message,
        },
      ],

      stream: false,
      think: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();

  return data.message.content;
}