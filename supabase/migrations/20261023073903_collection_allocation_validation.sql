-- An allocation is an append-only annotation of a cash receipt, never a change to it.
alter function public.wappan_validate(jsonb) rename to wappan_validate_before_allocation;
create function public.wappan_validate(d jsonb) returns void language plpgsql set search_path='' as $$
declare a jsonb; p jsonb; receipt jsonb; amount numeric;
begin
 perform public.wappan_validate_before_allocation(d);
 if not d ? 'collectionAllocations' then return; end if;
 if jsonb_typeof(d->'collectionAllocations') is distinct from 'array' then raise exception 'Invalid receipt allocations'; end if;
 if exists(select 1 from jsonb_array_elements(d->'collectionAllocations') x group by x->>'id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(d->'collectionAllocations') x group by x->>'entryId' having count(*)>1) then raise exception 'Duplicate receipt allocation'; end if;
 for a in select value from jsonb_array_elements(d->'collectionAllocations') loop
  select value into receipt from jsonb_array_elements(coalesce(d->'collectionEntries','[]'::jsonb)) x where x->>'id'=a->>'entryId' and x->>'roundId'=a->>'roundId' and x->>'buyerId'=a->>'buyerId';
  if nullif(a->>'id','') is null or receipt is null or (receipt->>'received')::numeric<=0
    or exists(select 1 from jsonb_array_elements(coalesce(d->'collectionCorrections','[]'::jsonb)) x where x->>'kind'='collectionEntries' and x->>'targetId'=a->>'entryId')
    or jsonb_typeof(a->'parts') is distinct from 'array' or jsonb_array_length(a->'parts')=0 then raise exception 'Invalid receipt allocation reference'; end if;
  amount:=0;
  for p in select value from jsonb_array_elements(a->'parts') loop
   if jsonb_typeof(p->'amount') is distinct from 'number' or (p->>'amount')::numeric<=0 or (p->>'amount')::numeric>100000000 or trunc((p->>'amount')::numeric)<>(p->>'amount')::numeric
     or not (exists(select 1 from jsonb_array_elements(d->'rounds') r where p->>'itemId'='round:'||(r->>'id')||':'||(a->>'buyerId') and exists(select 1 from jsonb_array_elements(d->'rounds') current_round where current_round->>'id'=a->>'roundId' and r->>'date'<=current_round->>'date'))
       or exists(select 1 from jsonb_array_elements(coalesce(d->'receivableItems','[]'::jsonb)) x where x->>'id'=p->>'itemId' and x->>'buyerId'=a->>'buyerId')) then raise exception 'Invalid allocation part'; end if;
   amount:=amount+(p->>'amount')::numeric;
  end loop;
  if amount<>(receipt->>'received')::numeric or exists(select 1 from jsonb_array_elements(a->'parts') x group by x->>'itemId' having count(*)>1) then raise exception 'Allocation does not match receipt'; end if;
 end loop;
end;$$;
revoke all on function public.wappan_validate_before_allocation(jsonb) from public,anon,authenticated;
revoke all on function public.wappan_validate(jsonb) from public,anon,authenticated;
