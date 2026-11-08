-- zingd: meet drivers like you — same car, same EV personality, or both. Run after bumble.sql, personality.sql, traits.sql. Safe to re-run.
drop function if exists public.driver_suggestions(int);
drop function if exists public.driver_suggestions(int, text);
create or replace function public.driver_suggestions(lim int default 20, kind text default 'all')
returns table (
  id uuid, display_name text, car_model text, city text, avatar_path text, bio text,
  vehicle_verified boolean, shared_clubs int, score int, reason text, interests text[], prompts jsonb, shared_interests text[],
  personality text, traits text[], shared_traits text[], same_car boolean, same_personality boolean
)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, lower(coalesce(p.car_model, '')) as car, lower(split_part(coalesce(p.car_model, ''), ' ', 1)) as make,
           lower(split_part(coalesce(p.car_model, ''), ' ', 1) || ' ' || regexp_replace(split_part(coalesce(p.car_model, ''), ' ', 2), '[^a-z0-9]', '', 'gi')) as fam,
           lower(coalesce(p.city, '')) as city, p.interests, p.personality, p.traits
      from profiles p where p.id = auth.uid()
  ),
  my_clubs as (select club_id from club_members where user_id = auth.uid()),
  cand as (
    select p.*,
      (select count(*) from club_members cm where cm.user_id = p.id and cm.club_id in (select club_id from my_clubs))::int as shared,
      array(select unnest(p.interests) intersect select unnest((select interests from me))) as common,
      array(select unnest(p.traits) intersect select unnest((select traits from me))) as common_traits,
      (lower(coalesce(p.car_model, '')) = (select car from me) and (select car from me) <> '') as s_car,
      (lower(split_part(coalesce(p.car_model, ''), ' ', 1) || ' ' || regexp_replace(split_part(coalesce(p.car_model, ''), ' ', 2), '[^a-z0-9]', '', 'gi')) = (select fam from me)
        and split_part(coalesce(p.car_model, ''), ' ', 2) <> '') as s_fam,
      (lower(split_part(coalesce(p.car_model, ''), ' ', 1)) = (select make from me) and (select make from me) <> '') as s_make,
      (lower(coalesce(p.city, '')) = (select city from me) and (select city from me) <> '') as s_city,
      (p.personality is not null and p.personality = (select personality from me)) as s_pers
    from profiles p
    where p.id <> auth.uid()
      and not exists (select 1 from connections c where (c.requester_id = auth.uid() and c.addressee_id = p.id) or (c.addressee_id = auth.uid() and c.requester_id = p.id))
      and not exists (select 1 from blocks b where (b.blocker_id = auth.uid() and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
  )
  select c.id, c.display_name, c.car_model, c.city, c.avatar_path, c.bio, coalesce(c.vehicle_verified, false), c.shared,
         (case when c.s_car then 6 when c.s_fam then 5 when c.s_make then 3 else 0 end + case when c.s_pers then 5 else 0 end
          + case when c.s_city then 3 else 0 end
          + least(c.shared, 4) * 2 + least(cardinality(c.common), 4) * 2 + least(cardinality(c.common_traits), 3)
          + case when c.avatar_path is not null then 1 else 0 end + case when jsonb_array_length(coalesce(c.prompts, '[]'::jsonb)) > 0 then 1 else 0 end)::int,
         concat_ws(' · ',
           case when c.s_car then 'Also drives a ' || c.car_model
                when c.s_fam then 'Also drives a ' || split_part(c.car_model, ' ', 1) || ' ' || split_part(c.car_model, ' ', 2)
                when c.s_make then 'Fellow ' || split_part(c.car_model, ' ', 1) || ' owner' end,
           case when c.s_city then 'In ' || c.city end,
           case when c.shared > 0 then c.shared || ' club' || case when c.shared > 1 then 's' else '' end || ' in common' end),
         c.interests, c.prompts, c.common, c.personality, coalesce(c.traits, '{}'), c.common_traits,
         (c.s_car or c.s_fam or c.s_make), c.s_pers
    from cand c
   where auth.uid() is not null
     and case kind
           when 'car' then (c.s_car or c.s_make)
           when 'personality' then c.s_pers
           when 'both' then c.s_pers and (c.s_car or c.s_make)
           else true end
   order by 9 desc, c.created_at desc
   limit greatest(1, least(lim, 50))
$$;
grant execute on function public.driver_suggestions(int, text) to authenticated;
