create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_user_id uuid := (select auth.uid());
begin
  if requested_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  then
    raise exception 'A registered account is required';
  end if;

  delete from auth.users
  where id = requested_user_id;
end;
$$;

revoke all on function public.delete_current_user() from public;
grant execute on function public.delete_current_user() to authenticated;

