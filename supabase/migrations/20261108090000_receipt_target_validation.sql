-- The legacy validator declared y and also used y as the JSON array alias.
-- PostgreSQL 42702 prevented every itemized receipt from being saved.
-- Keep all existing checks; only disambiguate the alias.
create or replace function public.wappan_validate_before_snack_billing(d jsonb) returns void
language plpgsql set search_path = '' as $$
declare x jsonb;
begin
 perform public.wappan_validate_before_receivables(d);
 if d ? 'receivableItems' then
  if jsonb_typeof(d->'receivableItems') is distinct from 'array' or
    exists(select 1 from jsonb_array_elements(d->'receivableItems') i group by i->>'id' having count(*)>1)
    then raise exception 'Invalid receivable items'; end if;
  for x in select value from jsonb_array_elements(d->'receivableItems') loop
   if coalesce(x->>'id','')='' or x->>'kind' not in ('opening','additional')
     or coalesce(x->>'reason','')='' or coalesce(x->>'note','')=''
     or coalesce(x->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
     or jsonb_typeof(x->'amount') is distinct from 'number'
     or (x->>'amount')::numeric<=0 or (x->>'amount')::numeric>100000000
     or trunc((x->>'amount')::numeric)<>(x->>'amount')::numeric
     or not exists(select 1 from jsonb_array_elements(d->'buyers') b where b->>'id'=x->>'buyerId')
     then raise exception 'Invalid receivable item'; end if;
   if x->>'kind'='additional' and not exists(select 1 from jsonb_array_elements(d->'rounds') r where r->>'id'=x->>'roundId' and r->>'date'=x->>'date')
     then raise exception 'Invalid additional claim round'; end if;
  end loop;
 end if;
 if d ? 'collectionReconciliations' then
  if jsonb_typeof(d->'collectionReconciliations') is distinct from 'array' or
    exists(select 1 from jsonb_array_elements(d->'collectionReconciliations') i group by i->>'id' having count(*)>1)
    then raise exception 'Invalid collection reconciliations'; end if;
  for x in select value from jsonb_array_elements(d->'collectionReconciliations') loop
   if coalesce(x->>'id','')='' or coalesce(x->>'note','')=''
     or jsonb_typeof(x->'amount') is distinct from 'number' or (x->>'amount')::numeric<=0
     or trunc((x->>'amount')::numeric)<>(x->>'amount')::numeric
     or not exists(select 1 from jsonb_array_elements(d->'buyers') b where b->>'id'=x->>'buyerId')
     or not exists(select 1 from jsonb_array_elements(d->'rounds') r where r->>'id'=x->>'roundId')
     then raise exception 'Invalid collection reconciliation'; end if;
  end loop;
 end if;
 for x in select value from jsonb_array_elements(coalesce(d->'collectionEntries','[]'::jsonb)) where value->>'itemId' is not null loop
  if not exists(select 1 from jsonb_array_elements(coalesce(d->'receivableItems','[]'::jsonb)) as claim
    where claim.value->>'id'=x->>'itemId' and claim.value->>'buyerId'=x->>'buyerId')
    and not exists(select 1 from jsonb_array_elements(d->'rounds') r
    where 'round:'||(r->>'id')||':'||(x->>'buyerId')=x->>'itemId')
    then raise exception 'Invalid collection target'; end if;
 end loop;
end;
$$;
