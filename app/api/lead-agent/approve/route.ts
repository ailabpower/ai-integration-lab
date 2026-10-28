import { z } from "zod";
import { crmClient } from "@/lib/lead-agent/crm";
import { writeToCrm } from "@/lib/lead-agent/pipeline";
import { db } from "@/lib/supabase";

const body = z.object({ runId: z.string().uuid() });

// Human-in-the-loop: a reviewer approves a low-confidence lead and it goes to the CRM.
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const crm = crmClient();
  if (!crm) return Response.json({ error: "The CRM is not connected for this demo yet." }, { status: 503 });

  const { data: run } = await db().from("lead_runs").select("*").eq("id", parsed.data.runId).eq("decision", "review").is("approved_at", null).maybeSingle();
  if (!run) return Response.json({ error: "Nothing to approve." }, { status: 404 });
  if (!run.extracted?.email) return Response.json({ error: "This lead has no email address." }, { status: 422 });

  // Claim it first so a double click can't write twice.
  const claim = await db().from("lead_runs").update({ approved_at: new Date().toISOString() }).eq("id", run.id).is("approved_at", null).select("id");
  if (!claim.data?.length) return Response.json({ error: "Already approved." }, { status: 409 });

  try {
    const written = await writeToCrm(crm, run.extracted, run.qualification, run.source, run.input_text);
    await db().from("lead_runs").update({
      decision: written.decision, crm_contact_id: written.crm.contactId, crm_company_id: written.crm.companyId, crm_deal_id: written.crm.dealId,
    }).eq("id", run.id);
    return Response.json({ ok: true, decision: written.decision });
  } catch (error) {
    console.error("[lead-agent/approve]", error);
    await db().from("lead_runs").update({ approved_at: null }).eq("id", run.id);
    return Response.json({ error: "Could not write to the CRM." }, { status: 502 });
  }
}
