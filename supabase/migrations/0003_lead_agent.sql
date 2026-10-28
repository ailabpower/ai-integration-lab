-- Piece 3: every processed form or email, what the agent decided, and what it wrote to the CRM.

create table if not exists lead_runs (
  id uuid primary key default gen_random_uuid(),
  input_hash text not null unique,      -- idempotency: the same text is never processed twice
  source text not null check (source in ('form', 'email')),
  input_text text not null,
  extracted jsonb,
  qualification jsonb,
  decision text not null check (decision in ('created', 'updated', 'review', 'spam', 'error')),
  crm_contact_id text,
  crm_company_id text,
  crm_deal_id text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lead_runs_created_at_idx on lead_runs (created_at desc);
create index if not exists lead_runs_review_idx on lead_runs (decision) where decision = 'review';

alter table lead_runs enable row level security;
