-- zingd: GIFs and stickers in club chats and direct messages. Safe to re-run.
-- Only the GIF's GIPHY link is stored (GIPHY's rules don't allow copying the files).

alter table public.club_messages add column if not exists gif_url text check (gif_url is null or gif_url like 'https://%giphy.com/%');
alter table public.dm_messages add column if not exists gif_url text check (gif_url is null or gif_url like 'https://%giphy.com/%');
-- zingd's own sticker pack: just the sticker's name, e.g. 'charged'.
alter table public.club_messages add column if not exists sticker text check (sticker is null or sticker ~ '^[a-z0-9_]{2,30}$');
alter table public.dm_messages add column if not exists sticker text check (sticker is null or sticker ~ '^[a-z0-9_]{2,30}$');

-- A message can now be just a GIF: swap the old "needs text or a photo" rule for one that allows GIFs.
do $$
declare r record;
begin
  for r in select conrelid::regclass::text as tbl, conname from pg_constraint
            where contype = 'c' and conrelid in ('public.club_messages'::regclass, 'public.dm_messages'::regclass)
              and pg_get_constraintdef(oid) like '%photo_path%' and pg_get_constraintdef(oid) like '%body%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
alter table public.club_messages add constraint club_messages_content_check check (deleted or body is not null or photo_path is not null or gif_url is not null or sticker is not null);
alter table public.dm_messages add constraint dm_messages_content_check check (deleted or body is not null or photo_path is not null or gif_url is not null or sticker is not null);

-- Notifications say "sent a GIF" for GIF-only messages.
create or replace function public.on_dm() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record; sender text; other uuid; toks text[];
begin
  update dm_threads set last_at = now() where id = new.thread_id returning * into t;
  other := case when t.user_a = new.user_id then t.user_b else t.user_a end;
  select display_name into sender from profiles where id = new.user_id;
  toks := tokens_for(array[other], new.user_id, 'dms');
  if toks is not null then
    perform send_push(toks, sender,
      coalesce(left(new.body, 160), case when new.gif_url is not null then 'sent a GIF' when new.sticker is not null then 'sent a sticker' else 'sent a photo' end),
      jsonb_build_object('url', '/dm/' || new.thread_id));
  end if;
  return new;
end $$;

-- The inbox preview knows about GIFs too.
drop view if exists public.dm_inbox;
create view public.dm_inbox with (security_invoker = on) as
  select t.id, t.last_at,
    case when t.user_a = auth.uid() then t.user_b else t.user_a end as other_id,
    (select row_to_json(m) from (select body, photo_path, gif_url, sticker, user_id, deleted, created_at from dm_messages x
       where x.thread_id = t.id and not x.hidden order by created_at desc limit 1) m) as last,
    (select count(*) from dm_messages x where x.thread_id = t.id and not x.hidden and x.user_id <> auth.uid()
       and x.created_at > case when t.user_a = auth.uid() then t.a_read_at else t.b_read_at end)::int as unread
  from dm_threads t where auth.uid() in (t.user_a, t.user_b);

-- ───────── Club photo (group DP) ─────────
alter table public.clubs add column if not exists photo_path text;
-- Any club's admins can set or remove its photo (brand and model clubs too).
create or replace function public.set_club_photo(c text, p text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_club_admin(c) then raise exception 'Only club admins can change the club photo.'; end if;
  update public.clubs set photo_path = nullif(p, '') where id = c;
end $$;
grant execute on function public.set_club_photo(text, text) to authenticated;
-- Rebuild the club list view so it includes the photo.
drop view if exists public.club_stats;
create view public.club_stats with (security_invoker = on) as
  select c.*, (select count(*) from public.club_members m where m.club_id = c.id)::int as members
  from public.clubs c;
