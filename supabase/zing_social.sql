-- zingd: send zings to friends, friend streaks, daily challenge. Run after dms.sql, gifs.sql, zing_video.sql. Safe to re-run.

-- A zing can be sent straight to friends (shows as a tile in your chat).
alter table public.dm_messages add column if not exists zing_id uuid references public.checkins(id) on delete cascade;
alter table public.dm_messages drop constraint if exists dm_messages_content_check;
alter table public.dm_messages add constraint dm_messages_content_check
  check (deleted or body is not null or photo_path is not null or gif_url is not null or sticker is not null or zing_id is not null);

-- Audience "direct": only the people you sent it to (plus you) can see it.
alter table public.checkins drop constraint if exists checkins_audience_check;
alter table public.checkins add constraint checkins_audience_check check (audience in ('public', 'crew', 'direct'));
alter table public.checkins add column if not exists challenge text check (challenge is null or challenge ~ '^[a-z0-9_]{2,40}$');

create or replace function public.zing_sent_to_me(z uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dm_messages m join dm_threads t on t.id = m.thread_id
                  where m.zing_id = z and auth.uid() in (t.user_a, t.user_b))
$$;
drop policy if exists "read checkins" on public.checkins;
create policy "read checkins" on public.checkins for select using (
  user_id = auth.uid()
  or (not hidden and (
       ((keep or expires_at > now()) and (audience = 'public' or (audience = 'crew' and public.is_connected(user_id))))
       or public.zing_sent_to_me(id)
     ))
);

-- 🔥 Zing streaks: days in a row (India time) where you and a friend BOTH sent each other a zing,
-- counting today or yesterday. One row per chat.
create or replace function public.zing_streaks()
returns table (thread_id uuid, days int, last_day date)
language sql stable security definer set search_path = public as $$
  with mine as (select id from dm_threads where auth.uid() in (user_a, user_b)),
  d as (
    select m.thread_id, (m.created_at at time zone 'Asia/Kolkata')::date as day, count(distinct m.user_id) as people
      from dm_messages m join mine on mine.id = m.thread_id
     where m.zing_id is not null and not m.deleted and m.created_at > now() - interval '400 days'
     group by 1, 2
  ),
  both_days as (select thread_id, day from d where people = 2),
  s as (select thread_id, day, day - (row_number() over (partition by thread_id order by day))::int as grp from both_days),
  latest as (select distinct on (thread_id) thread_id, grp, day from s order by thread_id, day desc)
  select l.thread_id, (select count(*) from s where s.thread_id = l.thread_id and s.grp = l.grp)::int, l.day
    from latest l
   where l.day >= (now() at time zone 'Asia/Kolkata')::date - 1
$$;
grant execute on function public.zing_streaks() to authenticated;

-- Inbox preview knows about zings sent in chat.
drop view if exists public.dm_inbox;
create view public.dm_inbox with (security_invoker = on) as
  select t.id, t.last_at,
    case when t.user_a = auth.uid() then t.user_b else t.user_a end as other_id,
    (select row_to_json(m) from (select body, photo_path, gif_url, sticker, zing_id, user_id, deleted, created_at from dm_messages x
       where x.thread_id = t.id and not x.hidden order by created_at desc limit 1) m) as last,
    (select count(*) from dm_messages x where x.thread_id = t.id and not x.hidden and x.user_id <> auth.uid()
       and x.created_at > case when t.user_a = auth.uid() then t.a_read_at else t.b_read_at end)::int as unread
  from dm_threads t where auth.uid() in (t.user_a, t.user_b);

-- Privacy: a zing can only go into a chat by its owner, or as a reply to the owner in their chat.
-- (Stops a private zing being forwarded to someone else.)
create or replace function public.check_dm_zing() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; t record;
begin
  if new.zing_id is null then return new; end if;
  select user_id into owner from checkins where id = new.zing_id;
  select user_a, user_b into t from dm_threads where id = new.thread_id;
  if owner is null or not (owner = new.user_id or owner = t.user_a or owner = t.user_b) then
    raise exception 'You can only reply to a zing in a chat with the person who posted it.';
  end if;
  return new;
end $$;
drop trigger if exists dm_zing_owner on public.dm_messages;
create trigger dm_zing_owner before insert on public.dm_messages for each row execute function public.check_dm_zing();
