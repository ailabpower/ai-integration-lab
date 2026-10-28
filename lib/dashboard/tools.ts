import { tool } from "ai";
import { z } from "zod";
import type { ChartSpec } from "@/components/dashboard/charts";
import * as q from "./queries";

// The AI analyst can only call these functions. Each one runs a fixed, parameterized,
// read-only report in Postgres; the model never writes SQL and can't modify data.

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
const period = { from: date.describe("Start date, inclusive (YYYY-MM-DD)"), to: date.describe("End date, inclusive (YYYY-MM-DD)") };

export type ToolOutput = { rows: unknown; chart: ChartSpec | null };

export const dashboardTools = {
  revenueOverTime: tool({
    description: "Revenue and number of completed orders per day, week or month. Use for trends, drops and spikes. Optionally filter to one category.",
    inputSchema: z.object({
      ...period,
      granularity: z.enum(["day", "week", "month"]),
      category: z.enum(["Electronics", "Home & Kitchen", "Fashion", "Beauty", "Sports & Outdoors", "Books"]).optional(),
    }),
    execute: async ({ from, to, granularity, category }): Promise<ToolOutput> => {
      const rows = await q.revenueOverTime(from, to, granularity, category);
      return { rows, chart: { type: "line", data: rows, x: "period", y: "revenue", format: "money" } };
    },
  }),
  topProducts: tool({
    description: "Best-selling products in a period, by revenue or by units sold.",
    inputSchema: z.object({ ...period, metric: z.enum(["revenue", "units"]), limit: z.number().int().min(1).max(20) }),
    execute: async ({ from, to, metric, limit }): Promise<ToolOutput> => {
      const rows = await q.topProducts(from, to, metric, limit);
      return { rows, chart: { type: "bar", data: rows, x: "product", y: metric, format: metric === "revenue" ? "money" : "number", horizontal: true } };
    },
  }),
  salesByCategory: tool({
    description: "Revenue, orders and revenue share per product category in a period.",
    inputSchema: z.object(period),
    execute: async ({ from, to }): Promise<ToolOutput> => {
      const rows = await q.salesByCategory(from, to);
      return { rows, chart: { type: "bar", data: rows, x: "category", y: "revenue", format: "money", horizontal: true } };
    },
  }),
  kpis: tool({
    description: "Headline numbers for a period: revenue, completed orders, average order value, new customer sign-ups, return rate. Call it twice to compare two periods.",
    inputSchema: z.object(period),
    execute: async ({ from, to }): Promise<ToolOutput> => ({ rows: await q.kpis(from, to), chart: null }),
  }),
  customerStats: tool({
    description: "Customers who bought in a period: total, new (signed up in the period) vs returning, and average orders per customer.",
    inputSchema: z.object(period),
    execute: async ({ from, to }): Promise<ToolOutput> => ({ rows: await q.customerStats(from, to), chart: null }),
  }),
  returnsRate: tool({
    description: "Share of orders that were returned, grouped by category or by product (only groups with 10+ orders), highest first.",
    inputSchema: z.object({ ...period, groupBy: z.enum(["category", "product"]) }),
    execute: async ({ from, to, groupBy }): Promise<ToolOutput> => {
      const rows = await q.returnsRate(from, to, groupBy);
      return { rows, chart: { type: "bar", data: rows.slice(0, 10), x: "name", y: "return_rate", format: "percent", horizontal: true } };
    },
  }),
};

export function analystSystemPrompt(today: string): string {
  return `You are a data analyst embedded in the admin dashboard of "Northwind Goods", an online store.
Today is ${today}. The data covers the last 12 months up to today.

Answer the manager's question using the tools. Rules:
- Always get numbers from the tools; never estimate or invent them.
- Resolve relative dates ("last quarter", "in August", "last week") into explicit dates before calling tools. Weeks start on Monday.
- To explain a drop or spike, compare the period with the one before it and break it down by category, then by product if useful.
- If the question can't be answered with the available tools (for example marketing spend, website traffic, profit margins), say so plainly and suggest what you can answer instead.
- Reply in 2-5 short sentences or a few bullets, lead with the answer, and include the key numbers with units (USD, %, orders). A chart of the last tool result is shown under your answer automatically, so don't describe it at length.`;
}
