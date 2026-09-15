-- Keep privileged implementation and staff registration outside the Data API.
create schema wappan_private;
revoke all on schema wappan_private from public, anon, authenticated;
grant usage on schema wappan_private to authenticated;
alter table public.wappan_staff set schema wappan_private;
alter function public.wappan_is_staff() set schema wappan_private;
create or replace function wappan_private.wappan_is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from wappan_private.wappan_staff where user_id = auth.uid());
$$;
revoke all on function wappan_private.wappan_is_staff() from public, anon, authenticated;
grant execute on function wappan_private.wappan_is_staff() to authenticated;
alter function public.wappan_save(bigint,jsonb,text) set schema wappan_private;
create or replace function wappan_private.wappan_save(expected_revision bigint, payload jsonb, description text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare rev bigint;
begin
 if not wappan_private.wappan_is_staff() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select revision into rev from public.wappan_workspace where id=true for update;
 if expected_revision is null or rev<>expected_revision then raise exception 'CONFLICT: 別の係が更新しました。最新データを読み込んでください' using errcode='40001'; end if;
 perform public.wappan_validate(payload);
 rev:=rev+1;
 update public.wappan_workspace set data=payload,revision=rev,updated_at=now(),updated_by=auth.uid() where id=true;
 insert into public.wappan_revisions(revision,data,updated_by,description) values(rev,payload,auth.uid(),left(description,200));
 return rev;
end;
$$;
revoke all on function wappan_private.wappan_save(bigint,jsonb,text) from public, anon, authenticated;
grant execute on function wappan_private.wappan_save(bigint,jsonb,text) to authenticated;

create function public.wappan_save(expected_revision bigint, payload jsonb, description text)
returns bigint language sql security invoker set search_path = '' as $$
 select wappan_private.wappan_save(expected_revision, payload, description);
$$;
revoke all on function public.wappan_save(bigint,jsonb,text) from public, anon, authenticated;
grant execute on function public.wappan_save(bigint,jsonb,text) to authenticated;
