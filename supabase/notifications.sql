-- zingd: push notifications, sent straight from the database through Expo's free push service.
-- Run after clubs.sql, issues.sql and events.sql. Safe to run more than once.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
drop policy if exists "own tokens read" on public.push_tokens;
create policy "own tokens read" on public.push_tokens for select to authenticated using (user_id = auth.uid());
drop policy if exists "own tokens add" on public.push_tokens;
create policy "own tokens add" on public.push_tokens for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "own tokens update" on public.push_tokens;
create policy "own tokens update" on public.push_tokens for update to authenticated using (true) with check (user_id = auth.uid());
drop policy if exists "own tokens delete" on public.push_tokens;
create policy "own tokens delete" on public.push_tokens for delete to authenticated using (user_id = auth.uid());

-- Per-person switches. Everything is on until the driver turns it off.
alter table public.profiles add column if not exists notify_clubs boolean not null default true;
alter table public.profiles add column if not exists notify_replies boolean not null default true;
alter table public.profiles add column if not exists notify_events boolean not null default true;
alter table public.profiles add column if not exists notify_crew boolean not null default true;
grant update (notify_clubs, notify_replies, notify_events, notify_crew) on public.profiles to authenticated;

-- Send one notification to many phones, 100 at a time.
create or replace function public.send_push(tokens text[], title text, body text, data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare i int := 1; n int := coalesce(array_length(tokens, 1), 0); chunk jsonb;
begin
  while i <= n loop
    select jsonb_agg(jsonb_build_object('to', t, 'title', title, 'body', body, 'data', data, 'sound', 'default'))
      into chunk from unnest(tokens[i:i + 99]) as t;
    perform net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := chunk,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
    i := i + 100;
  end loop;
end $$;
revoke execute on function public.send_push(text[], text, text, jsonb) from public, anon, authenticated;

-- Tokens for a set of people, skipping anyone who blocked the sender or switched that kind off.
create or replace function public.tokens_for(users uuid[], sender uuid, kind text)
returns text[] language sql stable security definer set search_path = public as $$
  select array_agg(pt.token) from public.push_tokens pt join public.profiles p on p.id = pt.user_id
   where pt.user_id = any(users) and pt.user_id <> coalesce(sender, '00000000-0000-0000-0000-000000000000'::uuid)
     and not exists (select 1 from public.blocks b where b.blocker_id = pt.user_id and b.blocked_id = sender)
     and case kind when 'clubs' then p.notify_clubs when 'replies' then p.notify_replies
                   when 'events' then p.notify_events when 'crew' then p.notify_crew else true end
$$;

-- New club message → members who haven't muted the club.
create or replace function public.notify_club_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text; sender text; toks text[];
begin
  select name into cname from clubs where id = new.club_id;
  select display_name into sender from profiles where id = new.user_id;
  toks := tokens_for(array(select user_id from club_members where club_id = new.club_id and not muted), new.user_id, 'clubs');
  if toks is not null then
    perform send_push(toks, cname, sender || ': ' || coalesce(left(new.body, 140), 'sent a photo'),
      jsonb_build_object('url', '/club/' || replace(new.club_id, ':', '%3A')));
  end if;
  return new;
end $$;
drop trigger if exists club_messages_notify on public.club_messages;
create trigger club_messages_notify after insert on public.club_messages for each row execute function public.notify_club_message();

-- New reply on your issue → the person who asked.
create or replace function public.notify_issue_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record; sender text; toks text[];
begin
  select id, user_id, title into p from club_posts where id = new.post_id;
  select display_name into sender from profiles where id = new.user_id;
  toks := tokens_for(array[p.user_id], new.user_id, 'replies');
  if toks is not null then
    perform send_push(toks, 'New reply: ' || left(p.title, 60), sender || ': ' || coalesce(left(new.body, 140), 'sent a photo'),
      jsonb_build_object('url', '/issue/' || p.id));
  end if;
  return new;
end $$;
drop trigger if exists club_replies_notify on public.club_replies;
create trigger club_replies_notify after insert on public.club_replies for each row execute function public.notify_issue_reply();

-- New event → club members.
create or replace function public.notify_new_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text; toks text[];
begin
  select name into cname from clubs where id = new.club_id;
  toks := tokens_for(array(select user_id from club_members where club_id = new.club_id and not muted), new.user_id, 'events');
  if toks is not null then
    perform send_push(toks, 'New in ' || cname, new.title || ' · ' || to_char(new.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon, HH12:MI am'),
      jsonb_build_object('url', '/event/' || new.id));
  end if;
  return new;
end $$;
drop trigger if exists club_events_notify on public.club_events;
create trigger club_events_notify after insert on public.club_events for each row execute function public.notify_new_event();

-- Event reminders, one hour before, checked every 10 minutes.
alter table public.club_events add column if not exists reminded boolean not null default false;
create or replace function public.send_event_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare e record; toks text[];
begin
  for e in select * from club_events where not reminded and not cancelled
            and starts_at between now() + interval '50 minutes' and now() + interval '70 minutes' loop
    toks := tokens_for(array(select user_id from club_event_rsvps where event_id = e.id and status = 'going'), null, 'events');
    if toks is not null then
      perform send_push(toks, 'Starting in 1 hour', e.title || coalesce(' · ' || e.place_name, ''), jsonb_build_object('url', '/event/' || e.id));
    end if;
    update club_events set reminded = true where id = e.id;
  end loop;
end $$;
do $$ begin perform cron.unschedule('zingd-event-reminders'); exception when others then null; end $$;
select cron.schedule('zingd-event-reminders', '*/10 * * * *', $$ select public.send_event_reminders() $$);

-- Connection requests and accepts.
create or replace function public.notify_connection() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; toks text[];
begin
  if tg_op = 'INSERT' then
    select display_name into who from profiles where id = new.requester_id;
    toks := tokens_for(array[new.addressee_id], new.requester_id, 'crew');
    if toks is not null then perform send_push(toks, 'New connection request', who || ' wants to join your EV crew', jsonb_build_object('url', '/driver/' || new.requester_id)); end if;
  elsif new.status = 'accepted' and old.status <> 'accepted' then
    select display_name into who from profiles where id = new.addressee_id;
    toks := tokens_for(array[new.requester_id], new.addressee_id, 'crew');
    if toks is not null then perform send_push(toks, 'You''re connected', who || ' accepted your request', jsonb_build_object('url', '/driver/' || new.addressee_id)); end if;
  end if;
  return new;
end $$;
drop trigger if exists connections_notify on public.connections;
create trigger connections_notify after insert or update on public.connections for each row execute function public.notify_connection();
