create or replace function public.portal_list_all_judge_results(actor_username text, actor_password text)
returns table (
  id bigint,
  submitted_at timestamptz,
  judge_username text,
  judge_company text,
  entrant_id text,
  category text,
  total_score integer,
  comments text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor public.portal_users;
begin
  actor := public.portal_require_actor(actor_username, actor_password);

  if not (actor.super_admin or (actor.admin and actor.judge)) then
    raise exception 'Only admin judges and super admins can manage judge results';
  end if;

  return query
  select
    j.id,
    j.submitted_at,
    j.judge_username,
    j.judge_company,
    j.entrant_id,
    j.category,
    j.total_score,
    j.comments
  from public.judge_scores as j
  order by j.submitted_at desc, j.id desc;
end;
$$;

create or replace function public.portal_delete_judge_results(
  actor_username text,
  actor_password text,
  target_ids bigint[] default null,
  purge_all boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor public.portal_users;
  deleted_count integer := 0;
begin
  actor := public.portal_require_actor(actor_username, actor_password);

  if not (actor.super_admin or (actor.admin and actor.judge)) then
    raise exception 'Only admin judges and super admins can manage judge results';
  end if;

  if coalesce(purge_all, false) then
    delete from public.judge_scores
    where id is not null;
    get diagnostics deleted_count = row_count;

    return jsonb_build_object(
      'deleted_count', deleted_count,
      'scope', 'all'
    );
  end if;

  if coalesce(array_length(target_ids, 1), 0) = 0 then
    raise exception 'Select at least one score submission to delete';
  end if;

  delete from public.judge_scores
  where id = any(target_ids);

  get diagnostics deleted_count = row_count;

  return jsonb_build_object(
    'deleted_count', deleted_count,
    'scope', 'selected'
  );
end;
$$;

grant execute on function public.portal_list_all_judge_results(text, text) to anon, authenticated;
grant execute on function public.portal_delete_judge_results(text, text, bigint[], boolean) to anon, authenticated;
