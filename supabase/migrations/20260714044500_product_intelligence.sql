alter type public.queue_status add value if not exists 'suppressed';

alter table public.jobs
add column dedupe_key text,
add column verification_status text not null default 'unverified'
  check (verification_status in ('verified', 'unverified', 'dead')),
add column verified_at timestamptz,
add column salary_min integer check (salary_min is null or salary_min > 0),
add column salary_max integer check (
  salary_max is null or salary_max > 0
),
add column salary_currency text,
add column application_deadline date,
add column experience_min smallint check (
  experience_min is null or experience_min between 0 and 40
),
add column experience_max smallint check (
  experience_max is null or experience_max between 0 and 40
),
add column graduation_years smallint[] not null default '{}',
add column degree_required boolean;

alter table public.preferences
add column digest_max_jobs smallint not null default 10
  check (digest_max_jobs between 1 and 50);

alter table public.job_user_state
add column feedback text check (
  feedback is null or feedback in ('interested', 'not_interested')
);

alter table public.applications
add column resume_version text;

alter table public.notification_queue
add column retry_generation smallint not null default 0
  check (retry_generation between 0 and 1000);

create or replace function public.normalize_job_company(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      replace(lower(coalesce(value, '')), '&', ' and '),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.normalize_job_title(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              lower(coalesce(value, '')),
              '\[(no sponsorship|u\.?s\.? citizenship required)\]',
              ' ',
              'g'
            ),
            '\m(class of[[:space:]]+)?20[0-9]{2}[[:space:]]+(new grad(uate)?|graduate)\M',
            ' ',
            'g'
          ),
          '\m(new grad(uate)?|graduate)[[:space:]]+20[0-9]{2}\M',
          ' ',
          'g'
        ),
        '\m(new grad(uate)?|graduate)([[:space:]]+program)?\M',
        ' ',
        'g'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.normalize_job_location(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        lower(coalesce(value, '')),
        '\m(hybrid|on[- ]?site)\M',
        ' ',
        'g'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

update public.jobs
set
  dedupe_key = encode(extensions.digest(
    concat_ws(
      '|',
      public.normalize_job_company(company),
      public.normalize_job_title(title),
      public.normalize_job_location(location)
    ),
    'sha256'
  ), 'hex'),
  verification_status = case
    when source = 'ats' then 'verified'
    else verification_status
  end,
  verified_at = case
    when source = 'ats' then last_seen_at
    else verified_at
  end
where dedupe_key is null;

create index jobs_dedupe_status_idx
on public.jobs(dedupe_key, status, verified_at desc nulls last);

create or replace function public.retry_notification(p_queue_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_queue
  set
    status = 'pending',
    attempts = 0,
    retry_generation = retry_generation + 1,
    due_at = now(),
    last_error = null
  where id = p_queue_id
    and user_id = (select auth.uid())
    and status in ('failed', 'skipped');

  if not found then
    raise exception 'This alert cannot be retried';
  end if;
end;
$$;

create or replace function public.get_notification_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'last_successful_delivery_at', (
      select max(delivered_at)
      from public.notification_deliveries
      where user_id = (select auth.uid())
        and recipient_count > 0
    ),
    'successful_deliveries', (
      select count(*)
      from public.notification_deliveries
      where user_id = (select auth.uid())
        and recipient_count > 0
    ),
    'pending', (
      select count(*)
      from public.notification_queue
      where user_id = (select auth.uid())
        and status = 'pending'
    ),
    'failed', (
      select count(*)
      from public.notification_queue
      where user_id = (select auth.uid())
        and status in ('failed', 'skipped')
    ),
    'last_error', (
      select last_error
      from public.notification_queue
      where user_id = (select auth.uid())
        and last_error is not null
        and status in ('pending', 'failed', 'skipped')
      order by created_at desc
      limit 1
    )
  );
$$;

create or replace function public.set_job_group_hidden(
  p_job_id text,
  p_hidden boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_user_id uuid := (select auth.uid());
  requested_group_key text;
begin
  select coalesce(nullif(dedupe_key, ''), id)
  into requested_group_key
  from public.jobs
  where id = p_job_id;

  if requested_group_key is null then
    raise exception 'Job not found';
  end if;

  if p_hidden then
    insert into public.job_user_state (
      user_id,
      job_id,
      hidden_at,
      feedback
    )
    values (
      requested_user_id,
      p_job_id,
      now(),
      'not_interested'
    )
    on conflict (user_id, job_id) do update
    set
      hidden_at = excluded.hidden_at,
      feedback = excluded.feedback;
  else
    update public.job_user_state
    set
      hidden_at = null,
      feedback = case
        when feedback = 'not_interested' then null
        else feedback
      end
    where user_id = requested_user_id
      and job_id in (
        select id
        from public.jobs
        where coalesce(nullif(dedupe_key, ''), id) = requested_group_key
      );
  end if;
end;
$$;

drop function public.get_job_feed(
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
);

create function public.get_job_feed(
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
  feedback_profile as (
    select
      coalesce(
        array_agg(distinct jobs.company_key)
          filter (where jobs.company_key is not null),
        '{}'::text[]
      ) as disliked_companies,
      coalesce(
        array_agg(distinct jobs.role_category)
          filter (where jobs.role_category is not null),
        '{}'::text[]
      ) as disliked_roles
    from public.job_user_state
    join public.jobs on jobs.id = job_user_state.job_id
    where job_user_state.user_id = (select auth.uid())
      and job_user_state.feedback = 'not_interested'
  ),
  candidate_jobs as (
    select
      jobs.*,
      coalesce(nullif(jobs.dedupe_key, ''), jobs.id) as group_key
    from public.jobs
    where jobs.status = 'open'
      and not public.is_senior_job_title(jobs.title)
  ),
  group_state as (
    select
      candidate_jobs.group_key,
      (
        array_agg(
          applications.id
          order by applications.updated_at desc
        ) filter (where applications.id is not null)
      )[1] as application_id,
      (
        array_agg(
          applications.status
          order by applications.updated_at desc
        ) filter (where applications.status is not null)
      )[1] as application_status,
      max(job_user_state.viewed_at) as viewed_at,
      max(job_user_state.hidden_at) as hidden_at
    from candidate_jobs
    left join public.applications
      on applications.user_id = (select auth.uid())
      and applications.job_id = candidate_jobs.id
    left join public.job_user_state
      on job_user_state.user_id = (select auth.uid())
      and job_user_state.job_id = candidate_jobs.id
    group by candidate_jobs.group_key
  ),
  group_intelligence as (
    select
      candidate_jobs.group_key,
      min(candidate_jobs.salary_min) as salary_min,
      max(candidate_jobs.salary_max) as salary_max,
      (
        array_agg(
          candidate_jobs.salary_currency
          order by candidate_jobs.salary_max desc nulls last
        ) filter (where candidate_jobs.salary_currency is not null)
      )[1] as salary_currency,
      min(candidate_jobs.application_deadline) as application_deadline,
      min(candidate_jobs.experience_min) as experience_min,
      min(candidate_jobs.experience_max) as experience_max,
      coalesce(
        array_agg(distinct graduation_year)
          filter (where graduation_year is not null),
        '{}'::smallint[]
      ) as graduation_years,
      bool_and(candidate_jobs.degree_required)
        filter (where candidate_jobs.degree_required is not null)
        as degree_required
    from candidate_jobs
    left join lateral unnest(candidate_jobs.graduation_years)
      as years(graduation_year) on true
    group by candidate_jobs.group_key
  ),
  preference_filtered as (
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
      group_state.application_id,
      group_state.application_status,
      group_state.viewed_at,
      group_state.hidden_at,
      jobs.dedupe_key,
      jobs.verification_status,
      jobs.verified_at,
      group_intelligence.salary_min,
      group_intelligence.salary_max,
      group_intelligence.salary_currency,
      group_intelligence.application_deadline,
      group_intelligence.experience_min,
      group_intelligence.experience_max,
      group_intelligence.graduation_years,
      group_intelligence.degree_required,
      -(
        case
          when jobs.company_key = any(feedback_profile.disliked_companies)
            then 15
          else 0
        end
        +
        case
          when jobs.role_category = any(feedback_profile.disliked_roles)
            then 5
          else 0
        end
      )::integer as feedback_adjustment,
      coalesce(jobs.posted_at::timestamptz, jobs.first_seen_at) as sort_at
    from candidate_jobs as jobs
    cross join own_preferences
    cross join feedback_profile
    left join group_state on group_state.group_key = jobs.group_key
    left join group_intelligence
      on group_intelligence.group_key = jobs.group_key
    where (
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
          and (not own_preferences.remote_only or jobs.is_remote)
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
  ),
  deduplicated as (
    select
      preference_filtered.*,
      row_number() over (
        partition by coalesce(
          nullif(preference_filtered.dedupe_key, ''),
          preference_filtered.id
        )
        order by
          (preference_filtered.verification_status = 'verified') desc,
          preference_filtered.verified_at desc nulls last,
          preference_filtered.posted_at desc nulls last,
          preference_filtered.first_seen_at desc,
          preference_filtered.id
      ) as duplicate_rank
    from preference_filtered
  ),
  filtered as (
    select deduplicated.*
    from deduplicated
    where duplicate_rank = 1
      and (
        (p_mode = 'hidden' and hidden_at is not null)
        or (p_mode <> 'hidden' and hidden_at is null)
      )
      and (
        p_application_status is null
        or application_status = p_application_status
      )
      and (not p_only_unseen or viewed_at is null)
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
    filtered.application_id,
    filtered.application_status,
    filtered.viewed_at,
    filtered.hidden_at,
    filtered.dedupe_key,
    filtered.verification_status,
    filtered.verified_at,
    filtered.salary_min,
    filtered.salary_max,
    filtered.salary_currency,
    filtered.application_deadline,
    filtered.experience_min,
    filtered.experience_max,
    filtered.graduation_years,
    filtered.degree_required,
    filtered.feedback_adjustment,
    count(*) over() as total_count
  from filtered
  order by
    case when p_sort = 'oldest' then filtered.sort_at end asc nulls last,
    case when p_sort <> 'oldest' then filtered.sort_at end desc nulls last,
    filtered.id
  limit least(greatest(p_limit, 1), 1000)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.retry_notification(bigint) from public;
grant execute on function public.retry_notification(bigint) to authenticated;

revoke all on function public.get_notification_health() from public;
grant execute on function public.get_notification_health() to authenticated;

revoke all on function public.set_job_group_hidden(text, boolean) from public;
grant execute on function public.set_job_group_hidden(text, boolean)
to authenticated;

revoke all on function public.normalize_job_company(text) from public;
revoke all on function public.normalize_job_title(text) from public;
revoke all on function public.normalize_job_location(text) from public;

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
