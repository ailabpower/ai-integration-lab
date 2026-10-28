import { env } from "@/lib/env";
import { crmClient } from "@/lib/lead-agent/crm";
import { db } from "@/lib/supabase";

export const maxDuration = 60;

const KEEP_DAYS = 7;

// Daily Vercel cron:
// 1. touches the database so a free Supabase project doesn't pause after a quiet week;
// 2. removes lead-agent demo records older than a week from HubSpot and from lead_runs.
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const { data: old, error } = await db().from("lead_runs").select("id, crm_contact_id, crm_company_id, crm_deal_id").lt("created_at", cutoff).limit(100);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const crm = crmClient();
  let removed = 0;
  for (const run of old ?? []) {
    try {
      if (crm) {
        if (run.crm_deal_id) await crm.archive("deals", run.crm_deal_id);
        if (run.crm_contact_id) await crm.archive("contacts", run.crm_contact_id);
        if (run.crm_company_id) await crm.archive("companies", run.crm_company_id);
      }
      await db().from("lead_runs").delete().eq("id", run.id);
      removed++;
    } catch (e) {
      // Already deleted in HubSpot (404) is fine; anything else is retried tomorrow.
      if ((e as { status?: number }).status === 404) {
        await db().from("lead_runs").delete().eq("id", run.id);
        removed++;
      } else console.error("[cron/daily]", e);
    }
  }
  return Response.json({ ok: true, removedLeadRuns: removed });
}
