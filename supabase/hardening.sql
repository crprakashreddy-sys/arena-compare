-- zingd: security hardening. Internal helpers are only for the database itself (triggers, cron, server),
-- never callable from the app or by anyone on the internet. Safe to re-run; run after everything else.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('tokens_for', 'send_event_reminders', 'send_push', 'take_ai_credit', 'refund_ai_credit', 'add_ai_credits')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
