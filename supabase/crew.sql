-- zingd: "Drivers like you" suggestions for the Crew screen. Safe to re-run.
-- Ranks other drivers by the same car, same brand, same city and shared clubs; never shows
-- people you're already connected to, have a pending request with, or have blocked (either way).
create or replace function public.driver_suggestions(lim int default 20)
returns table (
  id uuid, display_name text, car_model text, city text, avatar_path text, bio text,
  vehicle_verified boolean, shared_clubs int, score int, reason text
)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, lower(coalesce(p.car_model, '')) as car, lower(split_part(coalesce(p.car_model, ''), ' ', 1)) as make, lower(coalesce(p.city, '')) as city
      from profiles p where p.id = auth.uid()
  ),
  my_clubs as (select club_id from club_members where user_id = auth.uid()),
  cand as (
    select p.*,
      (select count(*) from club_members cm where cm.user_id = p.id and cm.club_id in (select club_id from my_clubs))::int as shared,
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
          + least(c.shared, 4) * 2 + case when c.avatar_path is not null then 1 else 0 end)::int as score,
         concat_ws(' · ',
           case when c.same_car then 'Also drives a ' || c.car_model when c.same_make then 'Fellow ' || split_part(c.car_model, ' ', 1) || ' owner' end,
           case when c.same_city then 'In ' || c.city end,
           case when c.shared > 0 then c.shared || ' club' || case when c.shared > 1 then 's' else '' end || ' in common' end) as reason
    from cand c
   where auth.uid() is not null
   order by score desc, c.created_at desc
   limit greatest(1, least(lim, 50))
$$;
grant execute on function public.driver_suggestions(int) to authenticated;
