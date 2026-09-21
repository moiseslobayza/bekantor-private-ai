const SESSION_KEY = "bekantor_session_id";

let sessionId = localStorage.getItem(SESSION_KEY);

if (!sessionId) {
  sessionId =
    Date.now().toString() +
    "-" +
    Math.random().toString(36).substring(2);

  localStorage.setItem(SESSION_KEY, sessionId);
}

const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const chat = document.getElementById("chat");

function addMessage(text, type) {
  const message = document.createElement("div");

  message.classList.add("message", type);
  message.textContent = text;

  chat.appendChild(message);

  chat.scrollTop = chat.scrollHeight;

  return message;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = input.value.trim();

  if (!text) return;

  addMessage(text, "user");

  input.value = "";
  input.focus();

  const loading = addMessage(
    "BEKANTOR está procesando...",
    "assistant"
  );

  try {
    const response = await fetch("/api/chat", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        message: text,
        sessionId: sessionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();

    loading.textContent = data.response;

  } catch (error) {
    console.error(error);

    loading.textContent =
      "No se pudo conectar con BEKANTOR NODE.";
  }
});