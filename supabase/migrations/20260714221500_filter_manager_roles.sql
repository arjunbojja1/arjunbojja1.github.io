create or replace function public.is_senior_job_title(p_title text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_title, '')) ~
    '(^|[^a-z0-9])(senior|sr[.]?|staff|principal|director|vice president|vp|head of|architect)([^a-z0-9]|$)'
    or lower(coalesce(p_title, '')) ~
      '(^|[^a-z0-9])((technical|tech|team|engineering|software|data|product) lead|lead,? (software|data|machine learning|ml|ai|security|hardware|product|backend|frontend|full[- ]?stack|platform|cloud|mobile|systems?|engineer|developer)|(software )?engineering manager|engineer (ii|iii|iv|v|[2-9]))([^a-z0-9]|$)'
    or (
      lower(coalesce(p_title, '')) ~
        '(^|[^a-z0-9])(manager|supervisor)([^a-z0-9]|$)'
      and lower(coalesce(p_title, '')) !~
        '(^|[^a-z0-9])(intern(ship)?|new (college )?grad(uate)?|university graduate|recent graduate|graduate program|entry[- ]level|junior|associate product manager|apm)([^a-z0-9]|$)'
    );
$$;

revoke all on function public.is_senior_job_title(text) from public;

update public.notification_queue
set
  status = 'suppressed',
  last_error = null
where event = 'new_job'
  and status in ('pending', 'failed', 'skipped')
  and job_id in (
    select id
    from public.jobs
    where public.is_senior_job_title(title)
  );

update public.jobs
set
  status = 'closed',
  closed_at = coalesce(closed_at, now())
where status = 'open'
  and public.is_senior_job_title(title);
