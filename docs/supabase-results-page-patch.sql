create or replace function public.portal_list_category_leaders(actor_username text, actor_password text)
returns table (
  category text,
  entrant_id text,
  rank_position integer,
  average_score numeric,
  best_total integer,
  score_count integer,
  latest_submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor public.portal_users;
begin
  actor := public.portal_require_actor(actor_username, actor_password);

  if not (actor.judge or actor.admin or actor.super_admin) then
    raise exception 'You do not have permission to view category leaders';
  end if;

  return query
  with aggregated as (
    select
      j.category,
      j.entrant_id,
      round(avg(j.total_score)::numeric, 2) as average_score,
      max(j.total_score) as best_total,
      count(*)::integer as score_count,
      max(j.submitted_at) as latest_submitted_at
    from public.judge_scores as j
    group by j.category, j.entrant_id
  ),
  ranked as (
    select
      aggregated.category,
      aggregated.entrant_id,
      row_number() over (
        partition by aggregated.category
        order by
          aggregated.average_score desc,
          aggregated.best_total desc,
          aggregated.score_count desc,
          aggregated.latest_submitted_at desc,
          aggregated.entrant_id asc
      )::integer as rank_position,
      aggregated.average_score,
      aggregated.best_total,
      aggregated.score_count,
      aggregated.latest_submitted_at
    from aggregated
  )
  select
    ranked.category,
    ranked.entrant_id,
    ranked.rank_position,
    ranked.average_score,
    ranked.best_total,
    ranked.score_count,
    ranked.latest_submitted_at
  from ranked
  where ranked.rank_position <= 5
  order by ranked.category, ranked.rank_position;
end;
$$;

grant execute on function public.portal_list_category_leaders(text, text) to anon, authenticated;
