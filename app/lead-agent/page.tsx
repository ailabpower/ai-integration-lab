import type { Metadata } from "next";
import { LeadAgent } from "./lead-agent";

export const metadata: Metadata = {
  title: "Lead intake agent · AI Integration Lab",
  description: "Turns contact forms and emails into scored, deduplicated HubSpot records, on OpenAI or Claude.",
};

export default function Page() {
  return <LeadAgent />;
}
