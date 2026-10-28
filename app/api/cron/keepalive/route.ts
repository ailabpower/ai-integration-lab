import { env } from "@/lib/env";
import { db } from "@/lib/supabase";

// Daily Vercel cron: keeps the free Supabase project from pausing after a week without traffic.
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { error } = await db().from("ai_requests").select("id", { head: true, count: "exact" }).limit(1);
  return Response.json({ ok: !error });
}
