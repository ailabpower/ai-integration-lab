import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  // Optional so indexing (OpenAI embeddings) can run first; Claude calls fail clearly without it.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_PROVIDER: z.enum(["openai", "anthropic"]).default("anthropic"),
  OPENAI_CHAT_MODEL: z.string().default("gpt-5-mini"),
  ANTHROPIC_CHAT_MODEL: z.string().default("claude-haiku-5-5"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(15),
  DAILY_COST_CAP_USD: z.coerce.number().positive().default(0.3),
  IP_HASH_SALT: z.string().min(8),
  CRON_SECRET: z.string().min(16).optional(),
  // Only the lead agent demo needs it.
  HUBSPOT_ACCESS_TOKEN: z.string().min(10).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Validated lazily so `next build` works without secrets.
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
