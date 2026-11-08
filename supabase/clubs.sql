-- zappd Clubs: brand, model and driver-made communities with live group chat.
-- Safe to run more than once. Supabase → SQL Editor → New query → paste → Run.

create table if not exists public.clubs (
  id text primary key,                         -- 'brand:tata', 'model:tata-nexon-ev-45' or 'u-…' for driver-made
  kind text not null,
  make text not null,
  model_id text,
  name text not null,
  vehicle_kind text,
  created_at timestamptz not null default now()
);
alter table public.clubs add column if not exists description text;
alter table public.clubs add column if not exists city text;
alter table public.clubs add column if not exists emoji text;
alter table public.clubs add column if not exists color text;
alter table public.clubs add column if not exists is_private boolean not null default false;
alter table public.clubs add column if not exists invite_code text;
alter table public.clubs add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.clubs drop constraint if exists clubs_kind_check;
alter table public.clubs add constraint clubs_kind_check check (kind in ('brand', 'model', 'custom'));
alter table public.clubs drop constraint if exists clubs_text_check;
alter table public.clubs add constraint clubs_text_check check (
  char_length(name) between 3 and 50 and char_length(coalesce(description, '')) <= 400 and char_length(coalesce(city, '')) <= 40);
create unique index if not exists clubs_invite_code on public.clubs (invite_code) where invite_code is not null;

