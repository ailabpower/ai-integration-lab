import type { HubSpot } from "../lib/lead-agent/hubspot";

// In-memory stand-in for HubSpot, so the eval never writes to the real CRM.
export function fakeCrm(): HubSpot & { contacts: Map<string, Record<string, unknown>> } {
  let n = 0;
  const contacts = new Map<string, Record<string, unknown>>();
  const companies = new Map<string, Record<string, unknown>>();
  const obj = (id: string, properties: Record<string, unknown>) => ({ id, properties: properties as Record<string, string | null> });
  return {
    contacts,
    findContactByEmail: async (email) => {
      for (const [id, p] of contacts) if (p.email === email) return obj(id, p);
      return null;
    },
    findCompanyByDomain: async (domain) => {
      for (const [id, p] of companies) if (p.domain === domain) return obj(id, p);
      return null;
    },
    createContact: async (p) => { const id = `c${++n}`; contacts.set(id, p); return obj(id, p); },
    updateContact: async (id, p) => { contacts.set(id, { ...contacts.get(id), ...p }); return obj(id, contacts.get(id)!); },
    createCompany: async (p) => { const id = `co${++n}`; companies.set(id, p); return obj(id, p); },
    associateContactCompany: async () => undefined,
    createDeal: async (p) => obj(`d${++n}`, p),
    createNote: async (body) => obj(`n${++n}`, { body }),
    recentAgentContacts: async () => [],
    archive: async () => undefined,
    createProperty: async () => undefined,
  };
}
