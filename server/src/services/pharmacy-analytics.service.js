import { getDashboardMetrics, getLatestSaleDate, readSnapshot } from "../data/pharmacy.repository.js";

const DEFAULT_LOW_STOCK_THRESHOLD = 10;
const LOW_ROTATION_MAX_UNITS = 5;

function getLowStockThreshold() {
  if (!process.env.LOW_STOCK_THRESHOLD?.trim()) return DEFAULT_LOW_STOCK_THRESHOLD;
  const value = Number(process.env.LOW_STOCK_THRESHOLD);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_LOW_STOCK_THRESHOLD;
}

function getPeriodStart(referenceDate) {
  const date = new Date(`${referenceDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 29);
  return date.toISOString().slice(0, 10);
}

export function getDashboard() {
  return readSnapshot(buildDashboard);
}

function buildDashboard() {
  const to = getLatestSaleDate();
  const lowStockThreshold = getLowStockThreshold();

  if (!to) {
    return {
      period: { from: null, to: null },
      salesTotal: 0,
      unitsSold: 0,
      lowStockCount: 0,
      topProducts: [],
      lowStockProducts: [],
      lowRotationProducts: [],
      lowStockThreshold,
      lowRotationMaxUnits: LOW_ROTATION_MAX_UNITS,
    };
  }

  const from = getPeriodStart(to);
  const metrics = getDashboardMetrics({
    from,
    to,
    lowStockThreshold,
    lowRotationMaxUnits: LOW_ROTATION_MAX_UNITS,
  });

  return {
    period: { from, to },
    ...metrics,
    lowStockCount: metrics.lowStockProducts.length,
    lowStockThreshold,
    lowRotationMaxUnits: LOW_ROTATION_MAX_UNITS,
  };
}
