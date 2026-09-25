import { getDashboard } from "./pharmacy-analytics.service.js";

function normalize(question) {
  return question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function resolvePharmacyIntent(question) {
  const text = normalize(question).replace(/[¿?¡!.,]/g, "").replace(/\s+/g, " ").trim();
  const base = text.replace(/ en los ultimos 30 dias$/, "");
  if (/^(cuanto vendimos|cuanto hemos vendido|ventas totales)$/.test(base)) return "salesTotal";
  if (/^(cuantas unidades (vendimos|hemos vendido)|unidades vendidas)$/.test(base)) return "unitsSold";
  if (/^(cuales (son|fueron) los productos mas vendidos|productos mas vendidos|top productos)$/.test(base)) return "topProducts";
  if (/^(cual (es|fue) el producto mas vendido)$/.test(base)) return "bestProduct";
  if (/^(que productos tienen (stock bajo|poco stock|bajo stock)|productos con stock bajo|stock bajo)$/.test(text)) return "lowStock";
  if (/^(que productos tienen (baja|poca) rotacion|productos con baja rotacion|baja rotacion)$/.test(base)) return "lowRotation";
  // Períodos, filtros, comparaciones y métricas no implementados no van al LLM.
  if (/vend|venta|stock|rotaci|factur|importe|monto|ingreso|recaud|producto|unidades|farmacia|datos|ganancia|margen|rentab|ticket|categoria|sucursal|ayer|hoy|semana|mes|ano|compar|pronostic|predic|cuant|promedio|balance|beneficio|costo|precio|total|valor|compr|perdida|porcentaje|proveedor|inventario|demanda|\by\b/.test(text)) return "unsupported";
  return null;
}

function format(value) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
}

export function getPharmacyAnswer(intent, dashboard = getDashboard()) {
  if (!dashboard.period.to) return "Todavía no hay datos de farmacia importados para responder esa consulta.";
  const period = `Del ${dashboard.period.from} al ${dashboard.period.to}`;
  switch (intent) {
    case "salesTotal": return `${period}, las ventas totales fueron ${format(dashboard.salesTotal)}.`;
    case "unitsSold": return `${period}, se vendieron ${format(dashboard.unitsSold)} unidades.`;
    case "bestProduct": {
      const first = dashboard.topProducts[0];
      return first ? `${period}, el producto más vendido fue ${first.productName} (${format(first.unitsSold)} unidades).` : `${period}, no hay ventas registradas.`;
    }
    case "topProducts": return dashboard.topProducts.length
      ? `${period}, los productos más vendidos por unidades fueron: ${dashboard.topProducts.map((item) => `${item.productName} (${format(item.unitsSold)})`).join(", ")}.`
      : `${period}, no hay ventas registradas.`;
    case "lowStock": return dashboard.lowStockProducts.length
      ? `Con umbral de ${format(dashboard.lowStockThreshold)} unidades, hay ${format(dashboard.lowStockCount)} productos con stock bajo: ${dashboard.lowStockProducts.map((item) => `${item.productName} (${format(item.currentStock)})`).join(", ")}.`
      : `No hay productos con stock bajo (umbral: ${format(dashboard.lowStockThreshold)} unidades).`;
    case "lowRotation": return dashboard.lowRotationProducts.length
      ? `${period}, los productos con baja rotación (hasta ${format(dashboard.lowRotationMaxUnits)} unidades vendidas) son: ${dashboard.lowRotationProducts.map((item) => `${item.productName} (${format(item.unitsSold)})`).join(", ")}.`
      : `${period}, no hay productos con baja rotación.`;
    default: return null;
  }
}

export async function answerPharmacyQuestion(question, generate, dashboard) {
  const intent = resolvePharmacyIntent(question);
  if (!intent) return null;
  if (intent === "unsupported") return { intent, response: "Esa consulta no está soportada en Alpha 1. Puedo informar ventas, unidades, top productos y baja rotación de los últimos treinta días de los datos, o el último stock bajo registrado, sin filtros adicionales." };
  const answer = getPharmacyAnswer(intent, dashboard ?? getDashboard());
  try {
    const draft = await generate([
      { role: "user", content: `Consulta operativa: ${question}\nRespuesta autorizada de SQLite: ${answer}\nReproducí exactamente la respuesta autorizada, sin agregar ni cambiar datos.` },
    ]);
    // La salida libre del modelo jamás reemplaza cifras o hechos comprobados.
    return { intent, response: draft?.trim() === answer ? draft.trim() : answer };
  } catch {
    return { intent, response: answer };
  }
}
