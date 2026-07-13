create or replace function public.get_job_feed(
  p_mode text default 'for_you',
  p_search text default null,
  p_roles text[] default null,
  p_sources public.job_source[] default null,
  p_remote_only boolean default false,
  p_application_status public.application_status default null,
  p_only_unseen boolean default false,
  p_sort text default 'newest',
  p_limit integer default 40,
  p_offset integer default 0
)
returns table (
  id text,
  source public.job_source,
  company text,
  title text,
  location text,
  url text,
  description text,
  role_category text,
  posted_at date,
  first_seen_at timestamptz,
  recommendation_terms text[],
  is_remote boolean,
  application_status public.application_status,
  viewed_at timestamptz,
  hidden_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with own_preferences as (
    select preferences.*
    from public.preferences
    where user_id = (select auth.uid())
  ),
  filtered as (
    select
      jobs.id,
      jobs.source,
      jobs.company,
      jobs.title,
      jobs.location,
      jobs.url,
      jobs.description,
      jobs.role_category,
      jobs.posted_at,
      jobs.first_seen_at,
      jobs.recommendation_terms,
      jobs.is_remote,
      applications.status as application_status,
      job_user_state.viewed_at,
      job_user_state.hidden_at,
      coalesce(jobs.posted_at::timestamptz, jobs.first_seen_at) as sort_at
    from public.jobs
    cross join own_preferences
    left join public.applications
      on applications.user_id = (select auth.uid())
      and applications.job_id = jobs.id
    left join public.job_user_state
      on job_user_state.user_id = (select auth.uid())
      and job_user_state.job_id = jobs.id
    where jobs.status = 'open'
      and (
        (p_mode = 'hidden' and job_user_state.hidden_at is not null)
        or (p_mode <> 'hidden' and job_user_state.hidden_at is null)
      )
      and (
        p_mode <> 'for_you'
        or (
          (
            jobs.source = any(own_preferences.source_keys)
            or (
              jobs.source = 'ats'
              and coalesce(
                (jobs.metadata ->> 'shared_monitor')::boolean,
                false
              )
            )
          )
          and jobs.company = any(own_preferences.companies)
          and (
            cardinality(own_preferences.locations) = 0
            or exists (
              select 1
              from unnest(own_preferences.locations) as requested_location
              where jobs.location ilike '%' || requested_location || '%'
            )
          )
          and (
            not own_preferences.remote_only
            or jobs.is_remote
          )
          and (
            own_preferences.allow_no_sponsorship
            or not jobs.no_sponsorship
          )
          and (
            own_preferences.allow_citizenship_required
            or not jobs.citizenship_required
          )
          and (
            cardinality(own_preferences.role_categories) = 0
            or jobs.role_category = any(own_preferences.role_categories)
          )
          and not exists (
            select 1
            from unnest(own_preferences.include_keywords) as include_keyword
            where concat_ws(
              ' ',
              jobs.company,
              jobs.title,
              jobs.location,
              jobs.description
            ) not ilike '%' || include_keyword || '%'
          )
          and not exists (
            select 1
            from unnest(own_preferences.exclude_keywords) as exclude_keyword
            where concat_ws(
              ' ',
              jobs.company,
              jobs.title,
              jobs.location,
              jobs.description
            ) ilike '%' || exclude_keyword || '%'
          )
        )
      )
      and (
        nullif(trim(p_search), '') is null
        or concat_ws(
          ' ',
          jobs.company,
          jobs.title,
          jobs.location,
          jobs.description
        ) ilike '%' || trim(p_search) || '%'
      )
      and (
        p_roles is null
        or cardinality(p_roles) = 0
        or jobs.role_category = any(p_roles)
      )
      and (
        p_sources is null
        or cardinality(p_sources) = 0
        or jobs.source = any(p_sources)
      )
      and (not p_remote_only or jobs.is_remote)
      and (
        p_application_status is null
        or applications.status = p_application_status
      )
      and (not p_only_unseen or job_user_state.viewed_at is null)
  )
  select
    filtered.id,
    filtered.source,
    filtered.company,
    filtered.title,
    filtered.location,
    filtered.url,
    filtered.description,
    filtered.role_category,
    filtered.posted_at,
    filtered.first_seen_at,
    filtered.recommendation_terms,
    filtered.is_remote,
    filtered.application_status,
    filtered.viewed_at,
    filtered.hidden_at,
    count(*) over() as total_count
  from filtered
  order by
    case when p_sort = 'oldest' then filtered.sort_at end asc nulls last,
    case when p_sort <> 'oldest' then filtered.sort_at end desc nulls last,
    filtered.id
  limit least(greatest(p_limit, 1), 1000)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.get_job_feed(
  text,
  text,
  text[],
  public.job_source[],
  boolean,
  public.application_status,
  boolean,
  text,
  integer,
  integer
) from public;

grant execute on function public.get_job_feed(
  text,
  text,
  text[],
  public.job_source[],
  boolean,
  public.application_status,
  boolean,
  text,
  integer,
  integer
) to authenticated;

