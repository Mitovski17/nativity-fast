-- Nativity Fast tracker: every person's data is private to them.
-- The app keeps its state as a few JSON documents per person (profile, plans,
-- library, and one log per month), the same shape the Claude artifact used.

create table public.user_docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  constraint user_docs_key_shape check (key ~ '^(profile|plans|library|log-[0-9]{4}-[0-9]{2})$'),
  constraint user_docs_size check (pg_column_size(data) < 1048576)
);

comment on table public.user_docs is 'One row per app document per person; readable and writable only by its owner.';

create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_docs_touch
before update on public.user_docs
for each row execute function public.touch_updated_at();

alter table public.user_docs enable row level security;

create policy "Owners read their documents" on public.user_docs
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners add their documents" on public.user_docs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owners change their documents" on public.user_docs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners delete their documents" on public.user_docs
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.user_docs from anon;
grant select, insert, update, delete on public.user_docs to authenticated;


-- AI photo scans cost money per call, so each person gets a daily allowance.
-- People can see their own count; only consume_ai_quota() can change it.

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

create policy "Owners read their AI usage" on public.ai_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- Counts one AI call for the signed-in person and says whether it is within today's limit.
create function public.consume_ai_quota() returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  insert into public.ai_usage as u (user_id, day, count)
  values (uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into n;
  return n <= 40;
end;
$$;

revoke execute on function public.consume_ai_quota() from public, anon;
grant execute on function public.consume_ai_quota() to authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
