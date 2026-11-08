-- zingd: direct messages between connected drivers. Run after notifications.sql. Safe to re-run.

create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  a_read_at timestamptz not null default now(),
  b_read_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text check (char_length(body) <= 2000),
  photo_path text,
  reply_to uuid references public.dm_messages(id) on delete set null,
  hidden boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  check (deleted or body is not null or photo_path is not null)
);
create index if not exists dm_messages_thread on public.dm_messages (thread_id, created_at desc);

create or replace function public.in_thread(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dm_threads where id = t and auth.uid() in (user_a, user_b))
$$;
-- Both people still connected and nobody blocked the other.
create or replace function public.can_dm(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from connections c where c.status = 'accepted'
                  and ((c.requester_id = auth.uid() and c.addressee_id = other) or (c.addressee_id = auth.uid() and c.requester_id = other)))
     and not exists (select 1 from blocks b where (b.blocker_id = auth.uid() and b.blocked_id = other) or (b.blocker_id = other and b.blocked_id = auth.uid()))
$$;
create or replace function public.thread_other(t uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case when user_a = auth.uid() then user_b else user_a end from dm_threads where id = t
$$;

-- Open (or reuse) the chat with a connected driver.
create or replace function public.start_dm(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a uuid := least(auth.uid(), other); b uuid := greatest(auth.uid(), other); tid uuid;
begin
  if auth.uid() is null or other = auth.uid() then raise exception 'Not allowed.'; end if;
  if not public.can_dm(other) then raise exception 'You can message drivers in your crew. Connect first.'; end if;
  insert into dm_threads (user_a, user_b) values (a, b) on conflict (user_a, user_b) do nothing;
  select id into tid from dm_threads where user_a = a and user_b = b;
  return tid;
end $$;
grant execute on function public.start_dm(uuid) to authenticated;
grant execute on function public.thread_other(uuid) to authenticated;
grant execute on function public.can_dm(uuid) to authenticated;

create or replace function public.mark_dm_read(t uuid) returns void
language sql security definer set search_path = public as $$
  update dm_threads set a_read_at = case when user_a = auth.uid() then now() else a_read_at end,
                        b_read_at = case when user_b = auth.uid() then now() else b_read_at end
   where id = t and auth.uid() in (user_a, user_b)
$$;
grant execute on function public.mark_dm_read(uuid) to authenticated;

alter table public.dm_threads enable row level security;
alter table public.dm_messages enable row level security;
drop policy if exists "own threads" on public.dm_threads;
create policy "own threads" on public.dm_threads for select to authenticated using (auth.uid() in (user_a, user_b));
drop policy if exists "read dms" on public.dm_messages;
create policy "read dms" on public.dm_messages for select to authenticated using (not hidden and public.in_thread(thread_id));
drop policy if exists "send dms" on public.dm_messages;
create policy "send dms" on public.dm_messages for insert to authenticated
  with check (user_id = auth.uid() and public.in_thread(thread_id) and public.can_dm(public.thread_other(thread_id)));
drop policy if exists "delete own dm" on public.dm_messages;
create policy "delete own dm" on public.dm_messages for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Inbox: each chat with the other person, the newest message and how many are unread.
drop view if exists public.dm_inbox;
create view public.dm_inbox with (security_invoker = on) as
  select t.id, t.last_at,
    case when t.user_a = auth.uid() then t.user_b else t.user_a end as other_id,
    (select row_to_json(m) from (select body, photo_path, user_id, deleted, created_at from dm_messages x
       where x.thread_id = t.id and not x.hidden order by created_at desc limit 1) m) as last,
    (select count(*) from dm_messages x where x.thread_id = t.id and not x.hidden and x.user_id <> auth.uid()
       and x.created_at > case when t.user_a = auth.uid() then t.a_read_at else t.b_read_at end)::int as unread
  from dm_threads t where auth.uid() in (t.user_a, t.user_b);

-- New message: bump the chat and notify the other person.
alter table public.profiles add column if not exists notify_dms boolean not null default true;
grant update (notify_dms) on public.profiles to authenticated;
create or replace function public.tokens_for(users uuid[], sender uuid, kind text)
returns text[] language sql stable security definer set search_path = public as $$
  select array_agg(pt.token) from public.push_tokens pt join public.profiles p on p.id = pt.user_id
   where pt.user_id = any(users) and pt.user_id <> coalesce(sender, '00000000-0000-0000-0000-000000000000'::uuid)
     and not exists (select 1 from public.blocks b where b.blocker_id = pt.user_id and b.blocked_id = sender)
     and case kind when 'clubs' then p.notify_clubs when 'replies' then p.notify_replies
                   when 'events' then p.notify_events when 'crew' then p.notify_crew when 'dms' then p.notify_dms else true end
$$;
create or replace function public.on_dm() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record; sender text; other uuid; toks text[];
begin
  update dm_threads set last_at = now() where id = new.thread_id returning * into t;
  other := case when t.user_a = new.user_id then t.user_b else t.user_a end;
  select display_name into sender from profiles where id = new.user_id;
  toks := tokens_for(array[other], new.user_id, 'dms');
  if toks is not null then
    perform send_push(toks, sender, coalesce(left(new.body, 160), 'sent a photo'), jsonb_build_object('url', '/dm/' || new.thread_id));
  end if;
  return new;
end $$;
drop trigger if exists dm_messages_after on public.dm_messages;
create trigger dm_messages_after after insert on public.dm_messages for each row execute function public.on_dm();

do $$ begin alter publication supabase_realtime add table public.dm_messages;
exception when duplicate_object then null; end $$;

-- Reports cover DMs too.
alter table public.reports drop constraint if exists reports_target_kind_check;
alter table public.reports add constraint reports_target_kind_check
  check (target_kind in ('checkin', 'review', 'food_tip', 'user', 'club_message', 'club_post', 'club_reply', 'club_event', 'dm_message'));
create or replace function public.auto_hide_reported() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.reports where target_kind = new.target_kind and target_id = new.target_id;
  if n >= 3 or new.target_kind = 'dm_message' then
    if new.target_kind = 'checkin' then update public.checkins set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'review' then update public.reviews set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'food_tip' then update public.food_tips set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'club_message' then update public.club_messages set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'club_post' then update public.club_posts set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'club_reply' then update public.club_replies set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'club_event' then update public.club_events set hidden = true where id::text = new.target_id;
    elsif new.target_kind = 'dm_message' then update public.dm_messages set hidden = true where id::text = new.target_id;
    end if;
  end if;
  return new;
end $$;
