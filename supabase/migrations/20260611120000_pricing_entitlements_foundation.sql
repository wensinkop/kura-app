-- Smara monetization foundation (Session 17, Phase 0). Additive only.
-- NOTE: applied to the remote project (ref dsdptauowyxgvdsxzhfx) via the Supabase
-- MCP apply_migration on 2026-06-11. This file is the version-controlled record.

-- 1) profiles: entitlement source fields (entitlement is COMPUTED from these).
alter table public.profiles
  add column if not exists trial_ends_at timestamptz,
  add column if not exists lifetime boolean not null default false,
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists plan_source text;  -- 'trial'|'monthly'|'annual'|'lifetime'|'manual'|null

-- 2) promo_codes: Founding Lifetime Deal access-gate codes. Server-managed only.
create table if not exists public.promo_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  email       text not null,
  kind        text not null default 'lifetime' check (kind in ('lifetime')),
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists promo_codes_email_idx on public.promo_codes (lower(email));
alter table public.promo_codes enable row level security;
-- No client policies: only the service role (edge functions) reads/writes this table.

-- 3) purchases / entitlements (Play / App Store / manual / promo).
create table if not exists public.purchases (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  product      text not null check (product in ('monthly','annual','lifetime')),
  source       text not null check (source in ('play','appstore','manual','promo')),
  store_txn_id text,
  status       text not null default 'active' check (status in ('active','expired','refunded','grace')),
  promo_code   text,
  purchased_at timestamptz not null default now(),
  expires_at   timestamptz,  -- null for lifetime
  created_at   timestamptz not null default now()
);
create unique index if not exists purchases_store_txn_uniq
  on public.purchases (source, store_txn_id) where store_txn_id is not null;
create index if not exists purchases_user_idx on public.purchases (user_id);
alter table public.purchases enable row level security;
create policy "purchases_select_own" on public.purchases
  for select to authenticated using (user_id = auth.uid());
-- inserts/updates server-side only (service role bypasses RLS).

-- 4) app_config: launch flags incl. the LTD cap + cutoff.
create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
create policy "app_config_read" on public.app_config
  for select to authenticated using (true);
-- writes server-side / admin only.

insert into public.app_config (key, value) values
  ('ltd', '{"cap":500,"cutoff":"2026-12-31","enabled":true}'::jsonb)
on conflict (key) do nothing;
