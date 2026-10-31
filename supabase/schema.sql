-- ChargeMap community: database schema
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- ───────────────────────── Profiles ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  car_model text check (char_length(car_model) <= 40),
  city text check (char_length(city) <= 40),
  accepted_guidelines_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ───────────────────────── Chargers ─────────────────────────
-- Holds seeded and community chargers, plus a copy of any Open Charge Map
-- charger the moment someone checks in, reviews or marks facilities on it.
create table if not exists public.chargers (
  id text primary key,                 -- 'ocm-123', 'hyd-...' or 'c-...'
  name text not null,
  network text not null default 'other',
  lat double precision not null,
  lng double precision not null,
  address text,
  power_kw real,
  connectors text[] default '{}',
  speed text default 'unknown',        -- 'dc' | 'ac' | 'dcac' | 'unknown'
  source text not null default 'community',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists chargers_lat_lng on public.chargers (lat, lng);

-- ───────────────────────── Zaps: live status + photo that disappears after 24 h ─────────────────────────
-- user_id points at profiles so the app can show each poster's name and car.
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  charger_id text not null references public.chargers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('working', 'busy', 'broken')),
  note text check (char_length(note) <= 200),
  photo_path text,
  look text,                           -- cinematic look the zap was posted with
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists checkins_charger_time on public.checkins (charger_id, created_at desc);
create index if not exists checkins_expiry on public.checkins (expires_at);

-- ───────────────────────── Reviews ─────────────────────────
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  charger_id text not null references public.chargers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  tags text[] not null default '{}',
  body text check (char_length(body) <= 600),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (charger_id, user_id)
);

create table if not exists public.review_votes (
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (review_id, user_id)
);

-- ───────────────────────── Facilities ─────────────────────────
create table if not exists public.facility_votes (
  charger_id text not null references public.chargers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  facility text not null check (facility in
    ('washroom', 'cafe', 'parking', 'open_24x7', 'covered', 'security', 'accessible', 'wifi', 'waiting_area')),
  value boolean not null,
  updated_at timestamptz not null default now(),
  primary key (charger_id, user_id, facility)
);

-- ───────────────────────── Food tips ─────────────────────────
create table if not exists public.food_tips (
  id uuid primary key default gen_random_uuid(),
  charger_id text not null references public.chargers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  note text check (char_length(note) <= 160),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Safety: reports and blocks ─────────────────────────
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('checkin', 'review', 'food_tip', 'user')),
  target_id text not null,
  reason text not null check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_kind, target_id)
);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

-- Hide content automatically once 3 different people report it.
create or replace function public.auto_hide_reported() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.reports
   where target_kind = new.target_kind and target_id = new.target_id;
  if n >= 3 then
    if new.target_kind = 'checkin' then update public.checkins set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'review' then update public.reviews set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'food_tip' then update public.food_tips set hidden = true where id::text = new.target_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists reports_auto_hide on public.reports;
create trigger reports_auto_hide after insert on public.reports
  for each row execute function public.auto_hide_reported();

-- ───────────────────────── Summary views ─────────────────────────
create or replace view public.charger_ratings with (security_invoker = on) as
  select charger_id, round(avg(rating)::numeric, 1) as avg_rating, count(*)::int as review_count
  from public.reviews where not hidden group by charger_id;

create or replace view public.charger_facilities with (security_invoker = on) as
  select charger_id, facility,
         count(*) filter (where value)::int as yes,
         count(*) filter (where not value)::int as no
  from public.facility_votes group by charger_id, facility;

create or replace view public.review_tags with (security_invoker = on) as
  select charger_id, tag, count(*)::int as n
  from public.reviews, unnest(tags) as tag where not hidden group by charger_id, tag;

-- driver_points is defined in the Zap Score section at the end of this file.

-- ───────────────────────── Row security ─────────────────────────
alter table public.profiles enable row level security;
alter table public.chargers enable row level security;
alter table public.checkins enable row level security;
alter table public.reviews enable row level security;
alter table public.review_votes enable row level security;
alter table public.facility_votes enable row level security;
alter table public.food_tips enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;

-- Anyone, signed in or not, can read public content.
create policy "read profiles" on public.profiles for select using (true);
create policy "read chargers" on public.chargers for select using (true);
create policy "read checkins" on public.checkins for select using (not hidden or user_id = auth.uid());
create policy "read reviews" on public.reviews for select using (not hidden or user_id = auth.uid());
create policy "read review votes" on public.review_votes for select using (true);
create policy "read facility votes" on public.facility_votes for select using (true);
create policy "read food tips" on public.food_tips for select using (not hidden or user_id = auth.uid());

