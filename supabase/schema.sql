-- Enable PostGIS for GeoJSON queries (optional but recommended)
create extension if not exists postgis;

create table test_centres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  pass_rate double precision,
  test_types text[] default '{}',
  region text,
  created_at timestamptz default now()
);

create table routes (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid references test_centres(id) on delete cascade,
  name text not null,
  geometry jsonb not null, -- GeoJSON LineString
  estimated_minutes int,
  distance_km double precision,
  difficulty int check (difficulty between 1 and 5),
  created_at timestamptz default now()
);

create table hazards (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references routes(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  type text not null, -- 'roundabout', 'zebra', 'narrow', 'junction'
  description text not null,
  severity text check (severity in ('low', 'medium', 'high')),
  created_at timestamptz default now()
);

create table user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  route_id uuid references routes(id),
  completed_at timestamptz default now(),
  mock_test_score int,
  mistakes text[] default '{}',
  duration_seconds int,
  created_at timestamptz default now()
);

create table manoeuvres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  steps jsonb not null default '[]',
  tips text[] default '{}'
);

create table show_me_tell_me (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  question text not null,
  answer text not null,
  is_show_me boolean not null default false
);

-- RLS Policies
alter table test_centres enable row level security;
alter table routes enable row level security;
alter table hazards enable row level security;
alter table user_progress enable row level security;
alter table manoeuvres enable row level security;
alter table show_me_tell_me enable row level security;

-- Everyone can read centres, routes, hazards, manoeuvres, questions
create policy "Public read" on test_centres for select to anon, authenticated using (true);
create policy "Public read" on routes for select to anon, authenticated using (true);
create policy "Public read" on hazards for select to anon, authenticated using (true);
create policy "Public read" on manoeuvres for select to anon, authenticated using (true);
create policy "Public read" on show_me_tell_me for select to anon, authenticated using (true);

-- Users can only CRUD their own progress
create policy "Own progress" on user_progress
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Phase 1 deltas
alter table test_centres add column if not exists pass_rate_history jsonb default '[]';
alter table routes add column if not exists speed_profile jsonb default '[]';
alter table routes add column if not exists observation_zones jsonb default '[]';
alter table routes add column if not exists steps jsonb default '[]';

create table if not exists favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  route_id uuid references routes(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, route_id)
);
alter table favourites enable row level security;
create policy "Own favourites" on favourites
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Phase 2 deltas — the quiz.
--
-- `topic` is a column rather than something derived from the question text.
-- Every question opens with the same six words, so the list needs a subject to
-- lead each row with; stripping "Tell me how you'd…" and re-casing the rest
-- works for about two thirds of them and produces "Know if there was a problem
-- with your anti-lock braking system" for the others.
--
-- `choices` holds [{ "text": "...", "correct": true|false }] — four per
-- question, exactly one correct. The DVSA publishes no wrong answers, because
-- the real test is verbal; these are written for this app.
alter table show_me_tell_me add column if not exists topic text;
alter table show_me_tell_me add column if not exists choices jsonb default '[]';

-- Phase 3 deltas — the paywall.
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
alter table routes add column if not exists is_free boolean not null default false;

-- At most one. It cannot enforce *at least* one — a centre with none silently
-- becomes fully paywalled, which is the worse failure — so scripts/check-paywall.ts
-- asserts the other direction.
create unique index if not exists routes_one_free_per_centre
  on routes (centre_id) where is_free;

create table if not exists route_details (
  route_id uuid primary key references routes(id) on delete cascade,
  steps jsonb not null default '[]'
);

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

alter table route_details enable row level security;

create policy "Free or subscribed" on route_details
  for select to anon, authenticated
  using (
    exists (select 1 from routes r where r.id = route_details.route_id and r.is_free)
    or is_subscribed()
  );

-- Postgres combines permissive policies for the same command with OR, so
-- leaving hazards' Phase 1 "Public read" policy in place would make this
-- policy's condition irrelevant: `using (true) OR (...)` is always true.
-- Dropped here, matching the migration, not left as a comment saying so.
drop policy if exists "Public read" on hazards;
create policy "Free or subscribed" on hazards
  for select to anon, authenticated
  using (
    exists (select 1 from routes r where r.id = hazards.route_id and r.is_free)
    or is_subscribed()
  );

-- Last, and only after the backfill the migration runs.
alter table routes drop column if exists steps;
