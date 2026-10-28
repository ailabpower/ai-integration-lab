-- Shared foundation: request log (latency + cost per request), rate limiting, feedback.
-- Piece 1: documentation chunks + hybrid search.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Shared: every AI call from every demo lands here
-- ---------------------------------------------------------------------------
create table if not exists ai_requests (
  id uuid primary key default gen_random_uuid(),
  demo text not null check (demo in ('docs-chat', 'dashboard', 'lead-agent')),
  provider text not null,
  model text not null,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(12, 8) not null default 0,
  latency_ms int,
  ttft_ms int,
  ok boolean not null default true,
  ip_hash text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_created_at_idx on ai_requests (created_at desc);
create index if not exists ai_requests_ip_idx on ai_requests (ip_hash, created_at desc);

create table if not exists feedback (
  id bigserial primary key,
  request_id uuid not null references ai_requests (id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (request_id)
);

-- Per-demo stats for the public /metrics page (last N days).
create or replace function demo_metrics(days int default 7)
returns table (
  demo text,
  provider text,
  requests bigint,
  p50_latency_ms int,
  p95_latency_ms int,
  p50_ttft_ms int,
  avg_cost_usd numeric,
  total_cost_usd numeric,
  thumbs_up bigint,
  thumbs_down bigint
)
language sql stable as $$
  select
    r.demo,
    r.provider,
    count(*) as requests,
    percentile_cont(0.5) within group (order by r.latency_ms)::int as p50_latency_ms,
    percentile_cont(0.95) within group (order by r.latency_ms)::int as p95_latency_ms,
    percentile_cont(0.5) within group (order by r.ttft_ms)::int as p50_ttft_ms,
    avg(r.cost_usd) as avg_cost_usd,
    sum(r.cost_usd) as total_cost_usd,
    count(f.id) filter (where f.rating = 1) as thumbs_up,
    count(f.id) filter (where f.rating = -1) as thumbs_down
  from ai_requests r
  left join feedback f on f.request_id = r.id
  where r.ok and r.created_at > now() - make_interval(days => days)
  group by r.demo, r.provider
  order by r.demo, r.provider;
$$;

-- Guard inputs: requests from this IP in the last hour, and total spend today (UTC).
create or replace function guard_stats(p_ip_hash text, p_demo text)
returns table (ip_requests_last_hour bigint, cost_today_usd numeric)
language sql stable as $$
  select
    (select count(*) from ai_requests
      where ip_hash = p_ip_hash and demo = p_demo and created_at > now() - interval '1 hour'),
    (select coalesce(sum(cost_usd), 0) from ai_requests
      where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc');
$$;

-- ---------------------------------------------------------------------------
-- Piece 1: documentation chunks
-- ---------------------------------------------------------------------------
create table if not exists doc_chunks (
  id bigserial primary key,
  path text not null,
  chunk_index int not null,
  url text not null,
  title text,
  heading text,
  content text not null,
  page_hash text not null,
  embedding vector(1536),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(heading, '') || ' ' || content)
  ) stored,
  unique (path, chunk_index)
);
create index if not exists doc_chunks_embedding_idx on doc_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists doc_chunks_fts_idx on doc_chunks using gin (fts);
create index if not exists doc_chunks_path_idx on doc_chunks (path);

-- Hybrid search: semantic + full-text, merged with Reciprocal Rank Fusion.
-- Also returns the best cosine similarity so the API can refuse when nothing is relevant.
create or replace function match_docs(
  query_embedding vector(1536),
  query_text text,
  match_count int default 6
)
returns table (
  id bigint,
  url text,
  title text,
  heading text,
  content text,
  similarity float,
  rrf_score float
)
language sql stable as $$
  with semantic as (
    select c.id, 1 - (c.embedding <=> query_embedding) as similarity,
           row_number() over (order by c.embedding <=> query_embedding) as rnk
    from doc_chunks c
    order by c.embedding <=> query_embedding
    limit 30
  ),
  keyword as (
    select c.id,
           row_number() over (order by ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) desc) as rnk
    from doc_chunks c
    where c.fts @@ websearch_to_tsquery('english', query_text)
    order by rnk
    limit 30
  )
  select c.id, c.url, c.title, c.heading, c.content,
         coalesce(s.similarity, 1 - (c.embedding <=> query_embedding)) as similarity,
         coalesce(1.0 / (60 + s.rnk), 0) + coalesce(1.0 / (60 + k.rnk), 0) as rrf_score
  from semantic s
  full outer join keyword k using (id)
  join doc_chunks c on c.id = coalesce(s.id, k.id)
  order by rrf_score desc
  limit match_count;
$$;

-- Everything is accessed server-side with the service role key. No anon access.
alter table ai_requests enable row level security;
alter table feedback enable row level security;
alter table doc_chunks enable row level security;

-- Functions are server-only too.
revoke execute on function demo_metrics(int) from anon, authenticated;
revoke execute on function guard_stats(text, text) from anon, authenticated;
revoke execute on function match_docs(vector, text, int) from anon, authenticated;
