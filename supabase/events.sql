-- zappd Clubs: Events. Meetups, drives and charging hangouts with sign-ups. Run after clubs.sql. Safe to re-run.

create table if not exists public.club_events (
  id uuid primary key default gen_random_uuid(),
  club_id text not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 4 and 80),
  description text check (char_length(description) <= 2000),
  kind text not null default 'meetup' check (kind in ('meetup', 'drive', 'charging', 'other')),
  starts_at timestamptz not null,
  place_name text check (char_length(place_name) <= 120),
  lat double precision not null,
  lng double precision not null,
  destination text check (char_length(destination) <= 120),
  max_people int check (max_people is null or max_people between 2 and 500),
  cancelled boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists club_events_time on public.club_events (starts_at);
create index if not exists club_events_club on public.club_events (club_id, starts_at);

create table if not exists public.club_event_rsvps (
  event_id uuid not null references public.club_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'going' check (status in ('going', 'interested')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create or replace function public.club_is_open(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clubs where id = c and (not is_private or public.is_club_member(c)))
$$;
create or replace function public.event_club(e uuid) returns text
language sql stable security definer set search_path = public as $$ select club_id from public.club_events where id = e $$;

-- Full events can't take more "going".
create or replace function public.rsvp_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap int; n int;
begin
  if new.status = 'going' then
    select max_people into cap from public.club_events where id = new.event_id;
    if cap is not null then
      select count(*) into n from public.club_event_rsvps where event_id = new.event_id and status = 'going' and user_id <> new.user_id;
      if n >= cap then raise exception 'This event is full.'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists club_event_rsvps_guard on public.club_event_rsvps;
create trigger club_event_rsvps_guard before insert or update on public.club_event_rsvps for each row execute function public.rsvp_guard();

alter table public.club_events enable row level security;
alter table public.club_event_rsvps enable row level security;

-- Events of public clubs are visible to everyone (they show on the map); private ones to members.
drop policy if exists "read events" on public.club_events;
create policy "read events" on public.club_events for select using (not hidden and public.club_is_open(club_id));
drop policy if exists "members host events" on public.club_events;
create policy "members host events" on public.club_events for insert to authenticated with check (user_id = auth.uid() and public.is_club_member(club_id));
drop policy if exists "host or admin edits event" on public.club_events;
create policy "host or admin edits event" on public.club_events for update to authenticated
  using (user_id = auth.uid() or public.is_club_admin(club_id)) with check (user_id = auth.uid() or public.is_club_admin(club_id));

drop policy if exists "read rsvps" on public.club_event_rsvps;
create policy "read rsvps" on public.club_event_rsvps for select using (public.club_is_open(public.event_club(event_id)));
drop policy if exists "rsvp" on public.club_event_rsvps;
create policy "rsvp" on public.club_event_rsvps for insert to authenticated with check (user_id = auth.uid() and public.club_is_open(public.event_club(event_id)));
drop policy if exists "change rsvp" on public.club_event_rsvps;
create policy "change rsvp" on public.club_event_rsvps for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "drop rsvp" on public.club_event_rsvps;
create policy "drop rsvp" on public.club_event_rsvps for delete to authenticated using (user_id = auth.uid());

drop view if exists public.club_event_list;
create view public.club_event_list with (security_invoker = on) as
  select e.*, c.name as club_name, c.kind as club_kind, c.make as club_make, c.emoji as club_emoji, c.color as club_color,
    (select count(*) from public.club_event_rsvps r where r.event_id = e.id and r.status = 'going')::int as going,
    (select count(*) from public.club_event_rsvps r where r.event_id = e.id and r.status = 'interested')::int as interested
  from public.club_events e join public.clubs c on c.id = e.club_id;

alter table public.reports drop constraint if exists reports_target_kind_check;
alter table public.reports add constraint reports_target_kind_check
  check (target_kind in ('checkin', 'review', 'food_tip', 'user', 'club_message', 'club_post', 'club_reply', 'club_event'));
create or replace function public.auto_hide_reported() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.reports where target_kind = new.target_kind and target_id = new.target_id;
  if n >= 3 then
    if new.target_kind = 'checkin' then update public.checkins set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'review' then update public.reviews set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'food_tip' then update public.food_tips set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'club_message' then update public.club_messages set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'club_post' then update public.club_posts set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'club_reply' then update public.club_replies set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'club_event' then update public.club_events set hidden = true where id::text = new.target_id;
    end if;
  end if;
  return new;
end $$;
