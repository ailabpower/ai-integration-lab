import { randomUUID } from "node:crypto";
import { z } from "zod";
import { logRequest, parseProvider } from "@/lib/ai";
import { guard, ipHash } from "@/lib/guard";
import { crmClient } from "@/lib/lead-agent/crm";
import { inputHash, processLead, type RunResult, type StepEvent } from "@/lib/lead-agent/pipeline";
import { db } from "@/lib/supabase";

export const maxDuration = 45;

const body = z.object({
  source: z.enum(["form", "email"]),
  text: z.string().trim().min(10).max(2000),
  provider: z.string().optional(),
});

export type LeadAgentEvent =
  | StepEvent
  | { type: "result"; result: RunResult & { latencyMs: number; duplicate: boolean } }
  | { type: "error"; message: string };

// Streams one JSON object per line: each pipeline step as it finishes, then the result.
export async function POST(req: Request) {
  const started = performance.now();
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send between 10 and 2000 characters." }, { status: 400 });
  const { source, text } = parsed.data;

  const crm = crmClient();
  if (!crm) return Response.json({ error: "The CRM is not connected for this demo yet." }, { status: 503 });

  const hash = inputHash(source, text);
  const previous = await db().from("lead_runs").select("*").eq("input_hash", hash).maybeSingle();

  const ip = ipHash(req);
  if (!previous.data) {
    const allowed = await guard(ip, "lead-agent");
    if (!allowed.ok) return Response.json({ error: allowed.message }, { status: allowed.status });
  }

  const provider = parseProvider(parsed.data.provider);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: LeadAgentEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        // Idempotency: the same message is never written twice, even on a double submit.
        if (previous.data) {
          const p = previous.data;
          send({
            type: "result",
            result: {
              runId: p.id, decision: p.decision, lead: p.extracted, qualification: p.qualification,
              crm: { contactId: p.crm_contact_id ?? undefined, companyId: p.crm_company_id ?? undefined, dealId: p.crm_deal_id ?? undefined },
              costUsd: 0, inputTokens: 0, outputTokens: 0, modelId: "-", latencyMs: performance.now() - started, duplicate: true,
            },
          });
          return;
        }

        const result = await processLead({ source, text, provider, crm, onStep: send });
        const latencyMs = performance.now() - started;
        const requestId = randomUUID();
        await logRequest({
          id: requestId, demo: "lead-agent", provider, model: result.modelId,
          inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs, ipHash: ip,
          meta: { decision: result.decision, category: result.qualification.category },
        });
        const run = await db().from("lead_runs").insert({
          input_hash: hash, source, input_text: text, extracted: result.lead, qualification: result.qualification,
          decision: result.decision, crm_contact_id: result.crm.contactId, crm_company_id: result.crm.companyId, crm_deal_id: result.crm.dealId,
        }).select("id").single();
        send({ type: "result", result: { ...result, runId: run.data?.id, latencyMs, duplicate: false } });
      } catch (error) {
        console.error("[lead-agent]", error);
        send({ type: "error", message: "The agent failed on this message. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
