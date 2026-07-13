alter table public.scanner_state enable row level security;

revoke all privileges on public.scanner_state from anon, authenticated;
grant all privileges on public.scanner_state to service_role;

alter type public.queue_status add value if not exists 'skipped';

