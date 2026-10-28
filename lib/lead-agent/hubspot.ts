// Minimal HubSpot CRM v3 client: only the calls the lead agent needs.
// Auth: a private app access token with crm.objects.contacts/companies/deals read+write
// (and crm.schemas.contacts.write once, for scripts/setup-hubspot.ts).

const BASE = "https://api.hubapi.com";

// HubSpot-defined association type ids.
const ASSOC = { dealToContact: 3, dealToCompany: 5, noteToContact: 202, contactToCompany: 1 } as const;

export class HubSpotError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function hubspot(token: string) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(BASE + path, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new HubSpotError(res.status, `HubSpot ${method} ${path}: ${res.status} ${await res.text()}`);
      return (res.status === 204 ? undefined : await res.json()) as T;
    }
  }

  type Obj = { id: string; properties: Record<string, string | null> };
  const searchOne = async (object: string, property: string, value: string, properties: string[]): Promise<Obj | null> => {
    const r = await call<{ results: Obj[] }>("POST", `/crm/v3/objects/${object}/search`, {
      filterGroups: [{ filters: [{ propertyName: property, operator: "EQ", value }] }],
      properties,
      limit: 1,
    });
    return r.results[0] ?? null;
  };

  return {
    findContactByEmail: (email: string) => searchOne("contacts", "email", email, ["email", "firstname", "lastname", "company"]),
    findCompanyByDomain: (domain: string) => searchOne("companies", "domain", domain, ["name", "domain"]),
    createContact: (properties: Record<string, string | number>) => call<Obj>("POST", "/crm/v3/objects/contacts", { properties }),
    updateContact: (id: string, properties: Record<string, string | number>) => call<Obj>("PATCH", `/crm/v3/objects/contacts/${id}`, { properties }),
    createCompany: (properties: Record<string, string>) => call<Obj>("POST", "/crm/v3/objects/companies", { properties }),
    associateContactCompany: (contactId: string, companyId: string) =>
      call("PUT", `/crm/v4/objects/contact/${contactId}/associations/default/company/${companyId}`),
    createDeal: (properties: Record<string, string | number>, contactId: string, companyId?: string) =>
      call<Obj>("POST", "/crm/v3/objects/deals", {
        properties,
        associations: [
          { to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: ASSOC.dealToContact }] },
          ...(companyId ? [{ to: { id: companyId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: ASSOC.dealToCompany }] }] : []),
        ],
      }),
    createNote: (body: string, contactId: string) =>
      call<Obj>("POST", "/crm/v3/objects/notes", {
        properties: { hs_timestamp: new Date().toISOString(), hs_note_body: body },
        associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: ASSOC.noteToContact }] }],
      }),
    recentAgentContacts: async (limit = 10) => {
      const r = await call<{ results: Obj[] }>("POST", "/crm/v3/objects/contacts/search", {
        filterGroups: [{ filters: [{ propertyName: "ai_lead_category", operator: "HAS_PROPERTY" }] }],
        sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
        properties: ["firstname", "lastname", "company", "email", "ai_lead_score", "ai_lead_category", "ai_lead_summary", "createdate", "lastmodifieddate"],
        limit,
      });
      return r.results;
    },
    archive: (object: "contacts" | "companies" | "deals", id: string) => call("DELETE", `/crm/v3/objects/${object}/${id}`),
    createProperty: (object: string, property: Record<string, unknown>) => call("POST", `/crm/v3/properties/${object}`, property),
  };
}

export type HubSpot = ReturnType<typeof hubspot>;
