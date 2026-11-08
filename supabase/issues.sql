-- zappd Clubs: Issues board. Problems, fixes, "me too" and helpful votes, solved answers.
-- Run after clubs.sql. Safe to run more than once.

create table if not exists public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id text not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 5 and 120),
  body text check (char_length(body) <= 4000),
  photo_path text,
  tags text[] not null default '{}',
  solved boolean not null default false,
  solution_id uuid,
  hidden boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index if not exists club_posts_club on public.club_posts (club_id, last_activity_at desc);

create table if not exists public.club_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.club_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text check (char_length(body) <= 3000),
  photo_path text,
  hidden boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  check (deleted or body is not null or photo_path is not null)
);
create index if not exists club_replies_post on public.club_replies (post_id, created_at);

create table if not exists public.club_post_metoo (
  post_id uuid not null references public.club_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);
create table if not exists public.club_reply_votes (
  reply_id uuid not null references public.club_replies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (reply_id, user_id)
);

create or replace function public.post_club(p uuid) returns text
language sql stable security definer set search_path = public as $$ select club_id from public.club_posts where id = p $$;
create or replace function public.reply_club(r uuid) returns text
language sql stable security definer set search_path = public as $$
  select p.club_id from public.club_replies r2 join public.club_posts p on p.id = r2.post_id where r2.id = r $$;

alter table public.club_posts enable row level security;
alter table public.club_replies enable row level security;
alter table public.club_post_metoo enable row level security;
alter table public.club_reply_votes enable row level security;

drop policy if exists "members read posts" on public.club_posts;
create policy "members read posts" on public.club_posts for select to authenticated using (not hidden and public.is_club_member(club_id));
drop policy if exists "members post issues" on public.club_posts;
create policy "members post issues" on public.club_posts for insert to authenticated with check (user_id = auth.uid() and public.is_club_member(club_id));
drop policy if exists "author or admin edits post" on public.club_posts;
create policy "author or admin edits post" on public.club_posts for update to authenticated
  using (user_id = auth.uid() or public.is_club_admin(club_id)) with check (user_id = auth.uid() or public.is_club_admin(club_id));

drop policy if exists "members read replies" on public.club_replies;
create policy "members read replies" on public.club_replies for select to authenticated using (not hidden and public.is_club_member(public.post_club(post_id)));
drop policy if exists "members reply" on public.club_replies;
create policy "members reply" on public.club_replies for insert to authenticated with check (user_id = auth.uid() and public.is_club_member(public.post_club(post_id)));
drop policy if exists "author or admin edits reply" on public.club_replies;
create policy "author or admin edits reply" on public.club_replies for update to authenticated
  using (user_id = auth.uid() or public.is_club_admin(public.post_club(post_id)))
  with check (user_id = auth.uid() or public.is_club_admin(public.post_club(post_id)));

drop policy if exists "read metoo" on public.club_post_metoo;
create policy "read metoo" on public.club_post_metoo for select to authenticated using (public.is_club_member(public.post_club(post_id)));
drop policy if exists "add metoo" on public.club_post_metoo;
create policy "add metoo" on public.club_post_metoo for insert to authenticated with check (user_id = auth.uid() and public.is_club_member(public.post_club(post_id)));
drop policy if exists "remove metoo" on public.club_post_metoo;
create policy "remove metoo" on public.club_post_metoo for delete to authenticated using (user_id = auth.uid());

drop policy if exists "read votes" on public.club_reply_votes;
create policy "read votes" on public.club_reply_votes for select to authenticated using (public.is_club_member(public.reply_club(reply_id)));
drop policy if exists "add vote" on public.club_reply_votes;
create policy "add vote" on public.club_reply_votes for insert to authenticated with check (user_id = auth.uid() and public.is_club_member(public.reply_club(reply_id)));
drop policy if exists "remove vote" on public.club_reply_votes;
create policy "remove vote" on public.club_reply_votes for delete to authenticated using (user_id = auth.uid());

-- A reply bumps its issue to the top.
create or replace function public.bump_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.club_posts set last_activity_at = now() where id = new.post_id;
  return new;
end $$;
drop trigger if exists club_replies_bump on public.club_replies;
create trigger club_replies_bump after insert on public.club_replies for each row execute function public.bump_post();

-- Issues with counts, for the list.
drop view if exists public.club_post_list;
create view public.club_post_list with (security_invoker = on) as
  select p.*,
    (select count(*) from public.club_replies r where r.post_id = p.id and not r.hidden and not r.deleted)::int as replies,
    (select count(*) from public.club_post_metoo m where m.post_id = p.id)::int as metoo
  from public.club_posts p;

-- Reports cover issues and replies; 3 reports hide them.
alter table public.reports drop constraint if exists reports_target_kind_check;
alter table public.reports add constraint reports_target_kind_check
  check (target_kind in ('checkin', 'review', 'food_tip', 'user', 'club_message', 'club_post', 'club_reply'));
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
    end if;
  end if;
  return new;
end $$;
