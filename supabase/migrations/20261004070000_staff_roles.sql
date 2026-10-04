-- Membership is private. Every privileged operation checks the live staff row.
alter table wappan_private.wappan_staff
  add column role text not null default 'staff' check (role in ('staff','admin')),
  add column active boolean not null default true;

-- This project had one registered staff account before roles were introduced.
update wappan_private.wappan_staff set role='admin'
 where (select count(*) from wappan_private.wappan_staff)=1;

create table wappan_private.staff_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id),
 target_id uuid not null references auth.users(id),
 action text not null check (action in ('invite','reactivate','disable','transfer')),
 happened_at timestamptz not null default now()
);
revoke all on wappan_private.staff_audit from public, anon, authenticated;
alter table wappan_private.staff_audit enable row level security;

create or replace function wappan_private.wappan_is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(
  select 1 from wappan_private.wappan_staff
  where user_id=auth.uid() and active
 );
$$;

create function wappan_private.wappan_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(
  select 1 from wappan_private.wappan_staff
  where user_id=auth.uid() and active and role='admin'
 );
$$;
revoke all on function wappan_private.wappan_is_admin() from public, anon, authenticated;
grant execute on function wappan_private.wappan_is_admin() to authenticated;

create function public.wappan_admin_is_admin() returns boolean
language sql security invoker set search_path = '' as $$
 select wappan_private.wappan_is_admin();
$$;
revoke all on function public.wappan_admin_is_admin() from public, anon, authenticated;
grant execute on function public.wappan_admin_is_admin() to authenticated;

create function wappan_private.wappan_admin_list() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 if not wappan_private.wappan_is_admin() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',s.user_id,'email',u.email,'role',s.role,'active',s.active
 ) order by u.email),'[]'::jsonb) into result
 from wappan_private.wappan_staff s join auth.users u on u.id=s.user_id;
 return result;
end;
$$;
revoke all on function wappan_private.wappan_admin_list() from public, anon, authenticated;
grant execute on function wappan_private.wappan_admin_list() to authenticated;
create function public.wappan_admin_list() returns jsonb
language sql security invoker set search_path = '' as $$
 select wappan_private.wappan_admin_list();
$$;
revoke all on function public.wappan_admin_list() from public, anon, authenticated;
grant execute on function public.wappan_admin_list() to authenticated;

create function wappan_private.wappan_admin_register_email(email_arg text) returns text
language plpgsql security definer set search_path = '' as $$
declare person uuid; old_active boolean; normalized text;
begin
 if not wappan_private.wappan_is_admin() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 normalized := lower(trim(email_arg));
 if normalized='' or length(normalized)>254 then raise exception 'Invalid email'; end if;
 select id into person from auth.users where lower(email)=normalized;
 if person is null then raise exception 'AUTH_USER_NOT_FOUND'; end if;
 lock table wappan_private.wappan_staff in share row exclusive mode;
 select active into old_active from wappan_private.wappan_staff where user_id=person;
 if old_active is true then return 'already_active'; end if;
 insert into wappan_private.wappan_staff(user_id,role,active) values(person,'staff',true)
 on conflict (user_id) do update set active=true;
 insert into wappan_private.staff_audit(actor_id,target_id,action)
 values(auth.uid(),person,case when old_active is null then 'invite' else 'reactivate' end);
 return 'added';
end;
$$;
revoke all on function wappan_private.wappan_admin_register_email(text) from public, anon, authenticated;
grant execute on function wappan_private.wappan_admin_register_email(text) to authenticated;
create function public.wappan_admin_register_email(email_arg text) returns text
language sql security invoker set search_path = '' as $$
 select wappan_private.wappan_admin_register_email(email_arg);
$$;
revoke all on function public.wappan_admin_register_email(text) from public, anon, authenticated;
grant execute on function public.wappan_admin_register_email(text) to authenticated;

create function wappan_private.wappan_admin_change(action_arg text,target_arg uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare target_role text; target_active boolean;
begin
 lock table wappan_private.wappan_staff in share row exclusive mode;
 if not wappan_private.wappan_is_admin() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select role,active into target_role,target_active from wappan_private.wappan_staff where user_id=target_arg;
 if target_role is null then raise exception 'Unknown staff'; end if;
 if action_arg='transfer' then
  if not target_active or target_arg=auth.uid() then raise exception 'Another active staff member is required'; end if;
  update wappan_private.wappan_staff set role='admin' where user_id=target_arg;
  update wappan_private.wappan_staff set role='staff' where user_id=auth.uid();
 elsif action_arg='disable' then
  if not target_active then return 'already_disabled'; end if;
  if target_role='admin' and (select count(*) from wappan_private.wappan_staff where role='admin' and active)<=1 then
   raise exception 'LAST_ADMIN';
  end if;
  update wappan_private.wappan_staff set active=false where user_id=target_arg;
 else raise exception 'Invalid action'; end if;
 insert into wappan_private.staff_audit(actor_id,target_id,action) values(auth.uid(),target_arg,action_arg);
 return 'ok';
end;
$$;
revoke all on function wappan_private.wappan_admin_change(text,uuid) from public, anon, authenticated;
grant execute on function wappan_private.wappan_admin_change(text,uuid) to authenticated;
create function public.wappan_admin_change(action_arg text,target_arg uuid) returns text
language sql security invoker set search_path = '' as $$
 select wappan_private.wappan_admin_change(action_arg,target_arg);
$$;
revoke all on function public.wappan_admin_change(text,uuid) from public, anon, authenticated;
grant execute on function public.wappan_admin_change(text,uuid) to authenticated;
