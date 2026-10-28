import { env } from "../env";
import { hubspot, type HubSpot } from "./hubspot";

export function crmClient(): HubSpot | null {
  const token = env().HUBSPOT_ACCESS_TOKEN;
  return token ? hubspot(token) : null;
}
