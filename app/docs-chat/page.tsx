import type { Metadata } from "next";
import { DocsChat } from "./docs-chat";

export const metadata: Metadata = {
  title: "Docs Assistant · AI Integration Lab",
  description: "RAG chatbot over the Supabase documentation, with sources, on OpenAI or Claude.",
};

export default function Page() {
  return <DocsChat />;
}
