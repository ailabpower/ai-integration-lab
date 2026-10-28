"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import { useState } from "react";
import type { DocsChatMetadata } from "@/app/api/docs-chat/route";
import { Markdown } from "@/components/markdown";
import { ProviderToggle } from "@/components/provider-toggle";
import type { Provider } from "@/lib/ai";

type ChatMessage = UIMessage<DocsChatMetadata>;

const SUGGESTIONS = [
  "How do I enable Row Level Security on a table?",
  "What is the difference between the anon key and the service_role key?",
  "How do I add Google login to my app?",
  "Write a policy that lets users read only their own rows.",
];

export function DocsChat() {
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: "/api/docs-chat" }),
  });
  const busy = status === "submitted" || status === "streaming";

  function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    sendMessage({ text: question }, { body: { provider } });
    setInput("");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">← AI Integration Lab</Link>
          <h1 className="text-xl font-semibold">Supabase Docs Assistant</h1>
          <p className="text-xs text-[var(--muted)]">Unofficial demo, not affiliated with Supabase. Answers come from the public Auth and Database guides.</p>
        </div>
        <ProviderToggle value={provider} onChange={setProvider} />
      </header>

      <section className="flex-1 space-y-6" aria-live="polite">
        {messages.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="rounded-lg border border-[var(--border)] p-3 text-left text-sm hover:border-[var(--fg)]">
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {status === "submitted" && <p className="text-sm text-[var(--muted)]">Searching the docs…</p>}
        {error && <p className="text-sm text-red-600">{readError(error)}</p>}
      </section>

      <form
        className="sticky bottom-0 mt-6 flex gap-2 bg-[var(--bg)] py-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={1000}
          placeholder="Ask about Supabase Auth or Database…"
          className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 outline-none focus:border-[var(--fg)]"
          aria-label="Your question"
        />
        <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-[var(--fg)] px-4 py-2 text-[var(--bg)] disabled:opacity-40">
          Ask
        </button>
      </form>
    </main>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  if (message.role === "user") {
    return <p className="ml-auto max-w-[85%] rounded-2xl bg-[var(--surface)] px-4 py-2">{text}</p>;
  }

  const sources = message.parts.filter((p) => p.type === "source-url");
  const meta = message.metadata;
  return (
    <article className="space-y-3">
      <Markdown>{text}</Markdown>
      {sources.length > 0 && (
        <ol className="flex flex-wrap gap-2 text-xs">
          {sources.map((s) => (
            <li key={s.sourceId}>
              <a href={s.url} target="_blank" rel="noreferrer" className="inline-block rounded-full border border-[var(--border)] px-2.5 py-1 hover:border-[var(--fg)]">
                [{s.sourceId}] {s.title || s.url}
              </a>
            </li>
          ))}
        </ol>
      )}
      {meta?.latencyMs != null && (
        <footer className="flex items-center gap-3 text-xs text-[var(--muted)]">
          <span>
            {(meta.latencyMs / 1000).toFixed(1)}s
            {meta.ttftMs != null && ` · first token ${(meta.ttftMs / 1000).toFixed(1)}s`} · ${meta.costUsd.toFixed(5)} · {meta.model}
          </span>
          <Feedback requestId={meta.requestId} />
        </footer>
      )}
    </article>
  );
}

function Feedback({ requestId }: { requestId: string }) {
  const [sent, setSent] = useState<1 | -1 | null>(null);
  async function rate(rating: 1 | -1) {
    setSent(rating);
    await fetch("/api/docs-chat/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, rating }),
    }).catch(() => setSent(null));
  }
  return (
    <span className="flex gap-1">
      <button type="button" aria-label="Helpful" aria-pressed={sent === 1} onClick={() => rate(1)} className={sent === 1 ? "opacity-100" : "opacity-50 hover:opacity-100"}>👍</button>
      <button type="button" aria-label="Not helpful" aria-pressed={sent === -1} onClick={() => rate(-1)} className={sent === -1 ? "opacity-100" : "opacity-50 hover:opacity-100"}>👎</button>
    </span>
  );
}

function readError(error: Error): string {
  try {
    return (JSON.parse(error.message) as { error?: string }).error ?? error.message;
  } catch {
    return error.message;
  }
}
