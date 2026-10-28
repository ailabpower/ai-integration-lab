"use client";

import { useState } from "react";
import type { AskResponse } from "@/app/api/dashboard/ask/route";
import { Markdown } from "@/components/markdown";
import { ProviderToggle } from "@/components/provider-toggle";
import type { Provider } from "@/lib/ai";
import { Chart } from "./charts";

const SUGGESTIONS = [
  "Why did revenue drop in the week of August 24?",
  "Top 5 products last quarter by revenue",
  "Compare Q3 with Q2",
  "Which product has the highest return rate?",
  "How many new customers bought something in October?",
];

export function AskPanel() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setQuestion(q);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/dashboard/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, provider }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setResult(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-md bg-[var(--accent)] px-3 py-1 text-sm text-white">
        ✦ Ask your data
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(false)}>
          <aside
            role="dialog"
            aria-label="Ask your data"
            className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-[var(--bg)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">✦ Ask your data</h2>
              <div className="flex items-center gap-2">
                <ProviderToggle value={provider} onChange={setProvider} />
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="px-2 text-xl text-[var(--muted)] hover:text-[var(--fg)]">×</button>
              </div>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">The analyst can only run the dashboard&apos;s read-only reports. It can&apos;t see or change anything else.</p>

            <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={500}
                placeholder="e.g. Which category grew the most this quarter?"
                aria-label="Your question"
                className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--fg)]"
              />
              <button type="submit" disabled={loading || !question.trim()} className="rounded-lg bg-[var(--fg)] px-4 py-2 text-sm text-[var(--bg)] disabled:opacity-40">Ask</button>
            </form>

            {!result && !loading && (
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-[var(--border)] px-3 py-1 text-left text-xs hover:border-[var(--fg)]">{s}</button>
                ))}
              </div>
            )}

            {loading && <p className="mt-6 text-sm text-[var(--muted)]">Running reports…</p>}
            {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
            {result && (
              <div className="mt-6 space-y-4">
                <Markdown>{result.answer}</Markdown>
                {result.chart && <div className="rounded-lg border border-[var(--border)] p-3"><Chart spec={result.chart} height={220} /></div>}
                <p className="text-xs text-[var(--muted)]">
                  reports: {result.toolsUsed.join(", ") || "none"} · {(result.meta.latencyMs / 1000).toFixed(1)}s · ${result.meta.costUsd.toFixed(5)} · {result.meta.model}
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
