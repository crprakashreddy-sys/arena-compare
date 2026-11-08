-- zingd: real charging speeds drivers measured, so every charger's estimate gets truer. Safe to re-run.
create table if not exists public.charge_speeds (
  id uuid primary key default gen_random_uuid(),
  charger_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('dc', 'ac')),
  kw numeric not null check (kw > 0 and kw <= 400),
  car_model text,
  created_at timestamptz not null default now()
);
create index if not exists charge_speeds_charger on public.charge_speeds (charger_id, kind, created_at desc);

alter table public.charge_speeds enable row level security;
drop policy if exists "read speeds" on public.charge_speeds;
create policy "read speeds" on public.charge_speeds for select using (true);
drop policy if exists "add my speed" on public.charge_speeds;
create policy "add my speed" on public.charge_speeds for insert to authenticated with check (user_id = auth.uid());

-- Typical real speed per charger and gun type, from the last 90 days (median, so one odd charge can't skew it).
drop view if exists public.charger_speed_stats;
create view public.charger_speed_stats with (security_invoker = on) as
  select charger_id, kind,
         round(percentile_cont(0.5) within group (order by kw)::numeric, 1) as typical_kw,
         count(*)::int as charges,
         max(created_at) as last_at
    from public.charge_speeds
   where created_at > now() - interval '90 days'
   group by charger_id, kind;
grant select on public.charger_speed_stats to anon, authenticated;
