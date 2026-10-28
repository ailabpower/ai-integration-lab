import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/supabase";

export const metadata: Metadata = { title: "Metrics · AI Integration Lab" };
export const dynamic = "force-dynamic";

type Row = {
  demo: string;
  provider: string;
  requests: number;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  p50_ttft_ms: number | null;
  avg_cost_usd: number | null;
  total_cost_usd: number | null;
  thumbs_up: number;
  thumbs_down: number;
};

const fmtMs = (v: number | null) => (v == null ? "–" : `${(v / 1000).toFixed(2)}s`);
const fmtUsd = (v: number | null, digits = 5) => (v == null ? "–" : `$${Number(v).toFixed(digits)}`);

export default async function MetricsPage() {
  const { data, error } = await db().rpc("demo_metrics", { days: 7 });
  const rows = (data ?? []) as Row[];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">← AI Integration Lab</Link>
      <h1 className="mt-1 text-2xl font-semibold">Latency and cost per request</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Live numbers from every request in the last 7 days. This is the same monitoring a client gets in a maintenance plan.</p>
      {error && <p className="mt-6 text-sm text-red-600">Metrics are temporarily unavailable.</p>}
      {!error && rows.length === 0 && <p className="mt-6 text-sm text-[var(--muted)]">No requests yet. Try one of the demos.</p>}
      {rows.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[var(--muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 pr-4 font-normal">Demo</th>
                <th className="py-2 pr-4 font-normal">Provider</th>
                <th className="py-2 pr-4 text-right font-normal">Requests</th>
                <th className="py-2 pr-4 text-right font-normal">p50</th>
                <th className="py-2 pr-4 text-right font-normal">p95</th>
                <th className="py-2 pr-4 text-right font-normal">First token p50</th>
                <th className="py-2 pr-4 text-right font-normal">Avg cost</th>
                <th className="py-2 pr-4 text-right font-normal">Cost / 1k requests</th>
                <th className="py-2 text-right font-normal">👍 / 👎</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.demo}-${r.provider}`} className="border-b border-[var(--border)]">
                  <td className="py-2 pr-4">{r.demo}</td>
                  <td className="py-2 pr-4">{r.provider}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.requests}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{fmtMs(r.p50_latency_ms)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{fmtMs(r.p95_latency_ms)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{fmtMs(r.p50_ttft_ms)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{fmtUsd(r.avg_cost_usd)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{fmtUsd(r.avg_cost_usd == null ? null : r.avg_cost_usd * 1000, 2)}</td>
                  <td className="py-2 text-right tabular-nums">{r.thumbs_up} / {r.thumbs_down}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
