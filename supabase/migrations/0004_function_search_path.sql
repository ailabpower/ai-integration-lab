-- Pin search_path on every function (Supabase security advisor: function_search_path_mutable).
alter function demo_metrics(int) set search_path = public;
alter function guard_stats(text, text) set search_path = public;
alter function match_docs(vector, text, int) set search_path = public;
alter function dash_kpis(date, date) set search_path = public;
alter function dash_revenue_over_time(date, date, text, text) set search_path = public;
alter function dash_top_products(date, date, text, int) set search_path = public;
alter function dash_sales_by_category(date, date) set search_path = public;
alter function dash_customer_stats(date, date) set search_path = public;
alter function dash_returns_rate(date, date, text) set search_path = public;
