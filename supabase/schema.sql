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
