-- zingd: video zings, music, and who can see a zing (everyone, or just your crew). Safe to re-run.
alter table public.checkins add column if not exists media text not null default 'photo' check (media in ('photo', 'video'));
alter table public.checkins add column if not exists video_path text;
alter table public.checkins add column if not exists music text check (music is null or music ~ '^[a-z0-9_]{2,40}$');
alter table public.checkins add column if not exists audience text not null default 'public' check (audience in ('public', 'crew'));

-- True when you and `other` are connected (accepted request either way).
create or replace function public.is_connected(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from connections c where c.status = 'accepted'
    and ((c.requester_id = auth.uid() and c.addressee_id = other) or (c.addressee_id = auth.uid() and c.requester_id = other)))
$$;

-- Crew-only zings are seen by you and your crew; public ones by everyone. Live for 24h unless kept.
drop policy if exists "read checkins" on public.checkins;
create policy "read checkins" on public.checkins for select using (
  user_id = auth.uid()
  or (not hidden and (keep or expires_at > now()) and (audience = 'public' or public.is_connected(user_id)))
);

-- The photo bucket also takes short videos (up to 15 MB).
update storage.buckets set file_size_limit = 15728640, allowed_mime_types = array['image/jpeg', 'video/mp4', 'video/quicktime'] where id = 'snaps';
