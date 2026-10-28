// Asks the dashboard analyst questions whose correct numbers are computed directly from the database,
// on both providers, and writes docs/eval-dashboard.md.
// Usage: npm run eval:dashboard [-- --provider anthropic|openai]
import "./load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Provider } from "../lib/ai";
import { runAnalyst } from "../lib/dashboard/analyst";
import * as q from "../lib/dashboard/queries";
import { costUsd } from "../lib/pricing";

type Case = { question: string; tool: string | null; expect: (answer: string) => boolean };

// Numbers in the answer, with "$84.8k", "1,234", "12.5%" all normalised.
function numbersIn(text: string): number[] {
  return [...text.matchAll(/\$?(-?\d[\d,]*(?:\.\d+)?)\s*(k|K|%)?/g)].map((m) => {
    const n = Number(m[1].replace(/,/g, ""));
    return m[2]?.toLowerCase() === "k" ? n * 1000 : n;
  });
}
const mentions = (answer: string, value: number, tolerance = 0.01) =>
  numbersIn(answer).some((n) => Math.abs(n - value) <= Math.max(Math.abs(value) * tolerance, 0.5));
const says = (answer: string, text: string) => answer.toLowerCase().includes(text.toLowerCase());

async function buildCases(today: Date): Promise<Case[]> {
  const y = today.getUTCFullYear();
  const q2 = await q.kpis(`${y}-04-01`, `${y}-06-30`);
  const q3 = await q.kpis(`${y}-07-01`, `${y}-09-30`);
  const sept = await q.kpis(`${y}-09-01`, `${y}-09-30`);
  const topQ3 = (await q.topProducts(`${y}-07-01`, `${y}-09-30`, "revenue", 1))[0];
  const topUnits = (await q.topProducts(`${y}-07-01`, `${y}-09-30`, "units", 1))[0];
  const returns = (await q.returnsRate(`${y - 1}-11-01`, q.isoDay(today), "product"))[0];
  const cats = await q.salesByCategory(`${y}-07-01`, `${y}-09-30`);
  const customersSept = await q.customerStats(`${y}-09-01`, `${y}-09-30`);
  const dec = await q.kpis(`${y - 1}-12-01`, `${y - 1}-12-31`);

  return [
    { question: `What was total revenue in Q3 ${y}?`, tool: "kpis", expect: (a) => mentions(a, q3.revenue) },
    { question: `How many orders did we have in September ${y}?`, tool: "kpis", expect: (a) => mentions(a, sept.orders, 0) },
    { question: `What was the average order value in September ${y}?`, tool: "kpis", expect: (a) => mentions(a, sept.avg_order_value) },
    { question: `Compare Q3 ${y} revenue with Q2 ${y}.`, tool: "kpis", expect: (a) => mentions(a, q3.revenue) && mentions(a, q2.revenue) },
    { question: `Which product made the most revenue in Q3 ${y}?`, tool: "topProducts", expect: (a) => says(a, topQ3.product) },
    { question: `What was our best-selling product by units in Q3 ${y}?`, tool: "topProducts", expect: (a) => says(a, topUnits.product) },
    { question: "Which product has the highest return rate?", tool: "returnsRate", expect: (a) => says(a, returns.name) },
    { question: `Which category brought the most revenue in Q3 ${y}?`, tool: "salesByCategory", expect: (a) => says(a, cats[0].category) },
    { question: `Which category had the smallest share of revenue in Q3 ${y}?`, tool: "salesByCategory", expect: (a) => says(a, cats.at(-1)!.category) },
    { question: `How many customers bought something in September ${y}?`, tool: "customerStats", expect: (a) => mentions(a, customersSept.buying_customers, 0) },
    { question: `What was revenue in December ${y - 1}?`, tool: "kpis", expect: (a) => mentions(a, dec.revenue) },
    { question: "Why did revenue drop in the week of August 24?", tool: "revenueOverTime", expect: (a) => says(a, "electronics") },
    { question: "How much did we spend on Facebook ads last month?", tool: null, expect: (a) => /can't|cannot|not available|don't have|no data|unable/i.test(a) },
    { question: "What is our profit margin on Beauty products?", tool: null, expect: (a) => /can't|cannot|not available|don't have|no data|unable|margin/i.test(a) && !/\d+(\.\d+)?%\s*(profit\s*)?margin/i.test(a) },
    { question: "How many visitors did the website have yesterday?", tool: null, expect: (a) => /can't|cannot|not available|don't have|no data|unable/i.test(a) },
  ];
}

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] ?? 0;

async function main() {
  const today = new Date();
  const cases = await buildCases(today);
  const only = process.argv.includes("--provider") ? [process.argv[process.argv.indexOf("--provider") + 1] as Provider] : null;
  const lines: string[] = [];
  const table: string[] = [];

  for (const provider of only ?? (["anthropic", "openai"] as Provider[])) {
    let correct = 0, rightTool = 0, cost = 0, modelId = "";
    const lat: number[] = [];
    for (const c of cases) {
      const started = performance.now();
      const r = await runAnalyst(c.question, provider, today);
      lat.push(performance.now() - started);
      modelId = r.modelId;
      cost += costUsd(r.modelId, r.inputTokens, r.outputTokens);
      const ok = c.expect(r.answer);
      const toolOk = c.tool === null ? r.toolsUsed.length === 0 || ok : r.toolsUsed.includes(c.tool);
      correct += ok ? 1 : 0;
      rightTool += toolOk ? 1 : 0;
      if (!ok) lines.push(`- ${modelId}: "${c.question}" → ${r.answer.replace(/\s+/g, " ").slice(0, 200)}`);
      process.stdout.write(ok ? "✓" : "✗");
    }
    console.log();
    const f = (n: number) => `${Math.round((n / cases.length) * 100)}%`;
    table.push(`| ${modelId} | ${f(correct)} | ${f(rightTool)} | ${(pct(lat, 0.5) / 1000).toFixed(1)}s | ${(pct(lat, 0.95) / 1000).toFixed(1)}s | $${(cost / cases.length).toFixed(5)} |`);
  }

  const report = [
    `## Dashboard analyst eval (${q.isoDay(today)})`,
    "",
    `${cases.length} questions: ${cases.filter((c) => c.tool).length} with an exact answer computed from the database, ${cases.filter((c) => !c.tool).length} that the data can't answer (the analyst must say so).`,
    "",
    "| Model | Correct answers | Right report used | p50 latency | p95 latency | Avg cost / question |",
    "|---|---|---|---|---|---|",
    ...table,
    "",
    "Failures:",
    ...(lines.length ? lines : ["- none"]),
  ].join("\n");
  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/eval-dashboard.md", `${report}\n`);
  console.log(`\n${report}\n\nSaved to docs/eval-dashboard.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
