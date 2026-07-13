drop policy profiles_update_own on public.profiles;
drop policy preferences_update_own on public.preferences;

create policy profiles_update_own
on public.profiles for update
to authenticated
using (
  (select auth.uid()) = id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
)
with check (
  (select auth.uid()) = id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy preferences_update_own
on public.preferences for update
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
)
with check (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);
