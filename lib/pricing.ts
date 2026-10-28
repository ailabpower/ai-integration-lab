// USD per 1M tokens. Check the providers' pricing pages and update when models change.
// Anthropic prices verified 2026-10-28; OpenAI prices must be checked before going live.
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

export function costUsd(model: string, inputTokens = 0, outputTokens = 0): number {
  const price = PRICING[model];
  if (!price) {
    console.warn(`[pricing] no price for model "${model}", logging cost as 0`);
    return 0;
  }
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
