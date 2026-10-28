// Runs the lead agent on eval/lead-agent.json against an in-memory CRM (HubSpot is never touched)
// on both providers, and writes docs/eval-lead-agent.md.
// Usage: npm run eval:leads [-- --provider anthropic|openai]
import "./load-env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Provider } from "../lib/ai";
import { processLead } from "../lib/lead-agent/pipeline";
import { fakeCrm } from "./fake-crm";

type Case = { source: "form" | "email"; text: string; expect: { email: string | null; company: string | null; category: string[] } };
const cases = JSON.parse(readFileSync("eval/lead-agent.json", "utf8")) as Case[];
const only = process.argv.includes("--provider") ? [process.argv[process.argv.indexOf("--provider") + 1] as Provider] : null;
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9@.]/g, "");
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] ?? 0;

async function main() {
  const table: string[] = [];
  const failures: string[] = [];
  for (const provider of only ?? (["anthropic", "openai"] as Provider[])) {
    let emailOk = 0, companyOk = 0, catOk = 0, spamKept = 0, cost = 0, modelId = "";
    const lat: number[] = [];
    for (const c of cases) {
      const crm = fakeCrm();
      const t = performance.now();
      const r = await processLead({ source: c.source, text: c.text, provider, crm, onStep: () => {} });
      lat.push(performance.now() - t);
      cost += r.costUsd;
      modelId = r.modelId;
      // Spam must never be written, whatever the extraction says.
      const emailMatch = c.expect.category.includes("spam") ? true : norm(r.lead.email) === norm(c.expect.email);
      const companyMatch = c.expect.company === null || norm(r.lead.company).includes(norm(c.expect.company)) || norm(c.expect.company).includes(norm(r.lead.company));
      const catMatch = c.expect.category.includes(r.qualification.category);
      if (c.expect.category.includes("spam") && crm.contacts.size > 0) spamKept++;
      emailOk += emailMatch ? 1 : 0;
      companyOk += companyMatch ? 1 : 0;
      catOk += catMatch ? 1 : 0;
      if (!emailMatch || !companyMatch || !catMatch) failures.push(`- ${modelId}: "${c.text.slice(0, 60).replace(/\s+/g, " ")}…" → ${r.lead.email ?? "no email"}, ${r.lead.company ?? "no company"}, ${r.qualification.category} (expected ${c.expect.category.join("/")})`);
      process.stdout.write(emailMatch && companyMatch && catMatch ? "✓" : "✗");
    }
    console.log();
    const f = (n: number) => `${Math.round((n / cases.length) * 100)}%`;
    table.push(`| ${modelId} | ${f(emailOk)} | ${f(companyOk)} | ${f(catOk)} | ${spamKept} | ${(pct(lat, 0.5) / 1000).toFixed(1)}s | ${(pct(lat, 0.95) / 1000).toFixed(1)}s | $${(cost / cases.length).toFixed(5)} |`);
  }
  const report = [
    `## Lead agent eval (${new Date().toISOString().slice(0, 10)})`,
    "",
    `${cases.length} inbound messages (forms and emails in English and Romanian, including spam and a prompt-injection attempt), run against an in-memory CRM.`,
    "",
    "| Model | Email extracted | Company extracted | Category correct | Spam written to CRM | p50 end-to-end | p95 | Avg cost / lead |",
    "|---|---|---|---|---|---|---|---|",
    ...table,
    "",
    "Failures:",
    ...(failures.length ? failures : ["- none"]),
  ].join("\n");
  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/eval-lead-agent.md", `${report}\n`);
  console.log(`\n${report}\n\nSaved to docs/eval-lead-agent.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
