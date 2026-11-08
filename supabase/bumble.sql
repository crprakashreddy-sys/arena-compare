-- zingd: Bumble-style connecting. Interests, profile prompts, an opening move with each request,
-- and suggestions that weigh shared interests. Run after crew.sql. Safe to re-run.

alter table public.profiles add column if not exists interests text[] not null default '{}';
alter table public.profiles add column if not exists prompts jsonb not null default '[]';
alter table public.profiles drop constraint if exists profiles_interests_check;
alter table public.profiles add constraint profiles_interests_check check (cardinality(interests) <= 8);
alter table public.profiles drop constraint if exists profiles_prompts_check;
alter table public.profiles add constraint profiles_prompts_check check (jsonb_typeof(prompts) = 'array' and jsonb_array_length(prompts) <= 3 and length(prompts::text) <= 900);
grant update (interests, prompts) on public.profiles to authenticated;

-- Opening move: a short note sent with a connect request.
alter table public.connections add column if not exists note text check (char_length(note) <= 140);

-- Suggestions now also count interests you share.
drop function if exists public.driver_suggestions(int);
create or replace function public.driver_suggestions(lim int default 20)
returns table (
  id uuid, display_name text, car_model text, city text, avatar_path text, bio text,
  vehicle_verified boolean, shared_clubs int, score int, reason text, interests text[], prompts jsonb, shared_interests text[]
)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, lower(coalesce(p.car_model, '')) as car, lower(split_part(coalesce(p.car_model, ''), ' ', 1)) as make,
           lower(coalesce(p.city, '')) as city, p.interests
      from profiles p where p.id = auth.uid()
  ),
  my_clubs as (select club_id from club_members where user_id = auth.uid()),
  cand as (
    select p.*,
      (select count(*) from club_members cm where cm.user_id = p.id and cm.club_id in (select club_id from my_clubs))::int as shared,
      array(select unnest(p.interests) intersect select unnest((select interests from me))) as common,
      (lower(coalesce(p.car_model, '')) = (select car from me) and (select car from me) <> '') as same_car,
      (lower(split_part(coalesce(p.car_model, ''), ' ', 1)) = (select make from me) and (select make from me) <> '') as same_make,
      (lower(coalesce(p.city, '')) = (select city from me) and (select city from me) <> '') as same_city
    from profiles p
    where p.id <> auth.uid()
      and not exists (select 1 from connections c where (c.requester_id = auth.uid() and c.addressee_id = p.id) or (c.addressee_id = auth.uid() and c.requester_id = p.id))
      and not exists (select 1 from blocks b where (b.blocker_id = auth.uid() and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
  )
  select c.id, c.display_name, c.car_model, c.city, c.avatar_path, c.bio, coalesce(c.vehicle_verified, false), c.shared,
         (case when c.same_car then 6 when c.same_make then 3 else 0 end + case when c.same_city then 3 else 0 end
          + least(c.shared, 4) * 2 + least(cardinality(c.common), 4) * 2
          + case when c.avatar_path is not null then 1 else 0 end + case when jsonb_array_length(c.prompts) > 0 then 1 else 0 end)::int,
         concat_ws(' · ',
           case when c.same_car then 'Also drives a ' || c.car_model when c.same_make then 'Fellow ' || split_part(c.car_model, ' ', 1) || ' owner' end,
           case when c.same_city then 'In ' || c.city end,
           case when c.shared > 0 then c.shared || ' club' || case when c.shared > 1 then 's' else '' end || ' in common' end),
         c.interests, c.prompts, c.common
    from cand c
   where auth.uid() is not null
   order by 9 desc, c.created_at desc
   limit greatest(1, least(lim, 50))
$$;
grant execute on function public.driver_suggestions(int) to authenticated;
