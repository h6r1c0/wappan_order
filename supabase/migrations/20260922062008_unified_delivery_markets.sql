-- Schema 2 keeps one delivery round and adds market inventory, sets and explicit sale destinations.
alter function public.wappan_validate(jsonb) rename to wappan_validate_v1;

create function public.wappan_validate(d jsonb) returns void
language plpgsql set search_path = '' as $$
declare legacy jsonb; r jsonb; st jsonb; sa jsonb; m jsonb; b jsonb; c jsonb;
 qty numeric; used numeric; moved numeric;
begin
 if d->>'schema'='1' then perform public.wappan_validate_v1(d); return; end if;
 if d->>'schema' is distinct from '2' then raise exception 'Invalid schema'; end if;
 foreach legacy in array array[d->'markets',d->'bundles',d->'bundleSales',d->'externalDestinations'] loop
  if jsonb_typeof(legacy) is distinct from 'array' then raise exception 'Invalid schema 2 collection'; end if;
 end loop;
 if jsonb_typeof(d->'aliases') is distinct from 'object' then raise exception 'Invalid aliases'; end if;

 -- Reuse all schema-1 validation after normalising market-only price snapshots.
 select jsonb_set(d,'{schema}','1'::jsonb) into legacy;
 select jsonb_set(legacy,'{sales}',coalesce(jsonb_agg(
   case when exists(select 1 from jsonb_array_elements(d->'stocks') x where x->>'id'=s->>'stockId' and x->>'channel'='external')
        then jsonb_set(s,'{price}',coalesce((select x->'price' from jsonb_array_elements(d->'stocks') x where x->>'id'=s->>'stockId'),'null'::jsonb)) else s end
 ),'[]'::jsonb)) into legacy from jsonb_array_elements(d->'sales') s;
 perform public.wappan_validate_v1(legacy);

 if exists(select 1 from jsonb_array_elements(d->'rounds') x group by x->>'date',x->>'test' having count(*)>1) then raise exception 'Duplicate delivery date'; end if;
 foreach legacy in array array[d->'markets',d->'bundles',d->'bundleSales'] loop
  if exists(select 1 from jsonb_array_elements(legacy) x where coalesce(x->>'id','')='' group by x->>'id' having count(*)>0)
    or exists(select 1 from jsonb_array_elements(legacy) x group by x->>'id' having count(*)>1) then raise exception 'Duplicate commerce id'; end if;
 end loop;

 for m in select value from jsonb_array_elements(d->'markets') loop
  select value into r from jsonb_array_elements(d->'rounds') where value->>'id'=m->>'roundId';
  if r is null or coalesce(m->>'name','')='' or m->>'date'<r->>'date' or m->>'expenseMode' not in ('reference','apply') then raise exception 'Invalid market'; end if;
  if m->'expense'<>'null'::jsonb and (jsonb_typeof(m->'expense')<>'number' or (m->>'expense')::numeric<0 or trunc((m->>'expense')::numeric)<>(m->>'expense')::numeric) then raise exception 'Invalid market expense'; end if;
 end loop;

 for st in select value from jsonb_array_elements(d->'stocks') loop
  select value into r from jsonb_array_elements(d->'rounds') where value->>'id'=st->>'roundId';
  if r is null or r->'test' is distinct from st->'test' then raise exception 'Invalid stock delivery'; end if;
  if st->>'channel'='external' and not exists(select 1 from jsonb_array_elements(d->'markets') x where x->>'id'=st->>'marketId' and x->>'roundId'=st->>'roundId') then raise exception 'Invalid stock market'; end if;
  if st->>'sourceStockId' is not null then
   select value into sa from jsonb_array_elements(d->'stocks') where value->>'id'=st->>'sourceStockId';
   if sa is null or sa->'cost' is distinct from st->'cost' or sa->>'roundId' is distinct from st->>'roundId' or (st->>'depth')::numeric<>(coalesce((sa->>'depth')::numeric,0)+1) then raise exception 'Invalid stock transfer'; end if;
  end if;
  select coalesce(sum((x->>'qty')::numeric),0) into used from jsonb_array_elements(d->'sales') x where x->>'stockId'=st->>'id' and not coalesce((x->>'void')::boolean,false);
  select coalesce(sum((x->>'qty')::numeric),0) into moved from jsonb_array_elements(d->'stocks') x where x->>'sourceStockId'=st->>'id';
  select used+coalesce(sum((bs->>'qty')::numeric*(comp->>'qty')::numeric),0) into used from jsonb_array_elements(d->'bundleSales') bs cross join lateral jsonb_array_elements(bs->'components') comp where not coalesce((bs->>'void')::boolean,false) and comp->>'stockId'=st->>'id';
  if used+moved>(st->>'qty')::numeric then raise exception 'Stock oversold by sale, set or transfer'; end if;
 end loop;

 for sa in select value from jsonb_array_elements(d->'sales') loop
  select value into st from jsonb_array_elements(d->'stocks') where value->>'id'=sa->>'stockId';
  if sa->>'destinationType' not in ('buyer','external','unknown') or sa->>'paymentStatus' not in ('paid','later','unconfirmed') then raise exception 'Invalid sale destination'; end if;
  if st->>'channel'<>'external' and sa->'price' is distinct from st->'price' then raise exception 'Invalid onsite sale price'; end if;
  if sa->>'destinationType'='buyer' and (sa->>'paymentStatus'<>'later' or not exists(select 1 from jsonb_array_elements(d->'buyers') x where x->>'id'=sa->>'buyerId')) then raise exception 'Invalid buyer sale'; end if;
  if sa->>'destinationType'='external' and coalesce(sa->>'destinationName','')='' then raise exception 'Missing external destination'; end if;
  if sa->>'destinationType'='unknown' and (sa->>'paymentStatus'<>'unconfirmed' or sa->>'buyerId' is not null or sa->>'chargeRoundId' is not null) then raise exception 'Invalid unknown sale'; end if;
 end loop;

 for b in select value from jsonb_array_elements(d->'bundles') loop
  if coalesce(b->>'name','')='' or not exists(select 1 from jsonb_array_elements(d->'markets') x where x->>'id'=b->>'marketId') or jsonb_array_length(b->'components')<1 then raise exception 'Invalid bundle'; end if;
  for c in select value from jsonb_array_elements(b->'components') loop
   if (c->>'qty')::numeric<1 or not exists(select 1 from jsonb_array_elements(d->'stocks') x where x->>'id'=c->>'stockId' and x->>'marketId'=b->>'marketId') then raise exception 'Invalid bundle component'; end if;
  end loop;
 end loop;
 for sa in select value from jsonb_array_elements(d->'bundleSales') loop
  select value into b from jsonb_array_elements(d->'bundles') where value->>'id'=sa->>'bundleId';
  if b is null or b->>'marketId' is distinct from sa->>'marketId' or (sa->>'qty')::numeric<1 or jsonb_array_length(sa->'components')<1 then raise exception 'Invalid bundle sale'; end if;
  if sa->>'destinationType' not in ('buyer','external','unknown') or sa->>'paymentStatus' not in ('paid','later','unconfirmed') then raise exception 'Invalid bundle destination'; end if;
  if sa->>'destinationType'='external' and (coalesce(sa->>'destinationName','')='' or sa->>'paymentStatus' not in ('paid','unconfirmed')) then raise exception 'Invalid bundle external destination'; end if;
  if sa->>'destinationType'='buyer' and (sa->>'paymentStatus'<>'later' or not exists(select 1 from jsonb_array_elements(d->'buyers') x where x->>'id'=sa->>'buyerId')) then raise exception 'Invalid bundle buyer'; end if;
  if sa->>'destinationType'='unknown' and sa->>'paymentStatus'<>'unconfirmed' then raise exception 'Invalid unknown bundle sale'; end if;
  for c in select value from jsonb_array_elements(sa->'components') loop
   select value into st from jsonb_array_elements(d->'stocks') where value->>'id'=c->>'stockId';
   if st is null or st->>'marketId'<>sa->>'marketId' or st->'cost' is distinct from c->'cost' then raise exception 'Invalid bundle cost snapshot'; end if;
  end loop;
 end loop;
end;
$$;

revoke all on function public.wappan_validate_v1(jsonb) from public, anon, authenticated;
revoke all on function public.wappan_validate(jsonb) from public, anon, authenticated;
