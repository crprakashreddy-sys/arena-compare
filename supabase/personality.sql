-- zingd: EV personality type on each profile (from the quiz). Safe to re-run.
alter table public.profiles add column if not exists personality text check (personality is null or personality in
  ('road_tripper', 'range_master', 'city_glider', 'tech_geek', 'eco_warrior', 'thrill_seeker', 'social_charger', 'night_cruiser'));
grant update (personality) on public.profiles to authenticated;
-- Make sure the allowed values are enforced even if the column was created earlier without them.
alter table public.profiles drop constraint if exists profiles_personality_check;
alter table public.profiles add constraint profiles_personality_check check (personality is null or personality in
  ('road_tripper', 'range_master', 'city_glider', 'tech_geek', 'eco_warrior', 'thrill_seeker', 'social_charger', 'night_cruiser'));
