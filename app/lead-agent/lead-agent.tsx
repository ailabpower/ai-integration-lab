"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { LeadAgentEvent } from "@/app/api/lead-agent/route";
import type { RecentResponse } from "@/app/api/lead-agent/recent/route";
import { ProviderToggle } from "@/components/provider-toggle";
import type { Provider } from "@/lib/ai";
import { EXAMPLES } from "@/lib/lead-agent/examples";
import type { RunResult, StepEvent, StepName } from "@/lib/lead-agent/pipeline";

const STEPS: { id: StepName; label: string }[] = [
  { id: "extract", label: "Extract details" },
  { id: "qualify", label: "Score the lead" },
  { id: "dedupe", label: "Check for duplicates" },
  { id: "write", label: "Write to HubSpot" },
];
const BADGE: Record<string, string> = {
  hot: "bg-red-600 text-white", warm: "bg-amber-500 text-white", cold: "bg-sky-600 text-white", spam: "bg-zinc-500 text-white",
};

type Result = RunResult & { latencyMs: number; duplicate: boolean };

export function LeadAgent() {
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [source, setSource] = useState<"form" | "email">(EXAMPLES[0].source);
  const [text, setText] = useState(EXAMPLES[0].text);
  const [steps, setSteps] = useState<Partial<Record<StepName, StepEvent>>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [recent, setRecent] = useState<RecentResponse | null>(null);

  const loadRecent = useCallback(() => {
    fetch("/api/lead-agent/recent").then((r) => (r.ok ? r.json() : null)).then(setRecent).catch(() => {});
  }, []);
  useEffect(loadRecent, [loadRecent]);

  async function run() {
    setRunning(true);
    setSteps({});
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/lead-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, text, provider }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Something went wrong.");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const e = JSON.parse(line) as LeadAgentEvent;
          if (e.type === "step") setSteps((s) => ({ ...s, [e.step]: e }));
          else if (e.type === "result") setResult(e.result);
          else setError(e.message);
        }
      }
      loadRecent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function approve(runId: string) {
    const res = await fetch("/api/lead-agent/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId }) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not approve.");
    loadRecent();
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">← AI Integration Lab</Link>
          <h1 className="text-xl font-semibold">Lead intake agent → HubSpot</h1>
          <p className="text-xs text-[var(--muted)]">Demo with a sandbox HubSpot account. Please don&apos;t enter real personal data; records are deleted after 7 days.</p>
        </div>
        <ProviderToggle value={provider} onChange={setProvider} />
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => { setSource(ex.source); setText(ex.text); setSteps({}); setResult(null); setError(null); }}
                className={`rounded-full border px-3 py-1 text-xs ${text === ex.text ? "border-[var(--fg)]" : "border-[var(--border)] hover:border-[var(--fg)]"}`}
              >
                {ex.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-1 text-sm" role="radiogroup" aria-label="Input type">
            {(["form", "email"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={source === s} onClick={() => setSource(s)} className={`rounded-md px-3 py-1 ${source === s ? "bg-[var(--fg)] text-[var(--bg)]" : "text-[var(--muted)]"}`}>
                {s === "form" ? "Contact form" : "Pasted email"}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            rows={12}
            aria-label="Inbound message"
            className="mt-3 w-full rounded-lg border border-[var(--border)] bg-transparent p-3 font-mono text-sm outline-none focus:border-[var(--fg)]"
          />
          <button type="button" onClick={run} disabled={running || text.trim().length < 10} className="mt-3 w-full rounded-lg bg-[var(--fg)] py-2 text-[var(--bg)] disabled:opacity-40">
            {running ? "Processing…" : "Process lead"}
          </button>
        </section>

        <section className="rounded-xl border border-[var(--border)] p-4">
          <h2 className="text-sm font-medium">Agent steps</h2>
          <ol className="mt-3 space-y-3">
            {STEPS.map((s, i) => {
              const e = steps[s.id];
              const active = running && !e && STEPS.slice(0, i).every((p) => steps[p.id]);
              return (
                <li key={s.id} className="flex gap-3">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${e?.status === "done" ? "bg-[var(--accent)] text-white" : e ? "bg-[var(--surface)] text-[var(--muted)]" : "border border-[var(--border)]"}`}>
                    {e?.status === "done" ? "✓" : e ? "–" : active ? "…" : i + 1}
                  </span>
                  <div className="text-sm">
                    <p className="font-medium">{s.label}{e && <span className="ml-2 font-normal text-[var(--muted)]">{(e.ms / 1000).toFixed(1)}s</span>}</p>
                    {e && <p className="text-[var(--muted)]">{e.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          {result && (
            <div className="mt-5 space-y-3 border-t border-[var(--border)] pt-4 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${BADGE[result.qualification.category]}`}>{result.qualification.category}</span>
                <span className="font-medium">{result.qualification.score}/100</span>
                <span className="text-[var(--muted)]">→ {result.duplicate ? "already processed earlier (idempotent, nothing written twice)" : { created: "new HubSpot records", updated: "existing contact updated", review: "sent to human review", spam: "discarded as spam" }[result.decision]}</span>
              </p>
              <pre className="overflow-x-auto rounded-lg bg-[var(--surface)] p-3 text-xs">{JSON.stringify(result.lead, null, 2)}</pre>
              {!result.duplicate && <p className="text-xs text-[var(--muted)]">{(result.latencyMs / 1000).toFixed(1)}s end to end · ${result.costUsd.toFixed(5)} · {result.modelId}</p>}
            </div>
          )}
        </section>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-sm font-medium">Latest records in HubSpot</h2>
          <p className="text-xs text-[var(--muted)]">Read live from the HubSpot API.</p>
          <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
            {(recent?.contacts ?? []).map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p>{c.name}{c.company && <span className="text-[var(--muted)]"> · {c.company}</span>}</p>
                  <p className="text-xs text-[var(--muted)]">{c.email}{c.summary && ` · ${c.summary}`}</p>
                </div>
                {c.category && <span className={`shrink-0 rounded px-2 py-0.5 text-xs uppercase ${BADGE[c.category] ?? ""}`}>{c.category} {c.score}</span>}
              </li>
            ))}
            {recent && recent.contacts.length === 0 && <li className="py-2 text-[var(--muted)]">No records yet.</li>}
          </ul>
        </section>
        <section>
          <h2 className="text-sm font-medium">Human review queue</h2>
          <p className="text-xs text-[var(--muted)]">Leads the agent wasn&apos;t sure about wait here instead of going straight to the CRM.</p>
          <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
            {(recent?.review ?? []).map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p>{r.name ?? "(no name)"} <span className="text-xs text-[var(--muted)]">{r.email}</span></p>
                  <p className="text-xs text-[var(--muted)]">{r.need} · {r.reason}</p>
                </div>
                {r.canApprove ? (
                  <button type="button" onClick={() => approve(r.id)} className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--fg)]">Approve</button>
                ) : (
                  <span className="shrink-0 text-xs text-[var(--muted)]">needs email</span>
                )}
              </li>
            ))}
            {recent && recent.review.length === 0 && <li className="py-2 text-[var(--muted)]">Queue is empty.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
