-- zingd: profile photos and bios. Safe to run more than once.
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check check (char_length(coalesce(bio, '')) <= 160);
alter table public.profiles add column if not exists vehicle_kind text not null default 'car';
alter table public.profiles drop constraint if exists profiles_vehicle_kind_check;
alter table public.profiles add constraint profiles_vehicle_kind_check check (vehicle_kind in ('car', 'two'));
grant update (display_name, car_model, city, avatar_path, bio, vehicle_kind) on public.profiles to authenticated;
