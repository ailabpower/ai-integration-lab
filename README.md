# AI Integration Lab

Three working examples of AI integrated into web apps, each switchable between **OpenAI and Claude**, with **real latency and cost per request** measured on every call.

| Demo | What it shows | Status |
|---|---|---|
| Docs Assistant (`/docs-chat`) | RAG over product documentation (public Supabase Auth + Database guides), hybrid search, answers with sources, refuses when the docs don't cover it | live |
| AI Analyst in an existing dashboard | Natural-language questions over sales data via typed, read-only tool calls | in progress |
| Lead intake agent → CRM | Forms and emails become scored, deduplicated HubSpot records | in progress |

Demo projects on public or synthetic data. The docs assistant is an unofficial demo and is not affiliated with Supabase.

## Stack

Next.js (App Router, TypeScript) · Vercel AI SDK · OpenAI + Anthropic · Supabase Postgres + pgvector · Vercel

## How the numbers are measured

Every user-visible request writes one row to `ai_requests` (provider, model, tokens, cost, total latency, time to first token). `/metrics` shows p50/p95 latency and cost per request per demo for the last 7 days. Prices per model live in `lib/pricing.ts`.

## Docs Assistant: how it works

1. `npm run ingest` sparse-clones the Supabase docs, strips MDX components, splits pages by heading into ~700-token chunks with deep links, embeds them (`text-embedding-3-small`) and stores them in `doc_chunks`. Re-runs only re-embed changed pages.
2. A question is embedded and searched with `match_docs`: vector similarity and Postgres full-text search merged with Reciprocal Rank Fusion, max 2 chunks per page.
3. If nothing is relevant enough, the API answers "not in the docs" without calling the LLM (zero generation cost).
4. Otherwise the model answers only from the retrieved sources, citing them as [1], [2]; sources stream to the UI as clickable links.
5. Public demo protection: per-IP hourly limit and a global daily spend cap.

`npm run eval:docs` runs 25 questions (20 answerable, 5 out of scope) on both providers and writes `docs/eval-docs-chat.md`.

## Run locally

```bash
cp .env.example .env.local     # fill in the keys
npm install
# apply supabase/migrations/*.sql to your Supabase project (SQL editor or Supabase CLI)
npm run ingest
npm run dev
```
