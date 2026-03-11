create extension if not exists pgcrypto with schema extensions;

create table if not exists public.portal_users (
  id uuid primary key default extensions.gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  company text not null,
  volunteer boolean not null default false,
  owner boolean not null default false,
  judge boolean not null default false,
  admin boolean not null default false,
  super_admin boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint portal_users_super_admin_implies_admin check (not super_admin or admin)
);

create table if not exists public.judge_scores (
  id bigint generated always as identity primary key,
  submitted_at timestamptz not null default timezone('utc', now()),
  judge_username text not null references public.portal_users (username) on update cascade,
  judge_company text not null,
  entrant_id text not null,
  category text not null,
  craftsmanship integer not null,
  presentation integer not null,
  difficulty integer not null,
  theme_fit integer not null,
  total_score integer not null,
  comments text not null default ''
);

alter table public.judge_scores
drop column if exists model_title;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists portal_users_set_updated_at on public.portal_users;
create trigger portal_users_set_updated_at
before update on public.portal_users
for each row
execute function public.set_updated_at();

alter table public.portal_users enable row level security;
alter table public.judge_scores enable row level security;

revoke all on public.portal_users from anon, authenticated;
revoke all on public.judge_scores from anon, authenticated;

create or replace function public.portal_require_actor(p_username text, p_password text)
returns public.portal_users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor public.portal_users;
  normalized_username text := lower(trim(coalesce(p_username, '')));
begin
  select pu.*
  into actor
  from public.portal_users as pu
  where pu.username = normalized_username;

  if actor is null or actor.password_hash <> extensions.crypt(coalesce(p_password, ''), actor.password_hash) then
    raise exception 'Invalid username or password';
  end if;

  return actor;
end;
$$;

create or replace function public.portal_can_manage(actor public.portal_users, target public.portal_users)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select actor.super_admin or (actor.admin and actor.company = target.company and not target.super_admin);
$$;

revoke all on function public.portal_require_actor(text, text) from public, anon, authenticated;
revoke all on function public.portal_can_manage(public.portal_users, public.portal_users) from public, anon, authenticated;

create or replace function public.portal_ping()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object('ok', true, 'service', 'ghmx_portal');
$$;

