-- zingd: zings at any place, not just chargers (a café on the highway, a scenic stop, a meetup spot).
-- Safe to re-run.
alter table public.checkins alter column charger_id drop not null;
alter table public.checkins add column if not exists place_name text check (char_length(place_name) <= 80);
alter table public.checkins add column if not exists place_lat double precision;
alter table public.checkins add column if not exists place_lng double precision;
alter table public.checkins drop constraint if exists checkins_where_check;
alter table public.checkins add constraint checkins_where_check
  check (charger_id is not null or (place_name is not null and place_lat is not null and place_lng is not null));
create index if not exists checkins_place on public.checkins (place_lat, place_lng) where charger_id is null;

-- Zing Score works for places too: points for being right there.
create or replace function public.score_zap() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c record;
  d float8;
  base int; label text;
  parts jsonb := '[]';
  total int := 0;
  today int;
  daily_cap constant int := 600;
begin
  -- Distance from the charger, or from the place for zings tagged somewhere else.
  if new.charger_id is not null then
    select lat, lng into c from public.chargers where id = new.charger_id;
  else
    select new.place_lat as lat, new.place_lng as lng into c;
  end if;
  if new.taken_lat is not null and new.taken_lng is not null and c.lat is not null then
    d := public.distance_m(new.taken_lat, new.taken_lng, c.lat, c.lng);
    new.distance_m := round(d)::int;
  else
    new.distance_m := null;
  end if;

  -- Base points by distance. A fuzzy GPS fix (worse than 150 m) or a faked location
  -- can't claim the top tiers.
  if new.distance_m is null or coalesce(new.taken_mocked, false) then
    base := 5;   label := 'Location unknown';
  elsif new.distance_m <= 60 and coalesce(new.taken_accuracy_m, 0) <= 150 then
    base := 100; label := case when new.charger_id is null then 'On the spot' else 'At the plug' end;
  elsif new.distance_m <= 200 and coalesce(new.taken_accuracy_m, 0) <= 150 then
    base := 60;  label := case when new.charger_id is null then 'Right there' else 'At the station' end;
  elsif new.distance_m <= 1000 then
    base := 25;  label := 'Nearby';
  else
    base := 5;   label := case when new.charger_id is null then 'Far from the place' else 'Far from the charger' end;
  end if;
  parts := parts || jsonb_build_object('label', label, 'points', base);
  total := base;

  -- Photo bonus.
  if new.photo_path is not null then
    parts := parts || jsonb_build_object('label', 'Photo', 'points', 20);
    total := total + 20;
  end if;

  -- Fresh info: nobody else zapped this charger in the last 3 hours. Only counts on site.
  if base >= 60 and not exists (
    select 1 from public.checkins x
     where x.charger_id = new.charger_id and x.user_id <> new.user_id
       and not x.hidden and x.created_at > now() - interval '3 hours') then
    parts := parts || jsonb_build_object('label', 'Fresh info', 'points', 25);
    total := total + 25;
  end if;

  -- No points for zapping the same charger again within 3 hours.
  if exists (
    select 1 from public.checkins x
     where x.charger_id = new.charger_id and x.user_id = new.user_id
       and x.zap_score > 0 and x.created_at > now() - interval '3 hours') then
    parts := jsonb_build_array(jsonb_build_object('label', 'Already zapped here in the last 3 hours', 'points', 0));
    total := 0;
  end if;

  -- Daily cap.
  select coalesce(sum(zap_score), 0) into today from public.checkins
   where user_id = new.user_id and created_at > date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  if total > 0 and today + total > daily_cap then
    parts := parts || jsonb_build_object('label', 'Daily limit reached', 'points', greatest(daily_cap - today, 0) - total);
    total := greatest(daily_cap - today, 0);
  end if;

  new.zap_score := total;
  new.score_breakdown := parts;
  -- Throw the location away.
  new.taken_lat := null; new.taken_lng := null; new.taken_accuracy_m := null; new.taken_mocked := null;
  return new;
end $$;