-- People write and change only their own rows.
create policy "own profile insert" on public.profiles for insert with check (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid());

create policy "add chargers" on public.chargers for insert to authenticated with check (true);

create policy "own checkin insert" on public.checkins for insert with check (user_id = auth.uid());
create policy "own checkin delete" on public.checkins for delete using (user_id = auth.uid());

create policy "own review insert" on public.reviews for insert with check (user_id = auth.uid());
create policy "own review update" on public.reviews for update using (user_id = auth.uid());
create policy "own review delete" on public.reviews for delete using (user_id = auth.uid());

create policy "own vote insert" on public.review_votes for insert with check (user_id = auth.uid());
create policy "own vote delete" on public.review_votes for delete using (user_id = auth.uid());

create policy "own facility insert" on public.facility_votes for insert with check (user_id = auth.uid());
create policy "own facility update" on public.facility_votes for update using (user_id = auth.uid());

create policy "own tip insert" on public.food_tips for insert with check (user_id = auth.uid());
create policy "own tip delete" on public.food_tips for delete using (user_id = auth.uid());

create policy "own report insert" on public.reports for insert with check (reporter_id = auth.uid());

create policy "own blocks read" on public.blocks for select using (blocker_id = auth.uid());
create policy "own blocks insert" on public.blocks for insert with check (blocker_id = auth.uid());
create policy "own blocks delete" on public.blocks for delete using (blocker_id = auth.uid());

