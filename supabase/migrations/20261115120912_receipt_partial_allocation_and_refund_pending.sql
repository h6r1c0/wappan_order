-- Partial allocation annotates an existing receipt; it never creates cash.
-- Keep the complete legacy validator for every other field and old annotation.
alter function public.wappan_validate(jsonb) rename to wappan_validate_before_partial_receipt;
create function public.wappan_validate(d jsonb) returns void language plpgsql set search_path='' as $$
declare a jsonb; p jsonb; receipt jsonb; refund jsonb; original jsonb; total numeric; held numeric; refunded numeric; checked jsonb;
begin
 checked:=d;
 if d ? 'collectionAllocations' then
  if jsonb_typeof(d->'collectionAllocations') is distinct from 'array' then raise exception 'Invalid receipt allocations'; end if;
  if exists(select 1 from jsonb_array_elements(d->'collectionAllocations') x group by x->>'id' having count(*)>1)
   or exists(select 1 from jsonb_array_elements(d->'collectionAllocations') x group by x->>'entryId' having count(*)>1) then raise exception 'Duplicate receipt allocation'; end if;
  for a in select value from jsonb_array_elements(d->'collectionAllocations') where value ? 'held' loop
   select value into receipt from jsonb_array_elements(coalesce(d->'collectionEntries','[]')) x where x->>'id'=a->>'entryId' and x->>'roundId'=a->>'roundId' and x->>'buyerId'=a->>'buyerId';
   if nullif(a->>'id','') is null or receipt is null or (receipt->>'received')::numeric<=0
    or jsonb_typeof(a->'parts') is distinct from 'array'
    or jsonb_typeof(a->'held') is distinct from 'number' then raise exception 'Invalid partial receipt allocation'; end if;
   held:=(a->>'held')::numeric;
   if held<0 or held>100000000 or trunc(held)<>held or a->>'heldPurpose' not in ('credit','refund-pending') or nullif(a->>'heldPurpose','') is null
    or nullif(btrim(a->>'reason'),'') is null then raise exception 'Invalid retained receipt amount'; end if;
   total:=held;
   for p in select value from jsonb_array_elements(a->'parts') loop
    if jsonb_typeof(p->'amount') is distinct from 'number' or (p->>'amount')::numeric<=0 or (p->>'amount')::numeric>100000000 or trunc((p->>'amount')::numeric)<>(p->>'amount')::numeric
     or not (exists(select 1 from jsonb_array_elements(d->'rounds') r, jsonb_array_elements(d->'rounds') source where source->>'id'=receipt->>'roundId' and p->>'itemId'='round:'||(r->>'id')||':'||(receipt->>'buyerId') and (r->'test'=source->'test' or r->'collectionLive'='true'::jsonb))
      or exists(select 1 from jsonb_array_elements(coalesce(d->'receivableItems','[]')) x where x->>'id'=p->>'itemId' and x->>'buyerId'=receipt->>'buyerId')) then raise exception 'Invalid partial allocation part'; end if;
    total:=total+(p->>'amount')::numeric;
   end loop;
   if total<>(receipt->>'received')::numeric or exists(select 1 from jsonb_array_elements(a->'parts') x group by x->>'itemId' having count(*)>1) then raise exception 'Allocation does not match receipt'; end if;
   if a ? 'history' and jsonb_typeof(a->'history') is distinct from 'array' then raise exception 'Invalid allocation history'; end if;
  end loop;
  -- New annotations are fully checked above. Legacy annotations continue through
  -- their original validator, which predates retained money.
  checked:=jsonb_set(checked,'{collectionAllocations}',coalesce((select jsonb_agg(value) from jsonb_array_elements(d->'collectionAllocations') where not value ? 'held'),'[]'));
 end if;
 perform public.wappan_validate_before_partial_receipt(checked);
 for refund in select value from jsonb_array_elements(coalesce(d->'collectionEntries','[]')) where value ? 'sourceReceiptId' loop
  select value into original from jsonb_array_elements(d->'collectionEntries') x where x->>'id'=refund->>'sourceReceiptId' and x->>'roundId'=refund->>'roundId' and x->>'buyerId'=refund->>'buyerId' and (x->>'received')::numeric>0;
  if original is null or (refund->>'received')::numeric>=0 or refund->>'reason' is distinct from '返金がある' then raise exception 'Invalid refund source'; end if;
 end loop;
 for receipt in select value from jsonb_array_elements(coalesce(d->'collectionEntries','[]')) where (value->>'received')::numeric>0 loop
  if exists(select 1 from jsonb_array_elements(coalesce(d->'collectionCorrections','[]')) c where c->>'kind'='collectionEntries' and c->>'targetId'=receipt->>'id') then continue; end if;
  select coalesce(sum(-(e->>'received')::numeric),0) into refunded from jsonb_array_elements(d->'collectionEntries') e where e->>'sourceReceiptId'=receipt->>'id' and not exists(select 1 from jsonb_array_elements(coalesce(d->'collectionCorrections','[]')) c where c->>'kind'='collectionEntries' and c->>'targetId'=e->>'id');
  select value into a from jsonb_array_elements(coalesce(d->'collectionAllocations','[]')) x where x->>'entryId'=receipt->>'id';
  held:=case when a is null then (receipt->>'received')::numeric else coalesce((a->>'held')::numeric,0) end;
  if refunded>held then raise exception 'Refund exceeds retained receipt'; end if;
 end loop;
end;$$;
revoke all on function public.wappan_validate(jsonb) from public,anon,authenticated;
revoke all on function public.wappan_validate_before_partial_receipt(jsonb) from public,anon,authenticated;
