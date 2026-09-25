const columnAliases = {
  sku: ["sku", "codigo", "cod_producto", "codigo_producto", "cod_articulo", "codigo_articulo"],
  productName: ["producto", "nombre", "descripcion", "nombre_producto", "descripcion_producto", "product_name"],
  category: ["categoria", "rubro", "familia", "category"],
  saleDate: ["fecha", "fecha_venta", "fecha_de_venta", "sale_date", "date"],
  unitsSold: ["unidades_vendidas", "unidades", "cantidad", "cantidad_vendida", "cant_vendida", "units_sold"],
  salesAmount: ["importe_venta", "importe", "venta", "total", "monto", "monto_venta", "sales_amount"],
  currentStock: ["stock_actual", "stock", "existencia", "existencias", "current_stock"],
};

const labels = {
  sku: "SKU/código", productName: "producto/nombre", saleDate: "fecha",
  unitsSold: "unidades/cantidad", salesAmount: "importe/total", currentStock: "stock/existencia",
};

function normalizeHeader(value) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function detectDelimiter(text) {
  let quoted = false;
  let commas = 0;
  let semicolons = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === "\n" || char === "\r") break;
      if (char === ",") commas += 1;
      if (char === ";") semicolons += 1;
    }
  }
  if (semicolons && commas) throw new Error("Separador ambiguo en encabezados: usá coma o punto y coma, sin mezclarlos.");
  return semicolons > commas ? ";" : ",";
}

function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  let afterQuote = false;
  let line = 1;
  let rowLine = 1;
  const finishRow = () => {
    row.push(value.trim());
    if (row.length > 1 || row.some((cell) => cell !== "")) rows.push({ cells: row, line: rowLine });
    row = []; value = ""; afterQuote = false; rowLine = line + 1;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else { value += char; if (char === "\n") line += 1; }
    } else if (char === '"' && value.trim() === "" && !afterQuote) { value = ""; quoted = true; }
    else if (char === delimiter) { row.push(value.trim()); value = ""; afterQuote = false; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      finishRow(); line += 1; rowLine = line;
    } else if (afterQuote && char.trim() !== "") throw new Error(`Fila ${line}: texto inesperado después de comillas.`);
    else if (char === '"') throw new Error(`Fila ${line}: comillas inválidas.`);
    else value += char;
  }
  if (quoted) throw new Error("El CSV contiene comillas sin cerrar.");
  if (row.length || value.trim()) finishRow();
  return rows;
}

function resolveColumns(headers) {
  const normalized = headers.map(normalizeHeader);
  if (normalized.some((header) => !header) || new Set(normalized).size !== normalized.length) {
    throw new Error("Hay encabezados vacíos o repetidos. Revisá las columnas del CSV.");
  }
  const mapping = {};
  for (const [field, aliases] of Object.entries(columnAliases)) {
    const matches = normalized.flatMap((header, index) => aliases.includes(header) ? [index] : []);
    if (matches.length > 1) throw new Error(`Hay varias columnas para ${field}. Conservá una sola.`);
    if (matches.length) mapping[field] = matches[0];
  }
  const missing = Object.keys(labels).filter((field) => mapping[field] === undefined);
  if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.map((field) => labels[field]).join(", ")}. Revisá los encabezados del CSV.`);
  return mapping;
}

function parseDate(value, line) {
  let year, month, day;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) [year, month, day] = value.split("-").map(Number);
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) [day, month, year] = value.split("/").map(Number);
  else throw new Error(`Fila ${line}: fecha inválida; usá YYYY-MM-DD o DD/MM/YYYY.`);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`Fila ${line}: fecha inexistente.`);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseNumber(value, label, line) {
  const raw = value.trim();
  // Una sola separación con tres cifras (1.234 / 1,234) es ambigua.
  // Se admite entero, decimal de 1–2 cifras o agrupación argentina explícita.
  if (!/^(?:\d+|\d+[.,]\d{1,2}|[1-9]\d{0,2}(?:\.\d{3})+,\d{1,2})$/.test(raw)) {
    throw new Error(`Fila ${line}: ${label} inválido o ambiguo. Usá 1234, 1234.50 o 1.234,50, sin espacios internos ni negativos.`);
  }
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number > Number.MAX_SAFE_INTEGER / 100) throw new Error(`Fila ${line}: ${label} es demasiado grande.`);
  return number;
}

export function inspectPharmacyCsv(text) {
  if (text.includes("\uFFFD") || text.includes("\0")) throw new Error("El CSV debe estar codificado en UTF-8 y no contener caracteres dañados.");
  const content = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(content);
  const rows = parseCsv(content, delimiter);
  if (rows.length < 2) throw new Error("El CSV debe incluir encabezados y al menos una fila de datos.");
  const headers = rows[0].cells;
  const mapping = resolveColumns(headers);
  const records = rows.slice(1).map(({ cells, line }) => {
    if (cells.length !== headers.length) throw new Error(`Fila ${line}: se esperaban ${headers.length} columnas y se encontraron ${cells.length}.`);
    const read = (field) => cells[mapping[field]]?.trim() ?? "";
    const sku = read("sku"); const productName = read("productName");
    if (!sku || !productName) throw new Error(`Fila ${line}: SKU y producto son obligatorios.`);
    return {
      sku, productName,
      category: mapping.category === undefined ? "Sin categoría" : read("category") || "Sin categoría",
      saleDate: parseDate(read("saleDate"), line),
      unitsSold: parseNumber(read("unitsSold"), "unidades vendidas", line),
      salesAmount: parseNumber(read("salesAmount"), "importe de venta", line),
      currentStock: parseNumber(read("currentStock"), "stock actual", line),
    };
  });
  return { delimiter, headers, mapping, records };
}

export function parsePharmacyCsv(text) { return inspectPharmacyCsv(text).records; }
