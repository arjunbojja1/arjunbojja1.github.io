drop index public.applications_user_job_unique;

alter table public.applications
add constraint applications_user_job_unique unique (user_id, job_id);

alter table public.company_monitors
add constraint company_monitors_approved_url check (
  career_url ~* '^https://(boards|job-boards(\.eu)?)\.greenhouse\.io/[^/?#]+'
  or career_url ~* '^https://jobs(\.eu)?\.lever\.co/[^/?#]+'
  or career_url ~* '^https://jobs\.ashbyhq\.com/[^/?#]+'
  or career_url ~* '^https://[^./]+\.[^./]+\.myworkdayjobs\.com/([a-z]{2}-[a-z]{2}/)?[^/?#]+'
);

drop policy applications_select_own on public.applications;
drop policy applications_insert_own on public.applications;
drop policy applications_update_own on public.applications;
drop policy applications_delete_own on public.applications;

create policy applications_select_own
on public.applications for select
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy applications_insert_own
on public.applications for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy applications_update_own
on public.applications for update
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
)
with check (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy applications_delete_own
on public.applications for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

drop policy company_monitors_select_own on public.company_monitors;
drop policy company_monitors_insert_own on public.company_monitors;
drop policy company_monitors_update_own on public.company_monitors;
drop policy company_monitors_delete_own on public.company_monitors;

create policy company_monitors_select_own
on public.company_monitors for select
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy company_monitors_insert_own
on public.company_monitors for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy company_monitors_update_own
on public.company_monitors for update
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
)
with check (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy company_monitors_delete_own
on public.company_monitors for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

drop policy resume_objects_select_own on storage.objects;
drop policy resume_objects_insert_own on storage.objects;
drop policy resume_objects_update_own on storage.objects;
drop policy resume_objects_delete_own on storage.objects;

create policy resume_objects_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy resume_objects_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy resume_objects_update_own
on storage.objects for update
to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
)
with check (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy resume_objects_delete_own
on storage.objects for delete
to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);
