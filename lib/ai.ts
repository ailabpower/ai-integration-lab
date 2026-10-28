import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { env } from "./env";
import { costUsd } from "./pricing";
import { db } from "./supabase";

export type Provider = "openai" | "anthropic";
export type Demo = "docs-chat" | "dashboard" | "lead-agent";

export function parseProvider(value: unknown): Provider {
  return value === "openai" || value === "anthropic" ? value : env().AI_PROVIDER;
}

export function chatModel(provider: Provider) {
  const e = env();
  if (provider === "openai") {
    const modelId = e.OPENAI_CHAT_MODEL;
    return { modelId, model: createOpenAI({ apiKey: e.OPENAI_API_KEY })(modelId) };
  }
  const modelId = e.ANTHROPIC_CHAT_MODEL;
  return { modelId, model: createAnthropic({ apiKey: e.ANTHROPIC_API_KEY })(modelId) };
}

export function embeddingModel() {
  const e = env();
  return {
    modelId: e.EMBEDDING_MODEL,
    model: createOpenAI({ apiKey: e.OPENAI_API_KEY }).embedding(e.EMBEDDING_MODEL),
  };
}

export type RequestLog = {
  id: string;
  demo: Demo;
  provider: Provider | "openai-embedding";
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  ttftMs?: number;
  ok?: boolean;
  ipHash?: string;
  meta?: Record<string, unknown>;
  // Extra cost not covered by input/output tokens of `model` (e.g. the query embedding).
  extraCostUsd?: number;
};

// One row per user-visible request: this is where the latency and cost numbers come from.
export async function logRequest(log: RequestLog): Promise<number> {
  const cost = costUsd(log.model, log.inputTokens, log.outputTokens) + (log.extraCostUsd ?? 0);
  const { error } = await db().from("ai_requests").insert({
    id: log.id,
    demo: log.demo,
    provider: log.provider,
    model: log.model,
    input_tokens: log.inputTokens ?? null,
    output_tokens: log.outputTokens ?? null,
    cost_usd: cost,
    latency_ms: Math.round(log.latencyMs),
    ttft_ms: log.ttftMs == null ? null : Math.round(log.ttftMs),
    ok: log.ok ?? true,
    ip_hash: log.ipHash ?? null,
    meta: log.meta ?? null,
  });
  if (error) console.error("[logRequest]", error.message);
  return cost;
}
