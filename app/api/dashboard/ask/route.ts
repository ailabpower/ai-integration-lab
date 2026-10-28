import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ChartSpec } from "@/components/dashboard/charts";
import { chatModel, logRequest, parseProvider } from "@/lib/ai";
import { runAnalyst } from "@/lib/dashboard/analyst";
import { guard, ipHash } from "@/lib/guard";

export const maxDuration = 45;

const body = z.object({ question: z.string().trim().min(3).max(500), provider: z.string().optional() });

export type AskResponse = {
  answer: string;
  chart: ChartSpec | null;
  toolsUsed: string[];
  meta: { requestId: string; provider: string; model: string; latencyMs: number; costUsd: number };
};

export async function POST(req: Request) {
  const started = performance.now();
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ask a question of up to 500 characters." }, { status: 400 });

  const ip = ipHash(req);
  const allowed = await guard(ip, "dashboard");
  if (!allowed.ok) return Response.json({ error: allowed.message }, { status: allowed.status });

  const provider = parseProvider(parsed.data.provider);
  const requestId = randomUUID();

  try {
    const r = await runAnalyst(parsed.data.question, provider);
    const latencyMs = performance.now() - started;
    const costUsd = await logRequest({
      id: requestId, demo: "dashboard", provider, model: r.modelId,
      inputTokens: r.inputTokens, outputTokens: r.outputTokens,
      latencyMs, ipHash: ip, meta: { question: parsed.data.question, toolsUsed: r.toolsUsed },
    });
    return Response.json({
      answer: r.answer,
      chart: r.chart,
      toolsUsed: r.toolsUsed,
      meta: { requestId, provider, model: r.modelId, latencyMs, costUsd },
    } satisfies AskResponse);
  } catch (error) {
    console.error("[dashboard/ask]", error);
    const { modelId } = chatModel(provider);
    await logRequest({ id: requestId, demo: "dashboard", provider, model: modelId, latencyMs: performance.now() - started, ok: false, ipHash: ip });
    return Response.json({ error: "The analyst couldn't answer that. Please try again." }, { status: 500 });
  }
}
