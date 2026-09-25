import "../config/env.js";

export function localOllamaUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) {
    throw new Error("OLLAMA_URL debe apuntar a Ollama local en este nodo.");
  }
  if (url.pathname !== "/" || url.search || url.hash) throw new Error("OLLAMA_URL no debe contener rutas ni parámetros.");
  return url.origin.replace("localhost", "127.0.0.1");
}

export const ollamaUrl = localOllamaUrl(process.env.OLLAMA_URL || "http://127.0.0.1:11434");
export const modelName = process.env.OLLAMA_MODEL || "qwen3:0.6b";

const state = { ollama: "checking", model: "checking", modelAvailable: false, detail: null };
let activeCheck = null;
let checkedAt = 0;

function update(next) {
  Object.assign(state, next);
  checkedAt = Date.now();
}

export function currentModelState() { return { ...state }; }
export function isModelReady() { return state.model === "ready"; }
export function markInferenceError() {
  update({ model: "unavailable", detail: "Falló la respuesta del modelo local. Se volverá a comprobar su estado." });
}

export function warmModel() {
  if (activeCheck) return activeCheck;
  const wasReady = state.model === "ready";
  if (!wasReady) update({ ollama: "checking", model: "checking", modelAvailable: false, detail: null });
  activeCheck = (async () => {
    let reachable = false;
    try {
      const tagsResponse = await fetch(`${ollamaUrl}/api/tags`, { redirect: "error", signal: AbortSignal.timeout(3000) });
      if (!tagsResponse.ok) throw new Error(`Ollama respondió HTTP ${tagsResponse.status}`);
      const tags = await tagsResponse.json();
      reachable = true;
      const available = Array.isArray(tags.models) && tags.models.some((entry) => entry.name === modelName || entry.model === modelName);
      if (!available) {
        update({ ollama: "online", model: "missing", modelAvailable: false, detail: "El modelo configurado no está instalado en Ollama." });
        return;
      }
      if (wasReady) {
        const residentResponse = await fetch(`${ollamaUrl}/api/ps`, { redirect: "error", signal: AbortSignal.timeout(3000) });
        if (!residentResponse.ok) throw new Error("No se pudo comprobar el modelo cargado");
        const resident = await residentResponse.json();
        if (resident.models?.some((entry) => entry.name === modelName || entry.model === modelName)) {
          update({ ollama: "online", model: "ready", modelAvailable: true, detail: null });
          return;
        }
      }
      update({ ollama: "online", model: "loading", modelAvailable: true, detail: null });
      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, prompt: "", stream: false, keep_alive: "10m" }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`No se pudo cargar el modelo: HTTP ${response.status}`);
      const loaded = await response.json();
      if (loaded.error || loaded.done !== true) throw new Error("Ollama no confirmó la carga del modelo");
      update({ ollama: "online", model: "ready", modelAvailable: true, detail: null });
    } catch (error) {
      console.error("Estado de Ollama:", error);
      update({
        ollama: reachable ? "online" : "offline",
        model: "unavailable",
        modelAvailable: state.modelAvailable,
        detail: reachable ? "No se pudo cargar el modelo local." : "Ollama no está disponible en este nodo.",
      });
    } finally { activeCheck = null; }
  })();
  return activeCheck;
}

export function ensureRecentModelCheck() {
  if (!activeCheck && Date.now() - checkedAt > 30000) void warmModel();
  return currentModelState();
}
