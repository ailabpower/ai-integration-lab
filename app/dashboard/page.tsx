import type { Metadata } from "next";
import Link from "next/link";
import { AskPanel } from "@/components/dashboard/ask-panel";
import { Chart } from "@/components/dashboard/charts";
import { WeeklySummary } from "@/components/dashboard/weekly-summary";
import { alignStart, kpis, lastNDays, returnsRate, revenueOverTime, salesByCategory, topProducts, type Kpis } from "@/lib/dashboard/queries";

export const metadata: Metadata = { title: "Store dashboard · AI Integration Lab" };
export const dynamic = "force-dynamic";

const RANGES = { "30": 30, "90": 90, "365": 365 } as const;
const usd = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Delta({ now, prev, invert = false }: { now: number; prev: number; invert?: boolean }) {
  if (!prev) return null;
  const change = (now - prev) / prev;
  const good = invert ? change < 0 : change > 0;
  return <span className={`text-xs ${good ? "text-[var(--accent)]" : "text-red-600"}`}>{change > 0 ? "▲" : "▼"} {Math.abs(change * 100).toFixed(1)}%</span>;
}

function KpiCard({ label, value, now, prev, field, invert }: { label: string; value: string; now: Kpis; prev: Kpis; field: keyof Kpis; invert?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <Delta now={now[field]} prev={prev[field]} invert={invert} />
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range = "30" } = await searchParams;
  const days = RANGES[range as keyof typeof RANGES] ?? 30;
  const r = lastNDays(days);
  const granularity = days > 90 ? "month" : days > 30 ? "week" : "day";
  const [now, prev, series, categories, products, returns] = await Promise.all([
    kpis(r.from, r.to),
    kpis(r.prevFrom, r.prevTo),
    revenueOverTime(alignStart(r.from, granularity), r.to, granularity),
    salesByCategory(r.from, r.to),
    topProducts(r.from, r.to, "revenue", 8),
    returnsRate(r.from, r.to, "product"),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">← AI Integration Lab</Link>
          <h1 className="text-xl font-semibold">Northwind Goods · Store dashboard</h1>
          <p className="text-xs text-[var(--muted)]">Sample e-commerce data (synthetic).</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AskPanel />
          <nav className="flex gap-1 text-sm" aria-label="Date range">
            {Object.keys(RANGES).map((k) => (
              <Link key={k} href={`/dashboard?range=${k}`} className={`rounded-md px-3 py-1 ${k === String(days) ? "bg-[var(--fg)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}>
                {k === "365" ? "12 months" : `${k} days`}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <WeeklySummary />

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Revenue" value={usd(now.revenue)} now={now} prev={prev} field="revenue" />
        <KpiCard label="Orders" value={now.orders.toLocaleString("en-US")} now={now} prev={prev} field="orders" />
        <KpiCard label="Avg order value" value={usd(now.avg_order_value)} now={now} prev={prev} field="avg_order_value" />
        <KpiCard label="Return rate" value={`${(now.return_rate * 100).toFixed(1)}%`} now={now} prev={prev} field="return_rate" invert />
      </section>

      <section className="mt-6 rounded-xl border border-[var(--border)] p-4">
        <h2 className="mb-3 text-sm font-medium">Revenue</h2>
        <Chart spec={{ type: "line", data: series, x: "period", y: "revenue", format: "money" }} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] p-4">
          <h2 className="mb-3 text-sm font-medium">Revenue by category</h2>
          <Chart spec={{ type: "bar", data: categories, x: "category", y: "revenue", format: "money", horizontal: true }} height={220} />
        </div>
        <div className="rounded-xl border border-[var(--border)] p-4">
          <h2 className="mb-3 text-sm font-medium">Top products</h2>
          <table className="w-full text-sm">
            <tbody>
              {products.map((p) => (
                <tr key={p.product} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-1.5">{p.product}<span className="ml-2 text-xs text-[var(--muted)]">{p.category}</span></td>
                  <td className="py-1.5 text-right tabular-nums">{usd(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-[var(--border)] p-4">
        <h2 className="mb-3 text-sm font-medium">Highest return rates (products with 10+ orders)</h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-[var(--muted)]">
            <tr><th className="py-1 text-left font-normal">Product</th><th className="py-1 text-right font-normal">Orders</th><th className="py-1 text-right font-normal">Returned</th><th className="py-1 text-right font-normal">Rate</th></tr>
          </thead>
          <tbody>
            {returns.slice(0, 5).map((x) => (
              <tr key={x.name} className="border-t border-[var(--border)]">
                <td className="py-1.5">{x.name}</td>
                <td className="py-1.5 text-right tabular-nums">{x.orders}</td>
                <td className="py-1.5 text-right tabular-nums">{x.returned}</td>
                <td className="py-1.5 text-right tabular-nums">{(x.return_rate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
