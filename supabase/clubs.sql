-- zappd Clubs: brand and model communities with live group chat.
-- Run this once in Supabase → SQL Editor → New query → paste → Run.

create table if not exists public.clubs (
  id text primary key,                         -- 'brand:tata' or 'model:tata-nexon-ev-45'
  kind text not null check (kind in ('brand', 'model')),
  make text not null,
  model_id text,
  name text not null,
  vehicle_kind text,
  created_at timestamptz not null default now()
);

create table if not exists public.club_members (
  club_id text not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
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
  user_id uuid not null references auth.users(id) on delete cascade,
  body text check (char_length(body) <= 2000),
  photo_path text,
  reply_to uuid references public.club_messages(id) on delete set null,
  hidden boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  check (deleted or body is not null or photo_path is not null)
);
create index if not exists club_messages_club_time on public.club_messages (club_id, created_at desc);

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_messages enable row level security;

drop policy if exists "read clubs" on public.clubs;
create policy "read clubs" on public.clubs for select using (true);

drop policy if exists "read members" on public.club_members;
create policy "read members" on public.club_members for select using (true);
drop policy if exists "join club" on public.club_members;
create policy "join club" on public.club_members for insert to authenticated with check (user_id = auth.uid() and role = 'member');
drop policy if exists "update own membership" on public.club_members;
create policy "update own membership" on public.club_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "leave club" on public.club_members;
create policy "leave club" on public.club_members for delete to authenticated using (user_id = auth.uid());

-- Only members read and post; your own messages can be edited (to delete them).
drop policy if exists "members read messages" on public.club_messages;
create policy "members read messages" on public.club_messages for select to authenticated using (
  not hidden and exists (select 1 from public.club_members m where m.club_id = club_messages.club_id and m.user_id = auth.uid()));
drop policy if exists "members post" on public.club_messages;
create policy "members post" on public.club_messages for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.club_members m where m.club_id = club_messages.club_id and m.user_id = auth.uid()));
drop policy if exists "delete own message" on public.club_messages;
create policy "delete own message" on public.club_messages for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Club list with member counts.
create or replace view public.club_stats with (security_invoker = on) as
  select c.*, (select count(*) from public.club_members m where m.club_id = c.id) as members
  from public.clubs c;

-- Reports can now point at chat messages; 3 reports hide one.
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
