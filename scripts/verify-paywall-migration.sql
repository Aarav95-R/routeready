-- Verifies supabase/migrations/2026-09-12-paywall.sql against the real,
-- live schema without applying it.
--
-- There is one Supabase project and the app's .env points at it, so running
-- the migration for real is a migration applied in production — where
-- `routes.steps` disappearing breaks turn-by-turn in every already-installed
-- build, and a gated `hazards` hides the data the mock test marks against.
-- The app catches up in a later task; a shipped build never catches up
-- without a release. Applying the schema is a release step the project
-- owner performs, not something a verification run does.
--
-- DDL is transactional in Postgres, so the whole migration can run for real
-- against the real schema and then be rolled back — this is free, and
-- stronger than a one-way apply, because it proves the migration against
-- production's actual data (real centres, real routes, real difficulty
-- ties) instead of against a guess at its shape.
--
-- Run: npx supabase db query --linked --file scripts/verify-paywall-migration.sql
--
-- Then confirm the rollback actually left no trace:
--   npx supabase db query --linked "select count(*) from information_schema.columns where table_name='routes' and column_name='steps'"
-- Expected: 1 — the column is still there.
begin;

-- ── One free route per centre ──────────────────────────────────────────────
alter table routes add column if not exists is_free boolean not null default false;

-- At most one. It cannot enforce *at least* one — a centre with none silently
-- becomes fully paywalled, which is the worse failure — so scripts/check-paywall.ts
-- asserts the other direction.
create unique index if not exists routes_one_free_per_centre
  on routes (centre_id) where is_free;

-- An interim pick so no centre is fully locked between this migration and the
-- next seed run. The seed script chooses deliberately; this only has to be
-- deterministic and present.
update routes set is_free = true
where id in (
  select distinct on (centre_id) id
  from routes
  order by centre_id, difficulty, name
);

-- ── The gated half of a route ──────────────────────────────────────────────
create table if not exists route_details (
  route_id uuid primary key references routes(id) on delete cascade,
  steps jsonb not null default '[]'
);

-- Guarded on the column still existing, because this statement reads
-- `routes.steps` and the last statement in this same file drops it: the
-- first run backfills from a column that is really there, and a second run
-- — with the column already gone — has to skip this rather than fail with
-- `42703: column "steps" does not exist`. PL/pgSQL only plans a branch's SQL
-- when that branch actually executes, so the `insert` inside the `if` is
-- never prepared once the column is gone.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'routes' and column_name = 'steps'
  ) then
    insert into route_details (route_id, steps)
    select id, coalesce(steps, '[]'::jsonb) from routes
    on conflict (route_id) do nothing;
  end if;
end $$;

-- ── Who has paid ───────────────────────────────────────────────────────────
-- Two statuses, not four. RevenueCat distinguishes grace and billing-retry;
-- this table does not, because the only question it answers is whether to serve
-- the route, and during grace the answer is yes. Two statuses keep the policy a
-- boolean.
create table if not exists entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('active', 'lapsed')),
  product text,
  renews_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table entitlements enable row level security;

-- Select only. Every write comes from the RevenueCat webhook under the service
-- role, which bypasses RLS; an app that could write this row could grant itself
-- the subscription.
drop policy if exists "Own entitlement" on entitlements;
create policy "Own entitlement" on entitlements
  for select to authenticated
  using (auth.uid() = user_id);

-- security definer so it can read entitlements past that policy. An empty
-- search_path would break the unqualified table name; pinning it to public is
-- what stops a caller-controlled path resolving `entitlements` elsewhere.
create or replace function is_subscribed() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from entitlements
    where user_id = auth.uid() and status = 'active'
  );
$$;

-- ── The policies that do the gating ────────────────────────────────────────
alter table route_details enable row level security;

drop policy if exists "Free or subscribed" on route_details;
create policy "Free or subscribed" on route_details
  for select to anon, authenticated
  using (
    exists (select 1 from routes r where r.id = route_details.route_id and r.is_free)
    or is_subscribed()
  );

drop policy if exists "Public read" on hazards;
drop policy if exists "Free or subscribed" on hazards;
create policy "Free or subscribed" on hazards
  for select to anon, authenticated
  using (
    exists (select 1 from routes r where r.id = hazards.route_id and r.is_free)
    or is_subscribed()
  );

-- Last, and only after the backfill above.
alter table routes drop column if exists steps;

-- ── Shape checks, the same three scripts/check-paywall.ts runs ─────────────
-- One row, all three at once — `db query --linked` only surfaces the result
-- of the final statement in a multi-statement file, so three separate
-- selects would show only the last of them.
-- Expected: steps_col = 0, orphaned = 0, bad_centres = 0.
select
  (select count(*)::int from information_schema.columns
     where table_name = 'routes' and column_name = 'steps') as steps_col,
  (select count(*)::int from routes r
     left join route_details d on d.route_id = r.id
     where d.route_id is null) as orphaned,
  (select count(*)::int from (
     select centre_id from routes group by centre_id
     having count(*) filter (where is_free) <> 1
   ) bad) as bad_centres;

-- Proves the migration without applying it: everything above runs for real
-- against the real schema and real data, then every bit of it is undone.
rollback;
