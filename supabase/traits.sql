-- zingd: personality and lifestyle traits on profiles ("Your vibe"). Safe to re-run.
alter table public.profiles add column if not exists traits text[] not null default '{}';
alter table public.profiles drop constraint if exists profiles_traits_check;
alter table public.profiles add constraint profiles_traits_check check (cardinality(traits) <= 12);
grant update (traits) on public.profiles to authenticated;