create or replace function public.portal_login(p_username text, p_password text)
returns table (
  username text,
  company text,
  volunteer boolean,
  owner boolean,
  judge boolean,
  admin boolean,
  super_admin boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor public.portal_users;
begin
  actor := public.portal_require_actor(p_username, p_password);

  return query
  select
    actor.username,
    actor.company,
    actor.volunteer,
    actor.owner,
    actor.judge,
    actor.admin,
    actor.super_admin;
end;
$$;

create or replace function public.portal_list_users(actor_username text, actor_password text)
returns table (
  username text,
  company text,
  volunteer boolean,
  owner boolean,
  judge boolean,
  admin boolean,
  super_admin boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor public.portal_users;
begin
  actor := public.portal_require_actor(actor_username, actor_password);

  if not (actor.admin or actor.owner or actor.super_admin) then
    raise exception 'You do not have permission to manage users';
  end if;

  return query
  select
    u.username,
    u.company,
    u.volunteer,
    u.owner,
    u.judge,
    u.admin,
    u.super_admin
  from public.portal_users as u
  where actor.super_admin or (u.company = actor.company and not u.super_admin)
  order by u.username;
end;
$$;

create or replace function public.portal_upsert_user(
  actor_username text,
  actor_password text,
  original_username text default null,
  target_username text default null,
  target_password text default null,
  target_company text default null,
  target_volunteer boolean default false,
  target_owner boolean default false,
  target_judge boolean default false,
  target_admin boolean default false,
  target_super_admin boolean default false
)
returns table (
  username text,
  company text,
  volunteer boolean,
  owner boolean,
  judge boolean,
  admin boolean,
  super_admin boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor public.portal_users;
  existing public.portal_users;
  lookup_username text := lower(trim(coalesce(original_username, target_username, '')));
  normalized_target_username text := lower(trim(coalesce(target_username, '')));
  resolved_company text := trim(coalesce(target_company, ''));
  resolved_admin boolean := coalesce(target_admin, false);
  resolved_super_admin boolean := coalesce(target_super_admin, false);
begin
  actor := public.portal_require_actor(actor_username, actor_password);

  if not (actor.admin or actor.owner or actor.super_admin) then
    raise exception 'You do not have permission to manage users';
  end if;

  if normalized_target_username = '' then
    raise exception 'Username is required';
  end if;

  if not actor.super_admin then
    resolved_company := actor.company;
    resolved_admin := false;
    resolved_super_admin := false;
  elsif resolved_company = '' then
    raise exception 'Company is required';
  end if;

  if resolved_super_admin then
    resolved_admin := true;
  end if;

  select pu.*
  into existing
  from public.portal_users as pu
  where pu.username = lookup_username;

  if existing is not null then
    if actor.owner and not actor.admin and not actor.super_admin then
      raise exception 'Owners can add new users only';
    end if;

    if not public.portal_can_manage(actor, existing) then
      raise exception 'You cannot edit this user';
    end if;

    if not actor.super_admin then
      resolved_company := actor.company;
      resolved_admin := existing.admin;
      resolved_super_admin := existing.super_admin;
    end if;

    if existing.super_admin and not resolved_super_admin and (
      select count(*)
      from public.portal_users as pu
      where pu.super_admin
    ) <= 1 then
      raise exception 'At least one Super admin account is required';
    end if;

    update public.portal_users
    set
      username = normalized_target_username,
      company = resolved_company,
      volunteer = coalesce(target_volunteer, false),
      owner = coalesce(target_owner, false),
      judge = coalesce(target_judge, false),
      admin = resolved_admin,
      super_admin = resolved_super_admin,
      password_hash = case
        when coalesce(target_password, '') = '' then password_hash
        else extensions.crypt(target_password, extensions.gen_salt('bf'))
      end
    where id = existing.id;
  else
    if coalesce(target_password, '') = '' then
      raise exception 'Password is required for new users';
    end if;

    insert into public.portal_users (
      username,
      password_hash,
      company,
      volunteer,
      owner,
      judge,
      admin,
      super_admin
    )
    values (
      normalized_target_username,
      extensions.crypt(target_password, extensions.gen_salt('bf')),
      resolved_company,
      coalesce(target_volunteer, false),
      coalesce(target_owner, false),
      coalesce(target_judge, false),
      resolved_admin,
      resolved_super_admin
    );
  end if;

  return query
  select
    u.username,
    u.company,
    u.volunteer,
    u.owner,
    u.judge,
    u.admin,
    u.super_admin
  from public.portal_users as u
  where u.username = normalized_target_username;
end;
$$;

create or replace function public.portal_delete_user(actor_username text, actor_password text, target_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor public.portal_users;
  target public.portal_users;
begin
  actor := public.portal_require_actor(actor_username, actor_password);

  if not (actor.admin or actor.super_admin) then
    raise exception 'Only admins and super admins can delete users';
  end if;

  select pu.*
  into target
  from public.portal_users as pu
  where pu.username = lower(trim(coalesce(target_username, '')));

  if target is null then
    raise exception 'User not found';
  end if;

  if lower(actor.username) = lower(target.username) then
    raise exception 'You cannot delete your own active account';
  end if;

  if not public.portal_can_manage(actor, target) then
    raise exception 'You cannot delete this user';
  end if;

  if target.super_admin and (
    select count(*)
    from public.portal_users as pu
    where pu.super_admin
  ) <= 1 then
    raise exception 'At least one Super admin account is required';
  end if;

  delete from public.portal_users
  where id = target.id;

  return jsonb_build_object('deleted', target.username);
end;
$$;

drop function if exists public.portal_submit_judge_score(text, text, text, text, text, integer, integer, integer, integer, text);

create or replace function public.portal_submit_judge_score(
  actor_username text,
  actor_password text,
  entrant_id text,
  category text,
  craftsmanship integer,
  presentation integer,
  difficulty integer,
  theme_fit integer,
  comments text default ''
)
returns table (
  id bigint,
  submitted_at timestamptz,
  total_score integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor public.portal_users;
  resolved_total integer;
begin
  actor := public.portal_require_actor(actor_username, actor_password);

  if not (actor.judge or actor.admin or actor.super_admin) then
    raise exception 'You do not have permission to submit scores';
  end if;

  if trim(coalesce(entrant_id, '')) = '' or trim(coalesce(category, '')) = '' then
    raise exception 'Entrant ID and category are required';
  end if;

  if craftsmanship not between 0 and 25
    or presentation not between 0 and 25
    or difficulty not between 0 and 25
    or theme_fit not between 0 and 25 then
    raise exception 'Each score must be between 0 and 25';
  end if;

  resolved_total := craftsmanship + presentation + difficulty + theme_fit;

  return query
  insert into public.judge_scores (
    judge_username,
    judge_company,
    entrant_id,
    category,
    craftsmanship,
    presentation,
    difficulty,
    theme_fit,
    total_score,
    comments
  )
  values (
    actor.username,
    actor.company,
    trim(entrant_id),
    trim(category),
    craftsmanship,
    presentation,
    difficulty,
    theme_fit,
    resolved_total,
    coalesce(comments, '')
  )
  returning judge_scores.id, judge_scores.submitted_at, judge_scores.total_score;
end;
$$;

create or replace function public.portal_list_judge_results(actor_username text, actor_password text)
returns table (
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

  if not (actor.judge or actor.admin or actor.super_admin) then
    raise exception 'You do not have permission to view judge results';
  end if;

  return query
  select
    j.submitted_at,
    j.judge_username,
    j.judge_company,
    j.entrant_id,
    j.category,
    j.total_score,
    j.comments
  from public.judge_scores as j
  where j.judge_username = actor.username
  order by j.submitted_at desc
  limit 25;
end;
$$;

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

grant usage on schema public to anon, authenticated;
grant execute on function public.portal_ping() to anon, authenticated;
grant execute on function public.portal_login(text, text) to anon, authenticated;
grant execute on function public.portal_list_users(text, text) to anon, authenticated;
grant execute on function public.portal_upsert_user(text, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;
grant execute on function public.portal_delete_user(text, text, text) to anon, authenticated;
grant execute on function public.portal_submit_judge_score(text, text, text, text, integer, integer, integer, integer, text) to anon, authenticated;
grant execute on function public.portal_list_judge_results(text, text) to anon, authenticated;
grant execute on function public.portal_list_category_leaders(text, text) to anon, authenticated;

insert into public.portal_users (
  username,
  password_hash,
  company,
  volunteer,
  owner,
  judge,
  admin,
  super_admin
)
values
  ('ghmx.superadmin', extensions.crypt('V1sualB@sic#1', extensions.gen_salt('bf')), 'GHMX Convention', true, true, true, true, true),
  ('vendor.admin', extensions.crypt('VendorAdmin!2026', extensions.gen_salt('bf')), 'Example Vendor Co', false, true, false, true, false),
  ('judge.demo', extensions.crypt('JudgeDemo!2026', extensions.gen_salt('bf')), 'Example Vendor Co', false, false, true, false, false),
  ('volunteer.demo', extensions.crypt('Volunteer!2026', extensions.gen_salt('bf')), 'GHMX Convention', true, false, false, false, false)
on conflict (username) do update
set
  password_hash = excluded.password_hash,
  company = excluded.company,
  volunteer = excluded.volunteer,
  owner = excluded.owner,
  judge = excluded.judge,
  admin = excluded.admin,
  super_admin = excluded.super_admin;
