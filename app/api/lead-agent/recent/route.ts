import { crmClient } from "@/lib/lead-agent/crm";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export type RecentResponse = {
  contacts: { id: string; name: string; company: string | null; email: string; score: number | null; category: string | null; summary: string | null; updatedAt: string | null }[];
  review: { id: string; createdAt: string; name: string | null; email: string | null; need: string; reason: string; canApprove: boolean }[];
};

// Hide most of the address: the list is public.
const mask = (email: string | null) => (email ? email.replace(/^(.).*?(@.*)$/, "$1•••$2") : "");

export async function GET() {
  const crm = crmClient();
  const [contacts, review] = await Promise.all([
    crm ? crm.recentAgentContacts(10).catch(() => []) : [],
    db().from("lead_runs").select("id, created_at, extracted, qualification").eq("decision", "review").is("approved_at", null).order("created_at", { ascending: false }).limit(10),
  ]);

  return Response.json({
    contacts: contacts.map((c) => ({
      id: c.id,
      name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(" ") || "(no name)",
      company: c.properties.company ?? null,
      email: mask(c.properties.email),
      score: c.properties.ai_lead_score ? Number(c.properties.ai_lead_score) : null,
      category: c.properties.ai_lead_category ?? null,
      summary: c.properties.ai_lead_summary ?? null,
      updatedAt: c.properties.lastmodifieddate ?? c.properties.createdate ?? null,
    })),
    review: (review.data ?? []).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      name: r.extracted?.name ?? null,
      email: mask(r.extracted?.email ?? null) || null,
      need: r.extracted?.need ?? "",
      reason: r.extracted?.email ? `low confidence (${Number(r.extracted.confidence).toFixed(2)})` : "no email address",
      canApprove: Boolean(r.extracted?.email),
    })),
  } satisfies RecentResponse);
}