create table if not exists public.club_members (
  club_id text not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  muted boolean not null default false,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index if not exists club_members_user on public.club_members (user_id);

create table if not exists public.club_messages (
  id uuid primary key default gen_random_uuid(),
  club_id text not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text check (char_length(body) <= 2000),
  photo_path text,
  reply_to uuid references public.club_messages(id) on delete set null,
  hidden boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  check (deleted or body is not null or photo_path is not null)
);
create index if not exists club_messages_club_time on public.club_messages (club_id, created_at desc);

-- Point members and messages at profiles so the app can show names (fixes an earlier version).
alter table public.club_members drop constraint if exists club_members_user_id_fkey;
alter table public.club_members add constraint club_members_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.club_messages drop constraint if exists club_messages_user_id_fkey;
alter table public.club_messages add constraint club_messages_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;

-- Helpers that look at memberships without tripping over row security.
create or replace function public.is_club_member(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.club_members where club_id = c and user_id = auth.uid())
$$;
create or replace function public.is_club_admin(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.club_members where club_id = c and user_id = auth.uid() and role = 'admin')
$$;

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_messages enable row level security;

-- Clubs: everyone sees public ones; private ones only their members. Drivers make and edit their own.
drop policy if exists "read clubs" on public.clubs;
create policy "read clubs" on public.clubs for select using (not is_private or public.is_club_member(id));
drop policy if exists "create club" on public.clubs;
create policy "create club" on public.clubs for insert to authenticated with check (kind = 'custom' and created_by = auth.uid());
drop policy if exists "admins edit club" on public.clubs;
create policy "admins edit club" on public.clubs for update to authenticated
  using (kind = 'custom' and public.is_club_admin(id)) with check (kind = 'custom');
drop policy if exists "creator deletes club" on public.clubs;
create policy "creator deletes club" on public.clubs for delete to authenticated using (kind = 'custom' and created_by = auth.uid());

-- Up to 5 clubs per driver, a fresh invite code, and the creator becomes admin.
create or replace function public.club_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'custom' then
    if (select count(*) from public.clubs where created_by = new.created_by) >= 5 then
      raise exception 'You can run up to 5 clubs.';
    end if;
    new.invite_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  end if;
  return new;
end $$;
drop trigger if exists clubs_before_insert on public.clubs;
create trigger clubs_before_insert before insert on public.clubs for each row execute function public.club_before_insert();

create or replace function public.club_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'custom' and new.created_by is not null then
    insert into public.club_members (club_id, user_id, role) values (new.id, new.created_by, 'admin') on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists clubs_after_insert on public.clubs;
create trigger clubs_after_insert after insert on public.clubs for each row execute function public.club_after_insert();

-- Members: anyone can see who's in a public club; you join public clubs yourself, private ones with a code.
drop policy if exists "read members" on public.club_members;
create policy "read members" on public.club_members for select using (
  exists (select 1 from public.clubs c where c.id = club_id and (not c.is_private or public.is_club_member(c.id))));
drop policy if exists "join club" on public.club_members;
create policy "join club" on public.club_members for insert to authenticated with check (
  user_id = auth.uid() and role = 'member'
  and exists (select 1 from public.clubs c where c.id = club_id and not c.is_private));
drop policy if exists "update own membership" on public.club_members;
create policy "update own membership" on public.club_members for update to authenticated
  using (user_id = auth.uid() or public.is_club_admin(club_id))
  with check (user_id = auth.uid() or public.is_club_admin(club_id));
drop policy if exists "leave club" on public.club_members;
create policy "leave club" on public.club_members for delete to authenticated
  using (user_id = auth.uid() or public.is_club_admin(club_id));

-- You can't promote yourself: only admins change roles.
create or replace function public.club_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role <> old.role and not public.is_club_admin(new.club_id) then
    raise exception 'Only club admins can change roles.';
  end if;
  return new;
end $$;
drop trigger if exists club_members_role_guard on public.club_members;
create trigger club_members_role_guard before update on public.club_members for each row execute function public.club_role_guard();

create or replace function public.join_club_with_code(code text) returns text
language plpgsql security definer set search_path = public as $$
declare cid text;
begin
  select id into cid from public.clubs where invite_code = upper(trim(code));
  if cid is null then raise exception 'That invite code didn''t match a club.'; end if;
  insert into public.club_members (club_id, user_id) values (cid, auth.uid()) on conflict do nothing;
  return cid;
end $$;
grant execute on function public.join_club_with_code(text) to authenticated;

-- Messages: members read and post; you delete yours, admins can remove any.
drop policy if exists "members read messages" on public.club_messages;
create policy "members read messages" on public.club_messages for select to authenticated using (
  not hidden and public.is_club_member(club_id));
drop policy if exists "members post" on public.club_messages;
create policy "members post" on public.club_messages for insert to authenticated with check (
  user_id = auth.uid() and public.is_club_member(club_id));
drop policy if exists "delete own message" on public.club_messages;
create policy "delete own message" on public.club_messages for update to authenticated
  using (user_id = auth.uid() or public.is_club_admin(club_id))
  with check (user_id = auth.uid() or public.is_club_admin(club_id));

-- Club list with member counts.
drop view if exists public.club_stats;
create view public.club_stats with (security_invoker = on) as
  select c.*, (select count(*) from public.club_members m where m.club_id = c.id)::int as members
  from public.clubs c;

-- Reports can point at chat messages; 3 reports hide one.
alter table public.reports drop constraint if exists reports_target_kind_check;
alter table public.reports add constraint reports_target_kind_check
  check (target_kind in ('checkin', 'review', 'food_tip', 'user', 'club_message'));
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
    elsif new.target_kind = 'club_message' then update public.club_messages set hidden = true where id::text = new.target_id;
    end if;
  end if;
  return new;
end $$;

-- Live chat: send new messages to open phones.
do $$ begin
  alter publication supabase_realtime add table public.club_messages;
exception when duplicate_object then null; end $$;

-- The clubs, one per brand and one per model in the app's vehicle list.
insert into public.clubs (id, kind, make, model_id, name, vehicle_kind) values
  ('brand:tata', 'brand', 'Tata', null, 'Tata EV Club', null),
  ('brand:mg', 'brand', 'MG', null, 'MG EV Club', null),
  ('brand:hyundai', 'brand', 'Hyundai', null, 'Hyundai EV Club', null),
  ('brand:mahindra', 'brand', 'Mahindra', null, 'Mahindra EV Club', null),
  ('brand:byd', 'brand', 'BYD', null, 'BYD EV Club', null),
  ('brand:kia', 'brand', 'Kia', null, 'Kia EV Club', null),
  ('brand:citroen', 'brand', 'Citroën', null, 'Citroën EV Club', null),
  ('brand:ather', 'brand', 'Ather', null, 'Ather EV Club', null),
  ('brand:ola', 'brand', 'Ola', null, 'Ola EV Club', null),
  ('brand:tvs', 'brand', 'TVS', null, 'TVS EV Club', null),
  ('brand:bajaj', 'brand', 'Bajaj', null, 'Bajaj EV Club', null),
  ('brand:hero', 'brand', 'Hero', null, 'Hero EV Club', null),
  ('brand:revolt', 'brand', 'Revolt', null, 'Revolt EV Club', null),
  ('model:tata-nexon-ev-45', 'model', 'Tata', 'tata-nexon-ev-45', 'Tata Nexon EV 45 Owners', 'car'),
  ('model:tata-punch-ev-lr', 'model', 'Tata', 'tata-punch-ev-lr', 'Tata Punch EV (LR) Owners', 'car'),
  ('model:tata-tiago-ev-lr', 'model', 'Tata', 'tata-tiago-ev-lr', 'Tata Tiago EV (LR) Owners', 'car'),
  ('model:tata-curvv-ev-55', 'model', 'Tata', 'tata-curvv-ev-55', 'Tata Curvv EV 55 Owners', 'car'),
  ('model:tata-harrier-ev-75', 'model', 'Tata', 'tata-harrier-ev-75', 'Tata Harrier.ev 75 Owners', 'car'),
  ('model:mg-windsor-38', 'model', 'MG', 'mg-windsor-38', 'MG Windsor EV Owners', 'car'),
  ('model:mg-zs-ev', 'model', 'MG', 'mg-zs-ev', 'MG ZS EV Owners', 'car'),
  ('model:mg-comet', 'model', 'MG', 'mg-comet', 'MG Comet EV Owners', 'car'),
  ('model:hyundai-creta-electric', 'model', 'Hyundai', 'hyundai-creta-electric', 'Hyundai Creta Electric Owners', 'car'),
  ('model:hyundai-ioniq5', 'model', 'Hyundai', 'hyundai-ioniq5', 'Hyundai Ioniq 5 Owners', 'car'),
  ('model:mahindra-xuv400', 'model', 'Mahindra', 'mahindra-xuv400', 'Mahindra XUV400 EV Owners', 'car'),
  ('model:mahindra-be6', 'model', 'Mahindra', 'mahindra-be6', 'Mahindra BE 6 Owners', 'car'),
  ('model:mahindra-xev9e', 'model', 'Mahindra', 'mahindra-xev9e', 'Mahindra XEV 9e Owners', 'car'),
  ('model:byd-atto3', 'model', 'BYD', 'byd-atto3', 'BYD Atto 3 Owners', 'car'),
  ('model:byd-emax7', 'model', 'BYD', 'byd-emax7', 'BYD eMax 7 Owners', 'car'),
  ('model:kia-ev6', 'model', 'Kia', 'kia-ev6', 'Kia EV6 Owners', 'car'),
  ('model:citroen-ec3', 'model', 'Citroën', 'citroen-ec3', 'Citroën eC3 Owners', 'car'),
  ('model:ather-450x', 'model', 'Ather', 'ather-450x', 'Ather 450X Owners', 'scooter'),
  ('model:ather-rizta', 'model', 'Ather', 'ather-rizta', 'Ather Rizta Owners', 'scooter'),
  ('model:ola-s1-pro', 'model', 'Ola', 'ola-s1-pro', 'Ola S1 Pro Owners', 'scooter'),
  ('model:tvs-iqube', 'model', 'TVS', 'tvs-iqube', 'TVS iQube Owners', 'scooter'),
  ('model:bajaj-chetak', 'model', 'Bajaj', 'bajaj-chetak', 'Bajaj Chetak Owners', 'scooter'),
  ('model:hero-vida-v2', 'model', 'Hero', 'hero-vida-v2', 'Hero Vida V2 Owners', 'scooter'),
  ('model:revolt-rv400', 'model', 'Revolt', 'revolt-rv400', 'Revolt RV400 Owners', 'bike')
on conflict (id) do update set name = excluded.name;
