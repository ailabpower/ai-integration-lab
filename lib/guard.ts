import { createHash } from "node:crypto";
import { env } from "./env";
import type { Demo } from "./ai";
import { db } from "./supabase";

export function ipHash(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(env().IP_HASH_SALT + ip).digest("hex").slice(0, 32);
}

export type GuardResult = { ok: true } | { ok: false; status: number; message: string };

// Public demo protection: per-IP hourly limit and a global daily spend cap.
export async function guard(ipHashValue: string, demo: Demo): Promise<GuardResult> {
  const { data, error } = await db()
    .rpc("guard_stats", { p_ip_hash: ipHashValue, p_demo: demo })
    .single<{ ip_requests_last_hour: number; cost_today_usd: number }>();
  if (error || !data) {
    console.error("[guard]", error?.message);
    return { ok: false, status: 503, message: "Demo temporarily unavailable." };
  }
  if (Number(data.cost_today_usd) >= env().DAILY_COST_CAP_USD) {
    return { ok: false, status: 429, message: "Demo limit reached for today. Please come back tomorrow." };
  }
  if (Number(data.ip_requests_last_hour) >= env().RATE_LIMIT_PER_HOUR) {
    return { ok: false, status: 429, message: "Too many requests from your network. Try again in an hour." };
  }
  return { ok: true };
}
