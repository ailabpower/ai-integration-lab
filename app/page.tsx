import Link from "next/link";

const DEMOS = [
  {
    href: "/docs-chat",
    title: "Docs Assistant (RAG)",
    body: "Answers questions from product documentation, with links to the exact page. Built on the public Supabase docs.",
    status: "live",
  },
  {
    href: "/dashboard",
    title: "AI Analyst in an existing dashboard",
    body: "Ask your sales data questions in plain English and get charts, without rewriting the dashboard.",
    status: "soon",
  },
  {
    href: "/lead-agent",
    title: "Lead intake agent → CRM",
    body: "Turns contact forms and emails into scored, deduplicated HubSpot records.",
    status: "soon",
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">AI Integration Lab</h1>
      <p className="mt-3 text-[var(--muted)]">
        Three working examples of AI added to web apps, each switchable between OpenAI and Claude, with real latency and cost per request on the{" "}
        <Link href="/metrics" className="underline">metrics page</Link>.
      </p>
      <ul className="mt-8 grid gap-4">
        {DEMOS.map((d) => (
          <li key={d.href}>
            {d.status === "live" ? (
              <Link href={d.href} className="block rounded-xl border border-[var(--border)] p-5 hover:border-[var(--fg)]">
                <h2 className="font-medium">{d.title} →</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{d.body}</p>
              </Link>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-5 opacity-60">
                <h2 className="font-medium">{d.title} · coming soon</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{d.body}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-10 text-xs text-[var(--muted)]">Demo projects on public or synthetic data. Please don&apos;t enter personal data.</p>
    </main>
  );
}
