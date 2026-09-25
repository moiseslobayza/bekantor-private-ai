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
const importPreview = document.getElementById("import-preview");
let previewSequence = 0;
const dashboardPeriod = document.getElementById("dashboard-period");
const salesTotal = document.getElementById("sales-total");
const unitsSold = document.getElementById("units-sold");
const lowStockCount = document.getElementById("low-stock-count");
const dashboardStatus = document.getElementById("dashboard-status");
const refreshDashboardButton = document.getElementById("refresh-dashboard");
const statusNode = document.getElementById("status-node");
const statusModel = document.getElementById("status-model");
const statusData = document.getElementById("status-data");
const statusDetail = document.getElementById("status-detail");

async function refreshNodeStatus() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();
    statusNode.textContent = data.sqlite === "online" ? "Nodo: Online" : "Nodo: revisar base local";
    statusData.textContent = data.data?.loaded ? `Datos: cargados (${data.data.recordCount} ${data.data.recordCount === 1 ? "registro" : "registros"})` : "Datos: sin datos";
    const states = { ready: "Listo", loading: "Cargando", checking: "Comprobando", missing: "No instalado", unavailable: "No disponible" };
    statusModel.textContent = `Modelo: ${states[data.model?.state] || "No disponible"}`;
    statusDetail.textContent = data.model?.detail || (data.model?.state === "loading" ? "El modelo local se está preparando." : "");
  } catch {
    statusNode.textContent = "Nodo: no disponible";
    statusModel.textContent = "Modelo: no disponible";
    statusData.textContent = "Datos: sin conexión";
    statusDetail.textContent = "No se pudo conectar con BEKANTOR NODE.";
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
}

function renderList(containerId, products, renderRow, emptyMessage) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  if (!products.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }
  const list = document.createElement("ul");
  list.className = "product-list";
  products.forEach((product) => {
    const item = document.createElement("li");
    item.textContent = renderRow(product);
    list.appendChild(item);
  });
  container.appendChild(list);
}

async function refreshDashboard() {
  dashboardStatus.textContent = "Actualizando indicadores locales...";
  try {
    const response = await fetch("/api/farmacia/dashboard");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo cargar el dashboard.");

    salesTotal.textContent = formatNumber(data.salesTotal);
    unitsSold.textContent = formatNumber(data.unitsSold);
    lowStockCount.textContent = formatNumber(data.lowStockCount);
    dashboardPeriod.textContent = data.period.to
      ? `Período de ventas: ${data.period.from} a ${data.period.to} (últimos 30 días de los datos).`
      : "No hay datos importados para analizar.";
    dashboardStatus.textContent = data.period.to
      ? `Stock bajo: hasta ${formatNumber(data.lowStockThreshold)} unidades. Baja rotación: hasta ${data.lowRotationMaxUnits} unidades vendidas en el período.`
      : "Importá un CSV para ver indicadores.";
    renderList("top-products", data.topProducts, (product) => `${product.productName} — ${formatNumber(product.unitsSold)} unidades`, "Sin ventas en el período.");
    renderList("low-stock-products", data.lowStockProducts, (product) => `${product.productName} — stock: ${formatNumber(product.currentStock)}`, "No hay productos con stock bajo.");
    renderList("low-rotation-products", data.lowRotationProducts, (product) => `${product.productName} — ${formatNumber(product.unitsSold)} unidades`, "No hay productos con baja rotación.");
  } catch (error) {
    salesTotal.textContent = unitsSold.textContent = lowStockCount.textContent = "—";
    for (const id of ["top-products", "low-stock-products", "low-rotation-products"]) document.getElementById(id).replaceChildren();
    dashboardStatus.textContent = error.message;
  }
}

async function refreshImportStatus() {
  try {
    const response = await fetch("/api/farmacia/imports");
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudo consultar el estado de los datos.");
    importStatus.textContent = data.recordCount ? `${data.recordCount} ${data.recordCount === 1 ? "registro importado" : "registros importados"} en ${data.importCount} ${data.importCount === 1 ? "archivo" : "archivos"}.` : "Aún no hay datos importados.";
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
    importStatus.textContent = `${data.recordCount} ${data.recordCount === 1 ? "registro importado" : "registros importados"} correctamente.`;
    previewSequence += 1; importForm.reset(); importPreview.replaceChildren(); await refreshImportStatus();
    await refreshDashboard();
    await refreshNodeStatus();
  } catch (error) { importStatus.textContent = error.message; }
});

csvFile.addEventListener("change", async () => {
  const sequence = ++previewSequence;
  importPreview.replaceChildren();
  if (!csvFile.files.length) return;
  importPreview.textContent = "Validando y preparando vista previa...";
  const formData = new FormData();
  formData.append("file", csvFile.files[0]);
  try {
    const response = await fetch("/api/farmacia/preview", { method: "POST", body: formData });
    const data = await response.json();
    if (sequence !== previewSequence) return;
    if (!response.ok) throw new Error(data.error || "No se pudo leer el CSV.");
    importPreview.replaceChildren();
    const summary = document.createElement("p");
    summary.textContent = `${data.rowCount} filas válidas. Separador: ${data.separator === ";" ? "punto y coma" : "coma"}. Vista previa:`;
    importPreview.appendChild(summary);
    const list = document.createElement("ul");
    data.rows.forEach((row) => {
      const item = document.createElement("li");
      item.textContent = `${row.saleDate} · ${row.sku} · ${row.productName} · ${formatNumber(row.unitsSold)} unidades · ${formatNumber(row.salesAmount)}`;
      list.appendChild(item);
    });
    importPreview.appendChild(list);
  } catch (error) {
    if (sequence !== previewSequence) return;
    importPreview.textContent = error.message;
  }
});

refreshImportStatus();
refreshDashboard();
refreshNodeStatus();
setInterval(refreshNodeStatus, 10000);
refreshDashboardButton.addEventListener("click", refreshDashboard);

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

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo obtener la respuesta.");

    loading.textContent = data.response;

  } catch (error) {
    console.error(error);

    loading.textContent = error.message === "Failed to fetch"
      ? "No se pudo conectar con BEKANTOR NODE."
      : error.message;
  }
});
