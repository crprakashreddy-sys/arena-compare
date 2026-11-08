-- zingd: premium AI cartoons. Credits (1 free per person), purchases from the App Store via RevenueCat. Safe to re-run.
create table if not exists public.ai_credits (
  user_id uuid primary key references auth.users on delete cascade,
  credits int not null default 1 check (credits >= 0),
  used int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.ai_credits enable row level security;
drop policy if exists "read own ai credits" on public.ai_credits;
create policy "read own ai credits" on public.ai_credits for select using (user_id = auth.uid());

create table if not exists public.ai_purchases (
  id text primary key,                       -- store transaction id (idempotency)
  user_id uuid not null references auth.users on delete cascade,
  product text not null,
  credits int not null,
  created_at timestamptz not null default now()
);
alter table public.ai_purchases enable row level security; -- no policies: only the server writes here

-- My credits (creates my row with the 1 free cartoon on first look).
create or replace function public.my_ai_credits() returns int
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 0; end if;
  insert into ai_credits (user_id) values (auth.uid()) on conflict do nothing;
  return (select credits from ai_credits where user_id = auth.uid());
end $$;
grant execute on function public.my_ai_credits() to authenticated;

-- Server only (edge functions use the service role).
create or replace function public.take_ai_credit(u uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  insert into ai_credits (user_id) values (u) on conflict do nothing;
  update ai_credits set credits = credits - 1, used = used + 1, updated_at = now() where user_id = u and credits > 0 returning true into ok;
  return coalesce(ok, false);
end $$;
create or replace function public.refund_ai_credit(u uuid) returns void
language sql security definer set search_path = public as $$
  update ai_credits set credits = credits + 1, used = greatest(used - 1, 0), updated_at = now() where user_id = u
$$;
create or replace function public.add_ai_credits(tx text, u uuid, prod text, n int) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into ai_purchases (id, user_id, product, credits) values (tx, u, prod, n);
  insert into ai_credits (user_id, credits) values (u, 1 + n)
    on conflict (user_id) do update set credits = ai_credits.credits + n, updated_at = now();
  return true;
exception when unique_violation then return false;  -- already counted
end $$;
revoke all on function public.take_ai_credit(uuid) from public, anon, authenticated;
revoke all on function public.refund_ai_credit(uuid) from public, anon, authenticated;
revoke all on function public.add_ai_credits(text, uuid, text, int) from public, anon, authenticated;

-- AI images come back as PNG.
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'] where id = 'snaps';
