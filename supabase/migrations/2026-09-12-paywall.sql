-- The paywall: one free route per centre, the rest behind a subscription.
--
-- Safe to re-run.
--
-- The gate is two things and only two: `routes.steps` and a route's `hazards`.
-- Everything else on the row stays public, because the route cards are built
-- from it — `plainSummary` in src/lib/routeSummary.ts derives the card's second
-- line from `speed_profile` and `observation_zones`, so gating either would
-- collapse every locked card to "A steady drive around the area." and blank the
-- thumbnail's pins, while withholding nothing anyone could drive from.
--
-- `steps` moves to a table of its own rather than staying a column, because RLS
-- is row-level: a field that must be withheld has to live in a row. The column
-- is then dropped, not left behind — leaving it means `select("*")` keeps
-- serving the one thing this migration exists to withhold, and the leak would
-- be invisible because the client reads the new table and looks correct.
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

commit;
