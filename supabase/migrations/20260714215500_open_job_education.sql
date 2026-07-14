create or replace function public.get_job_feed_v3(
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
  application_id uuid,
  application_status public.application_status,
  viewed_at timestamptz,
  hidden_at timestamptz,
  dedupe_key text,
  verification_status text,
  verified_at timestamptz,
  salary_min integer,
  salary_max integer,
  salary_currency text,
  application_deadline date,
  experience_min smallint,
  experience_max smallint,
  graduation_years smallint[],
  degree_required boolean,
  feedback_adjustment integer,
  total_count bigint,
  education_level text
)
language sql
stable
security definer
set search_path = ''
as $$
  with feed as (
    select *
    from public.get_job_feed_v2(
      p_mode,
      p_search,
      p_roles,
      p_sources,
      p_remote_only,
      p_application_status,
      p_only_unseen,
      p_sort,
      p_limit,
      p_offset
    )
  ),
  education_groups as (
    select
      coalesce(nullif(jobs.dedupe_key, ''), jobs.id) as group_key,
      case max(
        case jobs.education_level
          when 'phd' then 3
          when 'masters' then 2
          when 'bachelors' then 1
          else 0
        end
      )
        when 3 then 'phd'
        when 2 then 'masters'
        when 1 then 'bachelors'
        else null
      end as education_level
    from public.jobs
    where jobs.status = 'open'
      and jobs.education_level is not null
    group by coalesce(nullif(jobs.dedupe_key, ''), jobs.id)
  )
  select
    feed.id,
    feed.source,
    feed.company,
    feed.title,
    feed.location,
    feed.url,
    feed.description,
    feed.role_category,
    feed.posted_at,
    feed.first_seen_at,
    feed.recommendation_terms,
    feed.is_remote,
    feed.application_id,
    feed.application_status,
    feed.viewed_at,
    feed.hidden_at,
    feed.dedupe_key,
    feed.verification_status,
    feed.verified_at,
    feed.salary_min,
    feed.salary_max,
    feed.salary_currency,
    feed.application_deadline,
    feed.experience_min,
    feed.experience_max,
    feed.graduation_years,
    feed.degree_required,
    feed.feedback_adjustment,
    feed.total_count,
    education_groups.education_level
  from feed
  left join education_groups
    on education_groups.group_key = coalesce(
      nullif(feed.dedupe_key, ''),
      feed.id
    );
$$;

revoke all on function public.get_job_feed_v3(
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

grant execute on function public.get_job_feed_v3(
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
