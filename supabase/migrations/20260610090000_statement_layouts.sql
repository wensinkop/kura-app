-- Shared statement layouts: AI-learned bank-statement column "recipes", shared
-- by all users. Holds NO financial data — only column positions (dateX, debitX,
-- creditX, decimal, mode, …) keyed by a format fingerprint. Any signed-in user
-- can READ (so everyone benefits once a format is learned); only Premium users
-- (who run the AI reader) may contribute.

create table if not exists public.statement_layouts (
  fingerprint text primary key,
  source text not null default 'pdf',
  layout jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  comment text
);

alter table public.statement_layouts enable row level security;

drop policy if exists sl_read on public.statement_layouts;
create policy sl_read on public.statement_layouts
  for select to authenticated using (true);

drop policy if exists sl_insert on public.statement_layouts;
create policy sl_insert on public.statement_layouts
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.subscription_tier = 'premium'));

drop policy if exists sl_update on public.statement_layouts;
create policy sl_update on public.statement_layouts
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.subscription_tier = 'premium'))
  with check (true);

grant select, insert, update on public.statement_layouts to authenticated;
