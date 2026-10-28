import { randomUUID } from "node:crypto";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { chatModel, logRequest, parseProvider } from "@/lib/ai";
import { buildContext, MIN_SIMILARITY, retrieve, SYSTEM_PROMPT } from "@/lib/docs-chat/retrieval";
import { guard, ipHash } from "@/lib/guard";

export const maxDuration = 30;

const MAX_QUESTION_CHARS = 1000;
const MAX_HISTORY_MESSAGES = 6;
const NOT_FOUND = "I couldn't find this in the Supabase docs. Try rephrasing with the feature name, for example \"Row Level Security\" or \"Storage buckets\".";

export type DocsChatMetadata = {
  requestId: string;
  provider: string;
  model: string;
  latencyMs: number;
  ttftMs?: number;
  costUsd: number;
};

export async function POST(req: Request) {
  const started = performance.now();
  const body = (await req.json()) as { messages: UIMessage[]; provider?: string };
  const provider = parseProvider(body.provider);
  const messages = (body.messages ?? []).slice(-MAX_HISTORY_MESSAGES);
  const last = messages.at(-1);
  const question = last?.role === "user"
    ? last.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim()
    : "";

  if (!question || question.length > MAX_QUESTION_CHARS) {
    return Response.json({ error: `Ask a question of up to ${MAX_QUESTION_CHARS} characters.` }, { status: 400 });
  }

  const ip = ipHash(req);
  const allowed = await guard(ip, "docs-chat");
  if (!allowed.ok) return Response.json({ error: allowed.message }, { status: allowed.status });

  const requestId = randomUUID();
  const { chunks, bestSimilarity, embeddingCostUsd } = await retrieve(question);
  const { modelId, model } = chatModel(provider);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Nothing relevant: answer without calling the LLM (zero generation cost).
      if (bestSimilarity < MIN_SIMILARITY) {
        const latencyMs = performance.now() - started;
        const costUsd = await logRequest({
          id: requestId, demo: "docs-chat", provider, model: modelId, latencyMs, ipHash: ip,
          extraCostUsd: embeddingCostUsd, meta: { answered: false, bestSimilarity, question },
        });
        writer.write({ type: "start", messageMetadata: { requestId, provider, model: modelId, latencyMs, costUsd } satisfies DocsChatMetadata });
        writer.write({ type: "text-start", id: "t" });
        writer.write({ type: "text-delta", id: "t", delta: NOT_FOUND });
        writer.write({ type: "text-end", id: "t" });
        writer.write({ type: "finish" });
        return;
      }

      chunks.forEach((c, i) =>
        writer.write({
          type: "source-url",
          sourceId: String(i + 1),
          url: c.url,
          title: [c.title, c.heading].filter(Boolean).join(" > "),
        }),
      );

      let ttftMs: number | undefined;
      const result = streamText({
        model,
        system: `${SYSTEM_PROMPT}\n\n<sources>\n${buildContext(chunks)}\n</sources>`,
        messages: await convertToModelMessages(messages),
        maxOutputTokens: 1200,
        onChunk: ({ chunk }) => {
          if (ttftMs === undefined && chunk.type === "text-delta") ttftMs = performance.now() - started;
        },
      });

      writer.merge(
        result.toUIMessageStream({
          messageMetadata: async ({ part }) => {
            if (part.type !== "finish") return undefined;
            const latencyMs = performance.now() - started;
            const costUsd = await logRequest({
              id: requestId, demo: "docs-chat", provider, model: modelId,
              inputTokens: part.totalUsage.inputTokens, outputTokens: part.totalUsage.outputTokens,
              latencyMs, ttftMs, ipHash: ip, extraCostUsd: embeddingCostUsd,
              meta: { answered: true, bestSimilarity, question },
            });
            return { requestId, provider, model: modelId, latencyMs, ttftMs, costUsd } satisfies DocsChatMetadata;
          },
        }),
      );
    },
    onError: (error) => {
      console.error("[docs-chat]", error);
      return "Something went wrong. Please try again.";
    },
  });

  return createUIMessageStreamResponse({ stream });
}