-- ───────────────────────── Photo storage ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('snaps', 'snaps', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "snaps upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'snaps' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "snaps delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'snaps' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────────────────── Account deletion (required by Apple) ─────────────────────────
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ───────────────────────── EV verification ─────────────────────────
-- Profiles carry a public "verified EV" flag; the vehicle number itself stays private.
alter table public.profiles add column if not exists vehicle_verified boolean not null default false;

-- People may write only these profile columns; vehicle_verified is set by the verify-vehicle function.
revoke insert, update on public.profiles from authenticated, anon;
grant insert (id, display_name, car_model, city, accepted_guidelines_at) on public.profiles to authenticated;
grant update (display_name, car_model, city) on public.profiles to authenticated;

create table if not exists public.vehicles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reg_number text not null unique,     -- normalised, e.g. TS09EV1234
  fuel_type text,                      -- from the RTO record, when checked
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.vehicles enable row level security;
create policy "own vehicle read" on public.vehicles for select using (user_id = auth.uid());
-- Writes go only through the verify-vehicle function (service role), never straight from the app.

-- ───────────────────────── Connections between drivers ─────────────────────────
create table if not exists public.connections (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
alter table public.connections enable row level security;
create policy "see own connections" on public.connections for select
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "send request" on public.connections for insert
  with check (requester_id = auth.uid() and status = 'pending'
    and not exists (select 1 from public.blocks b where b.blocker_id = addressee_id and b.blocked_id = auth.uid()));
create policy "accept request" on public.connections for update
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid() and status = 'accepted');
create policy "remove connection" on public.connections for delete
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create or replace view public.connection_counts with (security_invoker = on) as
  select p.id as user_id,
    (select count(*) from public.connections c
      where c.status = 'accepted' and (c.requester_id = p.id or c.addressee_id = p.id))::int as connections
  from public.profiles p;
-- Counts are public, so the view reads past row security on purpose.
alter view public.connection_counts set (security_invoker = off);

-- ───────────────────────── Zap Score ─────────────────────────
-- Every zap earns points, and more the closer the photo was taken to the charger.
-- The app sends where the phone was when the zap was posted; the database works out
-- the distance and the score, then throws the coordinates away. Only the distance is kept,
-- so nobody can read another driver's location. Clients can't set the score themselves:
-- this trigger overwrites whatever they send.
alter table public.checkins add column if not exists taken_lat double precision;   -- input only, cleared on insert
alter table public.checkins add column if not exists taken_lng double precision;   -- input only, cleared on insert
alter table public.checkins add column if not exists taken_accuracy_m real;         -- input only, cleared on insert
alter table public.checkins add column if not exists taken_mocked boolean;          -- input only, cleared on insert
alter table public.checkins add column if not exists distance_m int;               -- metres from the charger, kept
alter table public.checkins add column if not exists zap_score int not null default 0;
alter table public.checkins add column if not exists score_breakdown jsonb not null default '[]';

-- Great-circle distance in metres.
create or replace function public.distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create or replace function public.score_zap() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c record;
  d float8;
  base int; label text;
  parts jsonb := '[]';
  total int := 0;
  today int;
  daily_cap constant int := 600;
begin
  -- Distance from the charger.
  select lat, lng into c from public.chargers where id = new.charger_id;
  if new.taken_lat is not null and new.taken_lng is not null and c.lat is not null then
    d := public.distance_m(new.taken_lat, new.taken_lng, c.lat, c.lng);
    new.distance_m := round(d)::int;
  else
    new.distance_m := null;
  end if;

  -- Base points by distance. A fuzzy GPS fix (worse than 150 m) or a faked location
  -- can't claim the top tiers.
  if new.distance_m is null or coalesce(new.taken_mocked, false) then
    base := 5;   label := 'Location unknown';
  elsif new.distance_m <= 60 and coalesce(new.taken_accuracy_m, 0) <= 150 then
    base := 100; label := 'At the plug';
  elsif new.distance_m <= 200 and coalesce(new.taken_accuracy_m, 0) <= 150 then
    base := 60;  label := 'At the station';
  elsif new.distance_m <= 1000 then
    base := 25;  label := 'Nearby';
  else
    base := 5;   label := 'Far from the charger';
  end if;
  parts := parts || jsonb_build_object('label', label, 'points', base);
  total := base;

  -- Photo bonus.
  if new.photo_path is not null then
    parts := parts || jsonb_build_object('label', 'Photo', 'points', 20);
    total := total + 20;
  end if;

  -- Fresh info: nobody else zapped this charger in the last 3 hours. Only counts on site.
  if base >= 60 and not exists (
    select 1 from public.checkins x
     where x.charger_id = new.charger_id and x.user_id <> new.user_id
       and not x.hidden and x.created_at > now() - interval '3 hours') then
    parts := parts || jsonb_build_object('label', 'Fresh info', 'points', 25);
    total := total + 25;
  end if;

  -- No points for zapping the same charger again within 3 hours.
  if exists (
    select 1 from public.checkins x
     where x.charger_id = new.charger_id and x.user_id = new.user_id
       and x.zap_score > 0 and x.created_at > now() - interval '3 hours') then
    parts := jsonb_build_array(jsonb_build_object('label', 'Already zapped here in the last 3 hours', 'points', 0));
    total := 0;
  end if;

  -- Daily cap.
  select coalesce(sum(zap_score), 0) into today from public.checkins
   where user_id = new.user_id and created_at > date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  if total > 0 and today + total > daily_cap then
    parts := parts || jsonb_build_object('label', 'Daily limit reached', 'points', greatest(daily_cap - today, 0) - total);
    total := greatest(daily_cap - today, 0);
  end if;

  new.zap_score := total;
  new.score_breakdown := parts;
  -- Throw the location away.
  new.taken_lat := null; new.taken_lng := null; new.taken_accuracy_m := null; new.taken_mocked := null;
  return new;
end $$;
drop trigger if exists checkins_score on public.checkins;
create trigger checkins_score before insert on public.checkins
  for each row execute function public.score_zap();

-- Driver points: Zap Score from zaps that weren't hidden by reports, plus the other contributions.
create or replace view public.driver_points with (security_invoker = on) as
  select p.id as user_id,
    coalesce((select sum(c.zap_score) from public.checkins c where c.user_id = p.id and not c.hidden), 0)::int
  + (select count(*) from public.reviews r where r.user_id = p.id)::int * 10
  + (select count(*) from public.facility_votes f where f.user_id = p.id)::int * 2
  + (select count(*) from public.food_tips t where t.user_id = p.id)::int * 5 as points
  from public.profiles p;

-- Weekly leaderboard per city (Monday to Sunday, India time).
create or replace view public.zap_leaderboard as
  select p.id as user_id, p.display_name, p.car_model, p.city, p.vehicle_verified,
         sum(c.zap_score)::int as week_score, count(*)::int as week_zaps
  from public.checkins c join public.profiles p on p.id = c.user_id
  where not c.hidden
    and c.created_at >= date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
  group by p.id;

-- ───────────────────────── Problem reports on zaps ─────────────────────────
-- When a charger is busy or not working, drivers can say what's wrong.
alter table public.checkins add column if not exists issue text
  check (issue in ('not_starting', 'payment', 'cable_damaged', 'ice_parked', 'slow', 'queue', 'no_power', 'app_down'));
create index if not exists checkins_issue on public.checkins (charger_id, created_at desc) where issue is not null;
