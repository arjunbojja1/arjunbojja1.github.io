create function public.sync_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set
    email = new.email,
    display_name = coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      display_name
    )
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_identity_updated
after update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_profile_identity();
