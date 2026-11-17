-- The AI allowance is now counted only by the `ai` edge function (with the secret key),
-- so signed-in people can't call the counter through the API at all.

drop function public.consume_ai_quota();

-- Counts one AI call for a person and says whether it is within today's limit of 40.
create function public.consume_ai_quota_for(p_user uuid) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.ai_usage as u (user_id, day, count)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into n;
  return n <= 40;
end;
$$;

revoke execute on function public.consume_ai_quota_for(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_quota_for(uuid) to service_role;
grant select, insert, update on public.ai_usage to service_role;
