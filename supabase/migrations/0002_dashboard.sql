-- Piece 2: a small e-commerce dataset behind an admin dashboard.
-- The dashboard and the AI analyst read it only through the stable (read-only) functions below.

create table if not exists shop_customers (
  id int primary key,
  name text not null,
  country text not null,
  segment text not null check (segment in ('consumer', 'business')),
  created_at timestamptz not null
);

create table if not exists shop_products (
  id int primary key,
  name text not null,
  category text not null,
  price numeric(10, 2) not null
);

create table if not exists shop_orders (
  id int primary key,
  customer_id int not null references shop_customers (id),
  created_at timestamptz not null,
  status text not null check (status in ('completed', 'returned'))
);
create index if not exists shop_orders_created_at_idx on shop_orders (created_at);

create table if not exists shop_order_items (
  order_id int not null references shop_orders (id) on delete cascade,
  product_id int not null references shop_products (id),
  quantity int not null check (quantity > 0),
  unit_price numeric(10, 2) not null,
  primary key (order_id, product_id)
);

-- One row per order line, with everything the reports need.
create or replace view shop_sales as
select
  o.id as order_id,
  o.created_at,
  o.customer_id,
  o.status,
  p.id as product_id,
  p.name as product,
  p.category,
  i.quantity,
  i.quantity * i.unit_price as revenue
from shop_order_items i
join shop_orders o on o.id = i.order_id
join shop_products p on p.id = i.product_id;

-- Headline numbers for a period. Revenue counts completed orders only.
create or replace function dash_kpis(p_from date, p_to date)
returns table (revenue numeric, orders bigint, avg_order_value numeric, new_customers bigint, return_rate numeric)
language sql stable as $$
  with o as (
    select o.id, o.status, sum(i.quantity * i.unit_price) as total
    from shop_orders o join shop_order_items i on i.order_id = o.id
    where o.created_at >= p_from and o.created_at < p_to + 1
    group by o.id, o.status
  )
  select
    coalesce(sum(total) filter (where status = 'completed'), 0)::numeric(14, 2),
    count(*) filter (where status = 'completed'),
    coalesce(avg(total) filter (where status = 'completed'), 0)::numeric(14, 2),
    (select count(*) from shop_customers c where c.created_at >= p_from and c.created_at < p_to + 1),
    case when count(*) = 0 then 0 else round(count(*) filter (where status = 'returned')::numeric / count(*), 4) end
  from o;
$$;

create or replace function dash_revenue_over_time(p_from date, p_to date, p_granularity text default 'week', p_category text default null)
returns table (period date, revenue numeric, orders bigint)
language sql stable as $$
  select
    date_trunc(case when p_granularity in ('day', 'week', 'month') then p_granularity else 'week' end, s.created_at)::date as period,
    sum(s.revenue)::numeric(14, 2),
    count(distinct s.order_id)
  from shop_sales s
  where s.status = 'completed'
    and s.created_at >= p_from and s.created_at < p_to + 1
    and (p_category is null or s.category ilike p_category)
  group by 1
  order by 1;
$$;

create or replace function dash_top_products(p_from date, p_to date, p_metric text default 'revenue', p_limit int default 10)
returns table (product text, category text, revenue numeric, units bigint)
language sql stable as $$
  select s.product, s.category, sum(s.revenue)::numeric(14, 2), sum(s.quantity)
  from shop_sales s
  where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to + 1
  group by s.product, s.category
  order by case when p_metric = 'units' then sum(s.quantity) else sum(s.revenue) end desc
  limit least(greatest(p_limit, 1), 20);
$$;

create or replace function dash_sales_by_category(p_from date, p_to date)
returns table (category text, revenue numeric, orders bigint, share numeric)
language sql stable as $$
  select s.category, sum(s.revenue)::numeric(14, 2), count(distinct s.order_id),
         round(sum(s.revenue) / nullif(sum(sum(s.revenue)) over (), 0), 4)
  from shop_sales s
  where s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to + 1
  group by s.category
  order by 2 desc;
$$;

create or replace function dash_customer_stats(p_from date, p_to date)
returns table (buying_customers bigint, new_customers bigint, returning_customers bigint, avg_orders_per_customer numeric)
language sql stable as $$
  with buyers as (
    select o.customer_id, count(*) as n, min(c.created_at) as signed_up
    from shop_orders o join shop_customers c on c.id = o.customer_id
    where o.status = 'completed' and o.created_at >= p_from and o.created_at < p_to + 1
    group by o.customer_id
  )
  select count(*),
         count(*) filter (where signed_up >= p_from),
         count(*) filter (where signed_up < p_from),
         round(avg(n), 2)
  from buyers;
$$;

create or replace function dash_returns_rate(p_from date, p_to date, p_group_by text default 'category')
returns table (name text, orders bigint, returned bigint, return_rate numeric)
language sql stable as $$
  select case when p_group_by = 'product' then s.product else s.category end,
         count(distinct s.order_id),
         count(distinct s.order_id) filter (where s.status = 'returned'),
         round(count(distinct s.order_id) filter (where s.status = 'returned')::numeric / nullif(count(distinct s.order_id), 0), 4)
  from shop_sales s
  where s.created_at >= p_from and s.created_at < p_to + 1
  group by 1
  having count(distinct s.order_id) >= 10
  order by 4 desc
  limit 20;
$$;

-- Cached AI weekly summary, so page views don't trigger a model call each time.
create table if not exists dash_ai_summaries (
  week_start date primary key,
  provider text not null,
  model text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

alter table shop_customers enable row level security;
alter table shop_products enable row level security;
alter table shop_orders enable row level security;
alter table shop_order_items enable row level security;
alter table dash_ai_summaries enable row level security;
revoke all on shop_sales from anon, authenticated;
revoke execute on function dash_kpis(date, date) from anon, authenticated;
revoke execute on function dash_revenue_over_time(date, date, text, text) from anon, authenticated;
revoke execute on function dash_top_products(date, date, text, int) from anon, authenticated;
revoke execute on function dash_sales_by_category(date, date) from anon, authenticated;
revoke execute on function dash_customer_stats(date, date) from anon, authenticated;
revoke execute on function dash_returns_rate(date, date, text) from anon, authenticated;
