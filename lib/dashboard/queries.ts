import { db } from "../supabase";

// Typed wrappers around the read-only report functions in 0002_dashboard.sql.
// The dashboard pages and the AI analyst both go through these, nothing else touches the tables.

export type Kpis = { revenue: number; orders: number; avg_order_value: number; new_customers: number; return_rate: number };
export type RevenuePoint = { period: string; revenue: number; orders: number };
export type TopProduct = { product: string; category: string; revenue: number; units: number };
export type CategorySales = { category: string; revenue: number; orders: number; share: number };
export type CustomerStats = { buying_customers: number; new_customers: number; returning_customers: number; avg_orders_per_customer: number };
export type ReturnsRow = { name: string; orders: number; returned: number; return_rate: number };

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  // Postgres numerics arrive as strings; the UI and the model want numbers.
  return (data as Record<string, unknown>[]).map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && k !== "period" ? Number(v) : v])),
  ) as T[];
}

export const kpis = async (from: string, to: string) => (await rpc<Kpis>("dash_kpis", { p_from: from, p_to: to }))[0];
export const revenueOverTime = (from: string, to: string, granularity: "day" | "week" | "month" = "week", category?: string) =>
  rpc<RevenuePoint>("dash_revenue_over_time", { p_from: from, p_to: to, p_granularity: granularity, p_category: category ?? null });
export const topProducts = (from: string, to: string, metric: "revenue" | "units" = "revenue", limit = 10) =>
  rpc<TopProduct>("dash_top_products", { p_from: from, p_to: to, p_metric: metric, p_limit: limit });
export const salesByCategory = (from: string, to: string) => rpc<CategorySales>("dash_sales_by_category", { p_from: from, p_to: to });
export const customerStats = async (from: string, to: string) => (await rpc<CustomerStats>("dash_customer_stats", { p_from: from, p_to: to }))[0];
export const returnsRate = (from: string, to: string, groupBy: "category" | "product" = "category") =>
  rpc<ReturnsRow>("dash_returns_rate", { p_from: from, p_to: to, p_group_by: groupBy });

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export function lastNDays(n: number, today = new Date()) {
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const from = new Date(to.getTime() - (n - 1) * 86_400_000);
  const prevTo = new Date(from.getTime() - 86_400_000);
  const prevFrom = new Date(prevTo.getTime() - (n - 1) * 86_400_000);
  return { from: isoDay(from), to: isoDay(to), prevFrom: isoDay(prevFrom), prevTo: isoDay(prevTo) };
}

// First full week/month on or after `from`, so charts don't start with a half-empty bucket.
export function alignStart(from: string, granularity: "day" | "week" | "month"): string {
  const d = new Date(`${from}T00:00:00Z`);
  if (granularity === "week") {
    const shift = (8 - d.getUTCDay()) % 7; // days until Monday
    d.setUTCDate(d.getUTCDate() + shift);
  } else if (granularity === "month" && d.getUTCDate() !== 1) {
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
  }
  return isoDay(d);
}
