-- Daily fasting verse at 7:00 in each phone's own time zone (Web Push).
-- Phones that opted in are stored here; pg_cron calls the daily-verse edge function
-- every 15 minutes and it sends to the subscriptions where it is now 7:xx local time.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  tz         text not null default 'Europe/Sofia',
  lang       text not null default 'bg',
  last_sent  date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_lang check (lang in ('bg', 'en')),
  constraint push_subscriptions_tz check (tz ~ '^[A-Za-z0-9_+/-]{1,64}$'),
  constraint push_subscriptions_endpoint check (endpoint ~ '^https://' and length(endpoint) < 1000)
);

create index push_subscriptions_user on public.push_subscriptions (user_id);

create trigger push_subscriptions_touch
before update on public.push_subscriptions
for each row execute function public.touch_updated_at();

alter table public.push_subscriptions enable row level security;

create policy "Owners read their push subscriptions" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add their push subscriptions" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners change their push subscriptions" on public.push_subscriptions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their push subscriptions" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, update, delete on public.push_subscriptions to service_role;

-- Subscriptions whose local time is 7:xx and that haven't had today's verse yet.
create function public.due_daily_verses()
returns table (id bigint, endpoint text, p256dh text, auth text, lang text, local_day date)
language sql
stable
set search_path = ''
as $$
  select s.id, s.endpoint, s.p256dh, s.auth, s.lang, (now() at time zone s.tz)::date
  from public.push_subscriptions s
  where s.tz in (select name from pg_catalog.pg_timezone_names)
    and extract(hour from (now() at time zone s.tz)) = 7
    and (s.last_sent is null or s.last_sent < (now() at time zone s.tz)::date);
$$;

-- Keys live in Supabase Vault. The cron secret is made here; the push (VAPID) key pair is
-- made by the daily-verse function on its first run, so no private key leaves Supabase.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'daily_verse_cron_secret', 'Shared secret pg_cron sends to the daily-verse function');

create function public.push_config()
returns table (vapid_public text, vapid_private text, cron_secret text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'daily_verse_cron_secret');
$$;

create function public.save_vapid_keys(p_public text, p_private text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from vault.secrets where name = 'vapid_private') then
    perform vault.create_secret(p_public, 'vapid_public', 'Web Push public key');
    perform vault.create_secret(p_private, 'vapid_private', 'Web Push private key');
  end if;
end;
$$;

revoke execute on function public.due_daily_verses() from public, anon, authenticated;
revoke execute on function public.push_config() from public, anon, authenticated;
revoke execute on function public.save_vapid_keys(text, text) from public, anon, authenticated;
grant execute on function public.due_daily_verses() to service_role;
grant execute on function public.push_config() to service_role;
grant execute on function public.save_vapid_keys(text, text) to service_role;

-- Every 15 minutes, so 7:00 is reached in every time zone (some are offset by :30 or :45).
select cron.schedule(
  'daily-verse',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://ggujbeofqimpbstnnkhm.supabase.co/functions/v1/daily-verse',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_verse_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
