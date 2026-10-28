// One-time: creates the custom contact properties the lead agent writes. Safe to re-run.
// Usage: npm run setup:hubspot
import "./load-env";
import { hubspot, HubSpotError } from "../lib/lead-agent/hubspot";

const PROPERTIES = [
  { name: "ai_lead_score", label: "AI lead score", type: "number", fieldType: "number" },
  { name: "ai_lead_category", label: "AI lead category", type: "enumeration", fieldType: "select", options: ["hot", "warm", "cold", "spam"].map((v, i) => ({ label: v, value: v, displayOrder: i })) },
  { name: "ai_lead_summary", label: "AI lead summary", type: "string", fieldType: "textarea" },
  { name: "ai_source", label: "AI lead source", type: "string", fieldType: "text" },
];

async function main() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("Set HUBSPOT_ACCESS_TOKEN in .env.local first.");
  const crm = hubspot(token);
  for (const p of PROPERTIES) {
    try {
      await crm.createProperty("contacts", { ...p, groupName: "contactinformation", description: "Written by the AI lead intake agent" });
      console.log(`created ${p.name}`);
    } catch (e) {
      if (e instanceof HubSpotError && e.status === 409) console.log(`exists  ${p.name}`);
      else throw e;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
