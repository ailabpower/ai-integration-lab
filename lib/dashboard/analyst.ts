import { generateText, stepCountIs } from "ai";
import type { ChartSpec } from "@/components/dashboard/charts";
import { chatModel, type Provider } from "../ai";
import { isoDay } from "./queries";
import { analystSystemPrompt, dashboardTools, type ToolOutput } from "./tools";

export type AnalystResult = {
  answer: string;
  chart: ChartSpec | null;
  toolsUsed: string[];
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
};

export async function runAnalyst(question: string, provider: Provider, today = new Date()): Promise<AnalystResult> {
  const { modelId, model } = chatModel(provider);
  const result = await generateText({
    model,
    system: analystSystemPrompt(isoDay(today)),
    prompt: question,
    tools: dashboardTools,
    stopWhen: stepCountIs(5),
    maxOutputTokens: 800,
  });
  const calls = result.steps.flatMap((s) => s.toolResults);
  return {
    answer: result.text,
    // Show the most recent chartable result: it's the one the answer is about.
    chart: calls.map((c) => (c.output as ToolOutput).chart).filter(Boolean).at(-1) ?? null,
    toolsUsed: calls.map((c) => c.toolName),
    modelId,
    inputTokens: result.totalUsage.inputTokens,
    outputTokens: result.totalUsage.outputTokens,
  };
}
