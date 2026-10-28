// Runs the docs assistant on eval/docs-chat.json with both providers and prints a markdown report.
// Usage: npm run eval:docs [-- --provider anthropic|openai]
// Costs a few cents. Does not write to ai_requests, so /metrics only shows real traffic.
import "./load-env";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { generateText, Output } from "ai";
import { z } from "zod";
import { chatModel, type Provider } from "../lib/ai";
import { buildContext, MIN_SIMILARITY, retrieve, SYSTEM_PROMPT } from "../lib/docs-chat/retrieval";
import { costUsd } from "../lib/pricing";

type Case = { q: string; pages: string[]; facts: string };
const cases = JSON.parse(readFileSync("eval/docs-chat.json", "utf8")) as Case[];
const only = process.argv.includes("--provider") ? [process.argv[process.argv.indexOf("--provider") + 1] as Provider] : null;
const providers: Provider[] = only ?? ["anthropic", "openai"];

const pageOf = (url: string) => url.replace("https://supabase.com/docs/guides/", "").split("#")[0];
const REFUSAL = /couldn't find this in the supabase docs/i;

async function judge(question: string, facts: string, answer: string): Promise<boolean> {
  // The judge is fixed (Claude) so both providers are graded the same way.
  const { model } = chatModel("anthropic");
  const { output } = await generateText({
    model,
    output: Output.object({ schema: z.object({ correct: z.boolean(), reason: z.string() }) }),
    prompt: `Grade a documentation assistant's answer.\n\nQuestion: ${question}\nKey facts a correct answer must agree with: ${facts}\n\nAnswer:\n${answer}\n\nIs the answer correct and consistent with the key facts? Missing minor details is fine; contradicting them or not answering is not.`,
  });
  return output.correct;
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};

async function run(provider: Provider) {
  const { modelId, model } = chatModel(provider);
  const rows: { q: string; hit: boolean | null; correct: boolean; latencyMs: number; cost: number }[] = [];
  for (const c of cases) {
    const started = performance.now();
    const { chunks, bestSimilarity, embeddingCostUsd } = await retrieve(c.q);
    const outOfScope = c.facts === "OUT_OF_SCOPE";
    let answer = "I couldn't find this in the Supabase docs.";
    let cost = embeddingCostUsd;
    if (bestSimilarity >= MIN_SIMILARITY) {
      const res = await generateText({
        model,
        system: `${SYSTEM_PROMPT}\n\n<sources>\n${buildContext(chunks)}\n</sources>`,
        prompt: c.q,
        maxOutputTokens: 1200,
      });
      answer = res.text;
      cost += costUsd(modelId, res.totalUsage.inputTokens, res.totalUsage.outputTokens);
    }
    const latencyMs = performance.now() - started;
    const hit = outOfScope ? null : chunks.some((ch) => c.pages.includes(pageOf(ch.url)));
    const correct = outOfScope ? REFUSAL.test(answer) : await judge(c.q, c.facts, answer);
    rows.push({ q: c.q, hit, correct, latencyMs, cost });
    process.stdout.write(correct ? "✓" : "✗");
  }
  console.log();

  const inScope = rows.filter((r) => r.hit !== null);
  const out = rows.filter((r) => r.hit === null);
  const lat = rows.map((r) => r.latencyMs);
  return {
    provider, modelId, rows,
    hitRate: inScope.filter((r) => r.hit).length / inScope.length,
    accuracy: inScope.filter((r) => r.correct).length / inScope.length,
    refusals: out.filter((r) => r.correct).length / out.length,
    p50: pct(lat, 0.5), p95: pct(lat, 0.95),
    avgCost: rows.reduce((a, r) => a + r.cost, 0) / rows.length,
  };
}

async function main() {
  const results = [];
  for (const p of providers) results.push(await run(p));

  const f = (x: number) => `${Math.round(x * 100)}%`;
  const lines = [
    `## Docs assistant eval (${new Date().toISOString().slice(0, 10)})`,
    "",
    `${cases.length} questions: ${cases.filter((c) => c.facts !== "OUT_OF_SCOPE").length} answerable from the docs, ${cases.filter((c) => c.facts === "OUT_OF_SCOPE").length} out of scope.`,
    "",
    "| Model | Retrieval hit rate | Answer accuracy | Correct refusals | p50 latency | p95 latency | Avg cost / question |",
    "|---|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.modelId} | ${f(r.hitRate)} | ${f(r.accuracy)} | ${f(r.refusals)} | ${(r.p50 / 1000).toFixed(1)}s | ${(r.p95 / 1000).toFixed(1)}s | $${r.avgCost.toFixed(5)} |`),
    "",
    "Failures:",
    ...results.flatMap((r) => r.rows.filter((x) => !x.correct || x.hit === false).map((x) => `- ${r.modelId}: ${x.q}${x.hit === false ? " (retrieval miss)" : ""}`)),
  ];
  const report = lines.join("\n");
  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/eval-docs-chat.md", `${report}\n`);
  console.log(`\n${report}\n\nSaved to docs/eval-docs-chat.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
