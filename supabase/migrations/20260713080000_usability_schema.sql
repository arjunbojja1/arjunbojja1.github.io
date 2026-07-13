alter type public.notification_event add value if not exists 'test';

alter table public.preferences
add column email_fallback boolean not null default false;

alter table public.applications
add column deadline_at date,
add column next_step_at timestamptz,
add column contact text not null default '' check (length(contact) <= 500),
add column archived boolean not null default false;

alter table public.notification_queue
add column read_at timestamptz;

create table public.job_user_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id text not null references public.jobs(id) on delete cascade,
  viewed_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create trigger job_user_state_set_updated_at
before update on public.job_user_state
for each row execute function public.set_updated_at();

create table public.shared_company_monitors (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  company_key text not null unique,
  provider public.ats_provider not null,
  career_url text not null unique,
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_company_monitors_approved_url check (
    career_url ~* '^https://(boards|job-boards(\.eu)?)\.greenhouse\.io/[^/?#]+'
    or career_url ~* '^https://jobs(\.eu)?\.lever\.co/[^/?#]+'
    or career_url ~* '^https://jobs\.ashbyhq\.com/[^/?#]+'
    or career_url ~* '^https://[^./]+\.[^./]+\.myworkdayjobs\.com/([a-z]{2}-[a-z]{2}/)?[^/?#]+'
  )
);

create table public.scanner_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create trigger shared_company_monitors_set_updated_at
before update on public.shared_company_monitors
for each row execute function public.set_updated_at();

create index job_user_state_user_hidden_idx
on public.job_user_state(user_id, hidden_at, updated_at desc);

create index notification_queue_user_created_idx
on public.notification_queue(user_id, created_at desc);

create index applications_user_archived_idx
on public.applications(user_id, archived, updated_at desc);

create index shared_company_monitors_enabled_idx
on public.shared_company_monitors(enabled, provider);

alter table public.job_user_state enable row level security;
alter table public.shared_company_monitors enable row level security;

create policy job_user_state_select_own
on public.job_user_state for select
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy job_user_state_insert_own
on public.job_user_state for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy job_user_state_update_own
on public.job_user_state for update
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
)
with check (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

create policy job_user_state_delete_own
on public.job_user_state for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

revoke update on public.notification_queue from authenticated;
grant update (read_at) on public.notification_queue to authenticated;

create policy notification_queue_mark_read_own
on public.notification_queue for update
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
)
with check (
  (select auth.uid()) = user_id
  and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
);

grant all privileges on public.job_user_state to service_role;
grant all privileges on public.shared_company_monitors to service_role;
grant all privileges on public.scanner_state to service_role;
grant select, insert, update, delete on public.job_user_state to authenticated;
