-- Accept a historical credit with unknown original receipt date, applied only to a named invoice.
-- This replaces the collection-workflow validation layer; other layers remain intact.
create or replace function public.wappan_validate_before_allocation(d jsonb) returns void language plpgsql set search_path='' as $$
declare k text; x jsonb; line jsonb; target jsonb;
begin
 perform public.wappan_validate_before_collection_workflow(d);
 foreach k in array array['collectionCredits','collectionCases','collectionCorrections','billingReviews'] loop
  if not d ? k then continue; end if;
  if jsonb_typeof(d->k) is distinct from 'array' then raise exception 'Invalid collection workflow array'; end if;
  if exists(select 1 from jsonb_array_elements(d->k) a group by a->>'id' having count(*)>1) then raise exception 'Duplicate collection workflow ID'; end if;
  for x in select value from jsonb_array_elements(d->k) loop
   if nullif(btrim(x->>'id'),'') is null or not exists(select 1 from jsonb_array_elements(d->'buyers') b where b->>'id'=x->>'buyerId') or not exists(select 1 from jsonb_array_elements(d->'rounds') r where r->>'id'=x->>'roundId') then raise exception 'Invalid collection workflow reference'; end if;
   if k='collectionCredits' then
    if jsonb_typeof(x->'amount') is distinct from 'number' or (x->>'amount')::numeric<=0 or (x->>'amount')::numeric>100000000 or trunc((x->>'amount')::numeric)<>(x->>'amount')::numeric or (coalesce(x->>'date','')!~ '^\d{4}-\d{2}-\d{2}$' and not (x->'date'='null'::jsonb and x->>'appliedTo'='round:'||(x->>'roundId')||':'||(x->>'buyerId') and coalesce(x->>'recordedAt','') ~ '^\d{4}-\d{2}-\d{2}T' and exists(select 1 from jsonb_array_elements(d->'rounds') r where r->>'id'=x->>'roundId' and r->'orders' ? (x->>'buyerId')))) or nullif(btrim(x->>'reason'),'') is null then raise exception 'Invalid collection credit'; end if;
    if x->>'date' is not null then perform (x->>'date')::date; end if;
    if exists(select 1 from jsonb_array_elements(d->'rounds') r where r->>'id'=x->>'roundId' and x->>'date'>=r->>'date') then raise exception 'Invalid credit date'; end if;
   elsif k='collectionCases' then
    if jsonb_typeof(x->'received') is distinct from 'number' or abs((x->>'received')::numeric)>100000000 or trunc((x->>'received')::numeric)<>(x->>'received')::numeric or coalesce(x->>'status','') not in ('pending','resolved') then raise exception 'Invalid collection case'; end if;
   elsif k='collectionCorrections' then
    if coalesce(x->>'kind','') not in ('collectionEntries','collectionReconciliations') or nullif(btrim(x->>'reason'),'') is null or not exists(select 1 from jsonb_array_elements(d->(x->>'kind')) t where t->>'id'=x->>'targetId' and t->>'buyerId'=x->>'buyerId' and t->>'roundId'=x->>'roundId') then raise exception 'Invalid collection correction'; end if;
   elsif k='billingReviews' then
    if jsonb_typeof(x->'bagAmount') is distinct from 'number' or jsonb_typeof(x->'total') is distinct from 'number' or (x->>'bagAmount')::numeric<0 or (x->>'total')::numeric<0 or (x->>'bagAmount')::numeric>100000000 or (x->>'total')::numeric>100000000 or trunc((x->>'total')::numeric)<>(x->>'total')::numeric or trunc((x->>'bagAmount')::numeric)<>(x->>'bagAmount')::numeric or coalesce(x->>'status','') not in ('confirmed','pending') or jsonb_typeof(x->'lines') is distinct from 'array' or jsonb_typeof(x->'history') is distinct from 'array' then raise exception 'Invalid billing review'; end if;
    if x->>'status'='pending' and nullif(btrim(x->>'exceptionReason'),'') is null then raise exception 'Pending billing reason required'; end if;
   end if;
  end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(coalesce(d->'billingReviews','[]'::jsonb)) v group by v->>'buyerId',v->>'roundId' having count(*)>1) or exists(select 1 from jsonb_array_elements(coalesce(d->'collectionCredits','[]'::jsonb)) v group by v->>'buyerId',coalesce(v->>'date',v->>'roundId'),v->>'amount' having count(*)>1) or exists(select 1 from jsonb_array_elements(coalesce(d->'collectionCases','[]'::jsonb)) v where v->>'status'='pending' group by v->>'buyerId',v->>'roundId' having count(*)>1) or exists(select 1 from jsonb_array_elements(coalesce(d->'collectionCorrections','[]'::jsonb)) v group by v->>'kind',v->>'targetId' having count(*)>1) then raise exception 'Duplicate collection workflow'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(d->'collectionEntries','[]'::jsonb)) v where v->>'requestId' is not null group by v->>'requestId' having count(*)>1) then raise exception 'Duplicate receipt request'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(d->'receivableItems','[]'::jsonb)) v where v->>'sourceKey' is not null group by v->>'buyerId',v->>'roundId',v->>'sourceKey' having count(*)>1) then raise exception 'Duplicate missing charge'; end if;
end;$$;
revoke all on function public.wappan_validate_before_collection_workflow(jsonb) from public,anon,authenticated;
revoke all on function public.wappan_validate_before_allocation(jsonb) from public,anon,authenticated;
