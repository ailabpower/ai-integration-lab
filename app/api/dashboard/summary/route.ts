import { randomUUID } from "node:crypto";
import { generateText } from "ai";
import { chatModel, logRequest, parseProvider } from "@/lib/ai";
import * as q from "@/lib/dashboard/queries";
import { guard, ipHash } from "@/lib/guard";
import { db } from "@/lib/supabase";

export const maxDuration = 30;

export type SummaryResponse = { weekStart: string; weekEnd: string; summary: string; model: string; cached: boolean };

// Last complete Monday-Sunday week.
function lastFullWeek(today = new Date()) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  const start = new Date(d.getTime() - (sinceMonday + 7) * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const prevStart = new Date(start.getTime() - 7 * 86_400_000);
  const prevEnd = new Date(start.getTime() - 86_400_000);
  return { start: q.isoDay(start), end: q.isoDay(end), prevStart: q.isoDay(prevStart), prevEnd: q.isoDay(prevEnd) };
}

// One summary per week, generated on first view and cached, so page views cost nothing.
export async function GET(req: Request) {
  const week = lastFullWeek();
  const cached = await db().from("dash_ai_summaries").select("summary, model").eq("week_start", week.start).maybeSingle();
  if (cached.data) {
    return Response.json({ weekStart: week.start, weekEnd: week.end, summary: cached.data.summary, model: cached.data.model, cached: true } satisfies SummaryResponse);
  }

  const ip = ipHash(req);
  const allowed = await guard(ip, "dashboard");
  if (!allowed.ok) return Response.json({ error: allowed.message }, { status: allowed.status });

  const provider = parseProvider(new URL(req.url).searchParams.get("provider"));
  const { modelId, model } = chatModel(provider);
  const started = performance.now();

  try {
    const [now, prev, catNow, catPrev, returns] = await Promise.all([
      q.kpis(week.start, week.end),
      q.kpis(week.prevStart, week.prevEnd),
      q.salesByCategory(week.start, week.end),
      q.salesByCategory(week.prevStart, week.prevEnd),
      q.returnsRate(q.isoDay(new Date(Date.now() - 90 * 86_400_000)), week.end, "product"),
    ]);

    const result = await generateText({
      model,
      maxOutputTokens: 400,
      system: "You write the weekly summary card of an online store's admin dashboard. 3-4 short sentences, plain text, no headings or bullets. Lead with the most important change, give exact numbers and percentages, and end with one concrete thing to check. Use only the numbers provided.",
      prompt: JSON.stringify({ week, thisWeek: now, previousWeek: prev, categoriesThisWeek: catNow, categoriesPreviousWeek: catPrev, highestReturnRatesLast90Days: returns.slice(0, 3) }),
    });

    await logRequest({
      id: randomUUID(), demo: "dashboard", provider, model: modelId,
      inputTokens: result.totalUsage.inputTokens, outputTokens: result.totalUsage.outputTokens,
      latencyMs: performance.now() - started, ipHash: ip, meta: { kind: "weekly-summary", week: week.start },
    });
    await db().from("dash_ai_summaries").upsert({ week_start: week.start, provider, model: modelId, summary: result.text });

    return Response.json({ weekStart: week.start, weekEnd: week.end, summary: result.text, model: modelId, cached: false } satisfies SummaryResponse);
  } catch (error) {
    console.error("[dashboard/summary]", error);
    return Response.json({ error: "Summary unavailable." }, { status: 500 });
  }
}
