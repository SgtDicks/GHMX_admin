alter table public.portal_users
add column if not exists full_name text not null default '';

alter table public.portal_users
add column if not exists email text not null default '';

alter table public.portal_users
add column if not exists status text not null default 'Active';

alter table public.portal_users
add column if not exists last_login_at timestamptz;

update public.portal_users
set
  full_name = case
    when trim(coalesce(full_name, '')) = '' then username
    else full_name
  end,
  status = case lower(trim(coalesce(status, 'active')))
    when 'active' then 'Active'
    when 'inactive' then 'Inactive'
    when 'pending' then 'Pending'
    when 'suspended' then 'Suspended'
    when 'banned' then 'Banned'
    else 'Active'
  end;

drop function if exists public.portal_login(text, text);

create or replace function public.portal_login(p_username text, p_password text)
returns table (
  username text,
  full_name text,
  email text,
  company text,
  status text,
  volunteer boolean,
  owner boolean,
  judge boolean,
  admin boolean,
  super_admin boolean,
  created_at timestamptz,
  last_login_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor public.portal_users;
begin
  actor := public.portal_require_actor(p_username, p_password);

  update public.portal_users
  set last_login_at = timezone('utc', now())
  where id = actor.id
  returning * into actor;

  return query
  select
    actor.username,
    actor.full_name,
    actor.email,
    actor.company,
    actor.status,
    actor.volunteer,
    actor.owner,
    actor.judge,
    actor.admin,
    actor.super_admin,
    actor.created_at,
    actor.last_login_at;
end;
$$;

drop function if exists public.portal_list_users(text, text);

create or replace function public.portal_list_users(actor_username text, actor_password text)
returns table (
  username text,
  full_name text,
  email text,
  company text,
  status text,
  volunteer boolean,
  owner boolean,
  judge boolean,
  admin boolean,
  super_admin boolean,
  created_at timestamptz,
  last_login_at timestamptz
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
    u.full_name,
    u.email,
    u.company,
    u.status,
    u.volunteer,
    u.owner,
    u.judge,
    u.admin,
    u.super_admin,
    u.created_at,
    u.last_login_at
  from public.portal_users as u
  where actor.super_admin or (u.company = actor.company and not u.super_admin)
  order by coalesce(nullif(u.full_name, ''), u.username), u.username;
end;
$$;

drop function if exists public.portal_upsert_user(
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
);

create or replace function public.portal_upsert_user(
  actor_username text,
  actor_password text,
  original_username text default null,
  target_full_name text default null,
  target_email text default null,
  target_username text default null,
  target_password text default null,
  target_company text default null,
  target_status text default 'Active',
  target_volunteer boolean default false,
  target_owner boolean default false,
  target_judge boolean default false,
  target_admin boolean default false,
  target_super_admin boolean default false
)
returns table (
  username text,
  full_name text,
  email text,
  company text,
  status text,
  volunteer boolean,
  owner boolean,
  judge boolean,
  admin boolean,
  super_admin boolean,
  created_at timestamptz,
  last_login_at timestamptz
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
  resolved_full_name text := trim(coalesce(target_full_name, ''));
  resolved_email text := lower(trim(coalesce(target_email, '')));
  resolved_company text := trim(coalesce(target_company, ''));
  resolved_status text := case lower(trim(coalesce(target_status, 'active')))
    when 'active' then 'Active'
    when 'inactive' then 'Inactive'
    when 'pending' then 'Pending'
    when 'suspended' then 'Suspended'
    when 'banned' then 'Banned'
    else 'Active'
  end;
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

  if resolved_full_name = '' then
    resolved_full_name := normalized_target_username;
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

  if existing.id is not null then
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
      full_name = resolved_full_name,
      email = resolved_email,
      company = resolved_company,
      status = resolved_status,
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
      full_name,
      email,
      password_hash,
      company,
      status,
      volunteer,
      owner,
      judge,
      admin,
      super_admin
    )
    values (
      normalized_target_username,
      resolved_full_name,
      resolved_email,
      extensions.crypt(target_password, extensions.gen_salt('bf')),
      resolved_company,
      resolved_status,
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
    u.full_name,
    u.email,
    u.company,
    u.status,
    u.volunteer,
    u.owner,
    u.judge,
    u.admin,
    u.super_admin,
    u.created_at,
    u.last_login_at
  from public.portal_users as u
  where u.username = normalized_target_username;
end;
$$;

grant execute on function public.portal_login(text, text) to anon, authenticated;
grant execute on function public.portal_list_users(text, text) to anon, authenticated;
grant execute on function public.portal_upsert_user(text, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;
