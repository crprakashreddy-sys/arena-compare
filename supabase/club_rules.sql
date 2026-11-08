-- zingd: club entry rules. Creators can require a profile completeness %, certain EV personalities,
-- certain vibes, or the same city. Checked in the database so nobody can skip them. Safe to re-run.
alter table public.clubs add column if not exists req_min_profile int not null default 0 check (req_min_profile between 0 and 100);
alter table public.clubs add column if not exists req_personalities text[] not null default '{}';
alter table public.clubs add column if not exists req_traits text[] not null default '{}';
alter table public.clubs add column if not exists req_same_city boolean not null default false;

-- Profile completeness, the same formula the app shows (adds up to 100).
-- Needs personality.sql, traits.sql and bumble.sql first (for personality, traits, interests, prompts).
alter table public.profiles add column if not exists personality text;
alter table public.profiles add column if not exists traits text[] not null default '{}';
alter table public.profiles add column if not exists interests text[] not null default '{}';
alter table public.profiles add column if not exists prompts jsonb not null default '[]';
create or replace function public.profile_completeness(u uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (case when avatar_path is not null then 15 else 0 end)
         + (case when coalesce(bio, '') <> '' then 15 else 0 end)
         + (case when coalesce(car_model, '') <> '' then 15 else 0 end)
         + (case when coalesce(city, '') <> '' then 10 else 0 end)
         + (case when personality is not null then 15 else 0 end)
         + (case when cardinality(traits) >= 3 then 10 else 0 end)
         + (case when cardinality(interests) >= 3 then 10 else 0 end)
         + (case when jsonb_array_length(prompts) >= 1 then 10 else 0 end)
      from profiles where id = u), 0)
$$;
grant execute on function public.profile_completeness(uuid) to authenticated;

-- Why someone can't join (null = they can).
create or replace function public.club_join_block(c text, u uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare k record; p record;
begin
  select * into k from clubs where id = c;
  if k is null or k.created_by = u then return null; end if;
  select * into p from profiles where id = u;
  if k.req_min_profile > 0 and public.profile_completeness(u) < k.req_min_profile then
    return format('This club asks for a profile at least %s%% complete.', k.req_min_profile);
  end if;
  if cardinality(k.req_personalities) > 0 and (p.personality is null or not (p.personality = any(k.req_personalities))) then
    -- Name the personalities so people know exactly what the club wants.
    return format('This club is for %s.%s',
      (select string_agg(case x when 'road_tripper' then 'Road Trippers 🛣️' when 'range_master' then 'Range Masters 🔋' when 'city_glider' then 'City Gliders 🏙️'
        when 'tech_geek' then 'Tech Geeks 🤓' when 'eco_warrior' then 'Eco Warriors 🌱' when 'thrill_seeker' then 'Thrill Seekers ⚡'
        when 'social_charger' then 'Social Chargers ☕' when 'night_cruiser' then 'Night Cruisers 🌙' else x end, ', ') from unnest(k.req_personalities) x),
      case when p.personality is null then ' Take the 1-minute quiz on your profile to see yours.' else '' end);
  end if;
  if cardinality(k.req_traits) > 0 and not (p.traits && k.req_traits) then
    return format('This club looks for: %s. If that''s you, add it under Your vibe on your profile.',
      (select string_agg(initcap(replace(x, '_', ' ')), ', ') from unnest(k.req_traits) x));
  end if;
  if k.req_same_city and (coalesce(k.city, '') = '' or lower(coalesce(p.city, '')) <> lower(k.city)) then
    return format('This club is for drivers in %s.', k.city);
  end if;
  return null;
end $$;
grant execute on function public.club_join_block(text, uuid) to authenticated;

create or replace function public.check_club_join() returns trigger
language plpgsql security definer set search_path = public as $$
declare why text;
begin
  why := public.club_join_block(new.club_id, new.user_id);
  if why is not null then raise exception '%', why; end if;
  return new;
end $$;
drop trigger if exists club_members_rules on public.club_members;
create trigger club_members_rules before insert on public.club_members for each row execute function public.check_club_join();

-- Rebuild the club list view so it carries the new columns.
drop view if exists public.club_stats;
create view public.club_stats with (security_invoker = on) as
  select c.*, (select count(*) from public.club_members m where m.club_id = c.id)::int as members
  from public.clubs c;
