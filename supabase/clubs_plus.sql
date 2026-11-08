-- zingd: reactions, pinned message, rules and activity for clubs. Run after clubs.sql, issues.sql, events.sql. Safe to re-run.

alter table public.clubs add column if not exists rules text check (char_length(rules) <= 1500);
alter table public.clubs add column if not exists pinned_message_id uuid references public.club_messages(id) on delete set null;

-- Reactions on chat messages: one of each emoji per person.
create table if not exists public.club_reactions (
  message_id uuid not null references public.club_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  emoji text not null check (emoji in ('⚡', '❤️', '👍', '😂', '😮', '🙏')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create or replace function public.msg_club(m uuid) returns text
language sql stable security definer set search_path = public as $$ select club_id from public.club_messages where id = m $$;
alter table public.club_reactions enable row level security;
drop policy if exists "members read reactions" on public.club_reactions;
create policy "members read reactions" on public.club_reactions for select to authenticated using (public.is_club_member(public.msg_club(message_id)));
drop policy if exists "members react" on public.club_reactions;
create policy "members react" on public.club_reactions for insert to authenticated with check (user_id = auth.uid() and public.is_club_member(public.msg_club(message_id)));
drop policy if exists "undo my reaction" on public.club_reactions;
create policy "undo my reaction" on public.club_reactions for delete to authenticated using (user_id = auth.uid());
do $$ begin alter publication supabase_realtime add table public.club_reactions;
exception when duplicate_object then null; end $$;
alter table public.club_reactions replica identity full;

-- Admins of any club (brand, model or driver-made) can pin a message and set rules.
create or replace function public.pin_club_message(c text, m uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_club_admin(c) then raise exception 'Only club admins can pin messages.'; end if;
  if m is not null and public.msg_club(m) <> c then raise exception 'That message is not in this club.'; end if;
  update public.clubs set pinned_message_id = m where id = c;
end $$;
grant execute on function public.pin_club_message(text, uuid) to authenticated;

create or replace function public.set_club_rules(c text, r text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_club_admin(c) then raise exception 'Only club admins can edit the rules.'; end if;
  update public.clubs set rules = nullif(trim(r), '') where id = c;
end $$;
grant execute on function public.set_club_rules(text, text) to authenticated;

-- How lively each club is, visible to everyone (counts only, never message content).
create or replace function public.club_activity()
returns table (club_id text, msgs_today int, active_week int)
language sql stable security definer set search_path = public as $$
  select m.club_id,
         count(*) filter (where m.created_at > now() - interval '24 hours')::int,
         count(distinct m.user_id) filter (where m.created_at > now() - interval '7 days')::int
    from public.club_messages m
   where m.created_at > now() - interval '7 days' and not m.hidden
   group by m.club_id
$$;
grant execute on function public.club_activity() to anon, authenticated;

-- The numbers on a club's info page.
create or replace function public.club_info_stats(c text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'members', (select count(*) from club_members where club_id = c),
    'msgs_week', (select count(*) from club_messages where club_id = c and not hidden and created_at > now() - interval '7 days'),
    'active_week', (select count(distinct user_id) from club_messages where club_id = c and not hidden and created_at > now() - interval '7 days'),
    'issues_solved', (select count(*) from club_posts where club_id = c and solved and not hidden and not deleted),
    'issues_open', (select count(*) from club_posts where club_id = c and not solved and not hidden and not deleted),
    'events_upcoming', (select count(*) from club_events where club_id = c and not cancelled and not hidden and starts_at > now()),
    'since', (select min(joined_at) from club_members where club_id = c)
  )
$$;
grant execute on function public.club_info_stats(text) to anon, authenticated;

-- Keep the club list view in step with the new columns.
drop view if exists public.club_stats;
create view public.club_stats with (security_invoker = on) as
  select c.*, (select count(*) from public.club_members m where m.club_id = c.id)::int as members
  from public.clubs c;
