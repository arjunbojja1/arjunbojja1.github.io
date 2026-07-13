create or replace function public.get_system_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'last_scan_at', (
      select max(completed_at)
      from public.source_runs
      where source_key in (
        'new_grad',
        'canada_new_grad',
        'internship',
        'offseason_internship'
      )
    ),
    'last_successful_scan_at', (
      select max(completed_at)
      from public.source_runs
      where success
    ),
    'failed_runs_24h', (
      select count(*)
      from public.source_runs
      where success = false
        and started_at > now() - interval '24 hours'
    ),
    'open_jobs', (
      select count(*)
      from public.jobs
      where status = 'open'
    ),
    'pending_notifications', (
      select count(*)
      from public.notification_queue
      where status = 'pending'
    ),
    'failed_notifications', (
      select count(*)
      from public.notification_queue
      where status = 'failed'
        and created_at > now() - interval '24 hours'
    ),
    'healthy_shared_monitors', (
      select count(*)
      from public.shared_company_monitors
      where enabled
        and last_error is null
        and last_checked_at > now() - interval '3 hours'
    ),
    'shared_monitor_errors', (
      select count(*)
      from public.shared_company_monitors
      where enabled
        and last_error is not null
    ),
    'email_fallback_configured', coalesce(
      (
        select (value ->> 'email_fallback')::boolean
        from public.scanner_state
        where key = 'capabilities'
      ),
      false
    )
  );
$$;

revoke all on function public.get_system_health() from public;
grant execute on function public.get_system_health() to authenticated;

