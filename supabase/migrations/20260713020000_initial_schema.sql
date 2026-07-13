create extension if not exists pgcrypto with schema extensions;

create type public.job_source as enum (
  'new_grad',
  'canada_new_grad',
  'internship',
  'offseason_internship',
  'ats'
);

create type public.job_status as enum ('open', 'closed');
create type public.application_status as enum (
  'saved',
  'applied',
  'interview',
  'offer',
  'rejected',
  'withdrawn'
);
create type public.delivery_mode as enum ('instant', 'daily');
create type public.ats_provider as enum (
  'greenhouse',
  'lever',
  'ashby',
  'workday'
);
create type public.notification_event as enum ('new_job', 'job_closed', 'digest');
create type public.queue_status as enum ('pending', 'processing', 'sent', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  timezone text not null default 'America/Los_Angeles',
  delivery_mode public.delivery_mode not null default 'instant',
  digest_hour smallint not null default 9 check (digest_hour between 0 and 23),
  quiet_start time,
  quiet_end time,
  resume_path text,
  resume_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  source_keys public.job_source[] not null default array['new_grad']::public.job_source[],
  companies text[] not null default '{}',
  locations text[] not null default '{}',
  role_categories text[] not null default '{}',
  include_keywords text[] not null default '{}',
  exclude_keywords text[] not null default '{}',
  remote_only boolean not null default false,
  allow_no_sponsorship boolean not null default true,
  allow_citizenship_required boolean not null default true,
  closure_alerts boolean not null default true,
  minimum_score smallint not null default 0 check (minimum_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(source_keys) > 0),
  check (cardinality(companies) <= 100),
  check (cardinality(include_keywords) <= 25),
  check (cardinality(exclude_keywords) <= 25)
);

create table public.jobs (
  id text primary key,
  source public.job_source not null,
  source_ref text,
  company text not null,
  company_key text not null,
  title text not null,
  location text not null default '',
  url text not null,
  description text not null default '',
  role_category text,
  posted_at date,
  is_remote boolean not null default false,
  no_sponsorship boolean not null default false,
  citizenship_required boolean not null default false,
  recommendation_terms text[] not null default '{}',
  status public.job_status not null default 'open',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (source, url)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id text references public.jobs(id) on delete set null,
  company text not null,
  title text not null,
  location text not null default '',
  url text,
  status public.application_status not null default 'saved',
  applied_at timestamptz,
  notes text not null default '' check (length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index applications_user_job_unique
  on public.applications(user_id, job_id)
  where job_id is not null;

create table public.company_monitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_name text not null,
  company_key text not null,
  provider public.ats_provider not null,
  career_url text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_key, provider)
);

create table public.notification_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id text references public.jobs(id) on delete cascade,
  event public.notification_event not null,
  due_at timestamptz not null,
  status public.queue_status not null default 'pending',
  attempts smallint not null default 0,
  last_error text,
  one_signal_notification_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, job_id, event)
);

create table public.notification_deliveries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id text references public.jobs(id) on delete set null,
  event public.notification_event not null,
  one_signal_notification_id text,
  recipient_count integer not null default 0,
  delivered_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table public.source_runs (
  id bigint generated always as identity primary key,
  source_key text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  jobs_seen integer not null default 0,
  jobs_added integer not null default 0,
  jobs_closed integer not null default 0,
  success boolean,
  error text
);

create index jobs_source_status_idx on public.jobs(source, status);
create index jobs_company_status_idx on public.jobs(company_key, status);
create index jobs_posted_at_idx on public.jobs(posted_at desc nulls last);
create index jobs_search_idx on public.jobs using gin (
  to_tsvector(
    'english'::regconfig,
    coalesce(company, '') || ' ' ||
    coalesce(title, '') || ' ' ||
    coalesce(location, '') || ' ' ||
    coalesce(description, '')
  )
);
create index applications_user_status_idx
  on public.applications(user_id, status, updated_at desc);
create index company_monitors_enabled_idx
  on public.company_monitors(enabled, provider);
create index notification_queue_due_idx
  on public.notification_queue(status, due_at)
  where status in ('pending', 'failed');

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger preferences_set_updated_at
before update on public.preferences
for each row execute function public.set_updated_at();

create trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_updated_at();

create trigger company_monitors_set_updated_at
before update on public.company_monitors
for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1),
      'Guest'
    )
  );

  insert into public.preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.preferences enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.company_monitors enable row level security;
alter table public.notification_queue enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.source_runs enable row level security;

create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy preferences_select_own
on public.preferences for select
to authenticated
using ((select auth.uid()) = user_id);

create policy preferences_update_own
on public.preferences for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy jobs_read_all
on public.jobs for select
to anon, authenticated
using (true);

create policy applications_select_own
on public.applications for select
to authenticated
using ((select auth.uid()) = user_id);

create policy applications_insert_own
on public.applications for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy applications_update_own
on public.applications for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy applications_delete_own
on public.applications for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy company_monitors_select_own
on public.company_monitors for select
to authenticated
using ((select auth.uid()) = user_id);

create policy company_monitors_insert_own
on public.company_monitors for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy company_monitors_update_own
on public.company_monitors for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy company_monitors_delete_own
on public.company_monitors for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy notification_queue_select_own
on public.notification_queue for select
to authenticated
using ((select auth.uid()) = user_id);

create policy notification_deliveries_select_own
on public.notification_deliveries for select
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'resumes',
  'resumes',
  false,
  5242880,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy resume_objects_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy resume_objects_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy resume_objects_update_own
on storage.objects for update
to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy resume_objects_delete_own
on storage.objects for delete
to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

grant usage on schema public to anon, authenticated;
grant select on public.jobs to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.preferences to authenticated;
grant select, insert, update, delete on public.applications to authenticated;
grant select, insert, update, delete on public.company_monitors to authenticated;
grant select on public.notification_queue to authenticated;
grant select on public.notification_deliveries to authenticated;
