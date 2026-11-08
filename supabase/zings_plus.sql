-- zingd: Snapchat-style zings. 24 hours or keep, memories, views, reactions and streaks. Safe to re-run.

-- Keep: the zing stays on your profile and the charger's gallery after its 24 hours on the live map and feed.
alter table public.checkins add column if not exists keep boolean not null default false;

-- Others only see a zing while it's live, or forever if you kept it. You always see your own (your Memories).
drop policy if exists "read checkins" on public.checkins;
create policy "read checkins" on public.checkins for select
  using (user_id = auth.uid() or (not hidden and (keep or expires_at > now())));
-- You can switch keep on or off for your own zings later.
grant update (keep) on public.checkins to authenticated;
drop policy if exists "own checkin keep" on public.checkins;
create policy "own checkin keep" on public.checkins for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Who watched: each viewer once. Only the zing's owner sees the count and names.
create table if not exists public.zing_views (
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  viewed_at timestamptz not null default now(),
  primary key (checkin_id, viewer_id)
);
alter table public.zing_views enable row level security;
drop policy if exists "log my view" on public.zing_views;
create policy "log my view" on public.zing_views for insert to authenticated with check (viewer_id = auth.uid());
drop policy if exists "owner sees views" on public.zing_views;
create policy "owner sees views" on public.zing_views for select to authenticated
  using (exists (select 1 from public.checkins c where c.id = checkin_id and c.user_id = auth.uid()));

-- Quick reactions on a zing.
create table if not exists public.zing_reactions (
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  emoji text not null check (emoji in ('🔥', '⚡', '❤️', '😂', '🙌')),
  created_at timestamptz not null default now(),
  primary key (checkin_id, user_id, emoji)
);
alter table public.zing_reactions enable row level security;
drop policy if exists "read zing reactions" on public.zing_reactions;
create policy "read zing reactions" on public.zing_reactions for select using (true);
drop policy if exists "react to zing" on public.zing_reactions;
create policy "react to zing" on public.zing_reactions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "unreact zing" on public.zing_reactions;
create policy "unreact zing" on public.zing_reactions for delete to authenticated using (user_id = auth.uid());

-- Streak: days in a row (India time) with at least one zing, counting today or yesterday.
create or replace function public.zing_streak(u uuid) returns int
language sql stable security definer set search_path = public as $$
  with d as (
    select distinct (created_at at time zone 'Asia/Kolkata')::date as day from checkins where user_id = u and not hidden
  ), s as (
    select day, day - (row_number() over (order by day))::int as grp from d
  ), latest as (
    select grp from s where day >= (now() at time zone 'Asia/Kolkata')::date - 1 order by day desc limit 1
  )
  select coalesce((select count(*) from s where grp = (select grp from latest)), 0)::int
$$;
grant execute on function public.zing_streak(uuid) to anon, authenticated;
