-- Read-only handoff from the existing successful, revision-checked save history.
-- No parallel activity ledger and no activity for failed saves.
create function wappan_private.round_fragment(d jsonb, target_round text) returns jsonb
language plpgsql stable set search_path='' as $$
declare k text; fragment jsonb; rows jsonb;
begin
 select value into fragment from jsonb_array_elements(coalesce(d->'rounds','[]'::jsonb)) value where value->>'id'=target_round;
 if fragment is null then return null; end if;
 fragment:=jsonb_build_object('round',fragment);
 foreach k in array array['events','stocks','markets','collectionEntries','collectionAllocations','collectionCorrections','collectionReconciliations','collectionCredits','collectionCases','billingReviews','receivableItems','bundleSales'] loop
  select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) into rows
  from jsonb_array_elements(coalesce(d->k,'[]'::jsonb)) value where value->>'roundId'=target_round;
  fragment:=fragment||jsonb_build_object(k,rows);
 end loop;
 select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) into rows
 from jsonb_array_elements(coalesce(d->'sales','[]'::jsonb)) value
 where exists(select 1 from jsonb_array_elements(coalesce(d->'stocks','[]'::jsonb)) st where st->>'id'=value->>'stockId' and st->>'roundId'=target_round);
 return fragment||jsonb_build_object('sales',rows);
end;$$;
revoke all on function wappan_private.round_fragment(jsonb,text) from public,anon,authenticated;
create function public.wappan_round_activity(target_round text, max_items integer default 5)
returns table(revision bigint, updated_at timestamptz, description text, actor_account text)
language plpgsql stable security definer set search_path='' as $$
declare rec record; found_count integer:=0;
begin
 if auth.uid() is null or not wappan_private.wappan_is_staff() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if target_round is null or max_items is null or max_items<1 or max_items>20 then raise exception 'Invalid activity request'; end if;
 for rec in select c.revision rev,c.updated_at changed_at,c.description action,c.updated_by actor,c.data current_data,p.data previous_data,u.email
   from public.wappan_revisions c left join public.wappan_revisions p on p.revision=c.revision-1
   left join auth.users u on u.id=c.updated_by order by c.revision desc loop
  if wappan_private.round_fragment(rec.current_data,target_round) is distinct from wappan_private.round_fragment(rec.previous_data,target_round) then
   revision:=rec.rev;updated_at:=rec.changed_at;description:=rec.action;
   actor_account:=coalesce(rec.email,'アカウント '||left(rec.actor::text,8));
   return next;found_count:=found_count+1;if found_count>=max_items then exit; end if;
  end if;
 end loop;
end;$$;
revoke all on function public.wappan_round_activity(text,integer) from public,anon;
grant execute on function public.wappan_round_activity(text,integer) to authenticated;
