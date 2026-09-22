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
const importForm = document.getElementById("import-form");
const csvFile = document.getElementById("csv-file");
const importStatus = document.getElementById("import-status");

async function refreshImportStatus() {
  try {
    const response = await fetch("/api/farmacia/imports");
    const data = await response.json();
    importStatus.textContent = data.recordCount ? `${data.recordCount} registros importados en ${data.importCount} archivo(s).` : "Aún no hay datos importados.";
  } catch (error) { importStatus.textContent = "No se pudo consultar el estado de los datos."; }
}

importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!csvFile.files.length) return;
  const formData = new FormData(); formData.append("file", csvFile.files[0]);
  importStatus.textContent = "Importando archivo local...";
  try {
    const response = await fetch("/api/farmacia/import", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo importar el CSV.");
    importStatus.textContent = `${data.recordCount} registros importados correctamente.`;
    importForm.reset(); await refreshImportStatus();
  } catch (error) { importStatus.textContent = error.message; }
});

refreshImportStatus();

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
