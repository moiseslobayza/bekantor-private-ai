const columnAliases = {
  sku: ["sku", "codigo", "código", "codigo_producto", "código_producto"],
  productName: ["producto", "nombre_producto", "nombre", "product_name"],
  category: ["categoria", "categoría", "rubro", "category"],
  saleDate: ["fecha", "fecha_venta", "sale_date", "date"],
  unitsSold: ["unidades_vendidas", "unidades", "cantidad", "units_sold"],
  salesAmount: ["importe_venta", "importe", "venta", "monto", "sales_amount"],
  currentStock: ["stock_actual", "stock", "existencia", "current_stock"],
};
const requiredFields = ["sku", "productName", "saleDate", "unitsSold", "salesAmount", "currentStock"];

function normalizeHeader(value) { return value.trim().toLowerCase().replace(/^\uFEFF/, ""); }

function parseCsv(text) {
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(value.trim()); value = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim()); if (row.some((cell) => cell !== "")) rows.push(row); row = []; value = "";
    } else value += character;
  }
  if (quoted) throw new Error("El CSV contiene comillas sin cerrar.");
  row.push(value.trim()); if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function getColumnMap(headers) {
  const normalizedHeaders = headers.map(normalizeHeader); const mapping = {};
  for (const [field, aliases] of Object.entries(columnAliases)) {
    const index = normalizedHeaders.findIndex((header) => aliases.includes(header));
    if (index !== -1) mapping[field] = index;
  }
  const missing = requiredFields.filter((field) => mapping[field] === undefined);
  if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}. Usá el CSV de ejemplo como referencia.`);
  return mapping;
}

function parseNumber(value, field, rowNumber) {
  const normalized = value.replace(/\./g, "").replace(",", "."); const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) throw new Error(`Fila ${rowNumber}: ${field} debe ser un número igual o mayor a cero.`);
  return number;
}

export function parsePharmacyCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("El CSV debe incluir encabezados y al menos una fila de datos.");
  const mapping = getColumnMap(rows[0]);
  return rows.slice(1).map((row, index) => {
    const rowNumber = index + 2; const read = (field) => row[mapping[field]]?.trim() ?? "";
    const sku = read("sku"); const productName = read("productName"); const saleDate = read("saleDate");
    if (!sku || !productName || !saleDate) throw new Error(`Fila ${rowNumber}: SKU, producto y fecha son obligatorios.`);
    return {
      sku, productName, saleDate,
      category: mapping.category === undefined ? "Sin categoría" : read("category") || "Sin categoría",
      unitsSold: parseNumber(read("unitsSold"), "unidades vendidas", rowNumber),
      salesAmount: parseNumber(read("salesAmount"), "importe de venta", rowNumber),
      currentStock: parseNumber(read("currentStock"), "stock actual", rowNumber),
    };
  });
}
