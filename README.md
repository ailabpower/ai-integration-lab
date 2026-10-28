# AI Integration Lab

Three working examples of AI integrated into web apps. Each one can run on **OpenAI or Claude** (switch in the UI), and every request is measured: **latency and cost per request** are live on `/metrics`.

| Demo | What it shows |
|---|---|
| **Docs Assistant** (`/docs-chat`) | RAG over product documentation (the public Supabase Auth + Database guides): hybrid search in Postgres, streamed answers with clickable sources, and an honest "not in the docs" instead of guessing. |
| **AI Analyst in an existing dashboard** (`/dashboard`) | An "Ask your data" drawer and an AI weekly summary added to a store dashboard. The model can only call six typed, read-only reports, never raw SQL. The integration touches one existing file. |
| **Lead intake agent → HubSpot** (`/lead-agent`) | Contact forms and pasted emails become scored, deduplicated HubSpot contacts, companies, deals and notes. Uncertain leads wait in a human review queue; spam and prompt injection never reach the CRM. |

Demo projects on public or synthetic data. The docs assistant is an unofficial demo and is not affiliated with Supabase.

## Stack

Next.js 15 (App Router, TypeScript) · Vercel AI SDK · OpenAI + Anthropic · Supabase Postgres + pgvector · HubSpot CRM API · Vercel

## Architecture

```
Browser ──► Next.js on Vercel
             ├─ /api/docs-chat     embed question → match_docs (vector + full-text, RRF) → stream answer + sources
             ├─ /api/dashboard/*   tool calling over 6 read-only Postgres report functions → answer + chart
             ├─ /api/lead-agent    extract → qualify → dedupe → write (HubSpot), streamed step by step
             └─ every call → lib/ai.ts logRequest() → ai_requests (tokens, cost, latency) → /metrics
           Supabase Postgres: doc_chunks (pgvector), shop_* sample data, lead_runs, ai_requests, feedback
```

Shared protections: per-IP hourly rate limit and a global daily spend cap (`lib/guard.ts`), provider spend limits set in the OpenAI and Anthropic consoles, service role key used on the server only, RLS enabled on every table.

## How each demo works

**Docs Assistant.** `npm run ingest` sparse-clones the Supabase docs, strips MDX components, splits pages by heading into ~700-token chunks with deep links, embeds them with `text-embedding-3-small` and stores them in `doc_chunks`. Re-runs only re-embed changed pages. At question time, `match_docs` merges vector similarity and Postgres full-text search with Reciprocal Rank Fusion (max 2 chunks per page). If nothing is relevant enough, the API answers "not in the docs" without calling the LLM at all.

**Dashboard analyst.** The baseline dashboard (commit "Baseline store dashboard", no AI) reads from Postgres report functions. The AI commit adds `lib/dashboard/tools.ts` (six Zod-typed tools wrapping those same functions), an "Ask your data" drawer, and a weekly summary that is generated once per week and cached. The last report the model used is charted under its answer, so numbers on screen always come from the database, not from the model.

**Lead agent.** A fixed pipeline, not an autonomous agent: the model only extracts (structured output) and scores against written criteria; deduplication and every CRM write are plain code. Each message is hashed, so a double submit never writes twice. Demo records are deleted from HubSpot after 7 days by a daily cron.

## Evals

| Command | What it measures |
|---|---|
| `npm run eval:docs` | 25 questions: retrieval hit rate, answer accuracy (LLM judge), correct refusals, latency, cost |
| `npm run eval:dashboard` | 15 questions with answers computed from the database, plus questions the data can't answer |
| `npm run eval:leads` | 12 messages in English and Romanian (spam, prompt injection, job seekers): extraction, scoring, spam kept out of the CRM |

Reports are written to `docs/`.

## Run it

```bash
cp .env.example .env.local     # fill in the keys
npm install
# apply supabase/migrations/*.sql in order (Supabase SQL editor or CLI)
npm run ingest                 # docs assistant: index the docs (~$0.01)
npm run seed:dashboard         # dashboard: sample store data
npm run setup:hubspot          # lead agent: custom contact properties (once)
npm run dev
```
