-- Extend JSON validation without rewriting saved transactions. New draft fields
-- have no financial effect until the operator explicitly confirms billing.
alter function public.wappan_validate(jsonb) rename to wappan_validate_before_snack_sections;
create function public.wappan_validate(d jsonb) returns void
language plpgsql set search_path='' as $$
declare cleaned jsonb; e jsonb; old_e jsonb; lines jsonb; sale jsonb; alloc jsonb; group_record jsonb; line_item jsonb;
  amount numeric; used_qty numeric; moved numeric; source jsonb; qty numeric; assigned numeric;
begin
 cleaned:=d;
 for e in select value from jsonb_array_elements(d->'events') loop
   if exists(select 1 from jsonb_array_elements(e->'lines') l where l ? 'sourceStockId') then
     lines:=coalesce((select jsonb_agg(l) from jsonb_array_elements(e->'lines') l where not (l ? 'sourceStockId')),'[]'::jsonb);
     old_e:=jsonb_set(e,'{lines}',lines);
   else old_e:=e; end if;
   if e->'billing' is not null and e->'billing'<>'null'::jsonb and
      (coalesce(e->'billing'->>'label','')='' or
       exists(select 1 from jsonb_array_elements(coalesce(e->'billing'->'groups','[]'::jsonb)) grp where grp ? 'quantities'))
     then old_e:=old_e - 'billing'; end if;
   cleaned:=jsonb_set(cleaned,'{events}',(
     select jsonb_agg(case when x->>'id'=e->>'id' then old_e else x end)
     from jsonb_array_elements(cleaned->'events') x));
 end loop;
 perform public.wappan_validate_before_snack_sections(cleaned);
 for e in select value from jsonb_array_elements(d->'events') loop
   if e ? 'snackDraft' then
     if jsonb_typeof(e->'snackDraft') is distinct from 'object' or
       jsonb_typeof(e->'snackDraft'->'fiscal') is distinct from 'array' or
       jsonb_typeof(e->'snackDraft'->'household') is distinct from 'array' or
       jsonb_typeof(e->'snackDraft'->'groups') is distinct from 'array'
       then raise exception 'Invalid snack section draft'; end if;
   end if;
   if exists(select 1 from jsonb_array_elements(e->'lines') l group by l->>'id' having count(*)>1)
     then raise exception 'Duplicate snack line'; end if;
   for line_item in select value from jsonb_array_elements(e->'lines') where value ? 'sourceStockId' loop
     select value into source from jsonb_array_elements(d->'stocks') st where st->>'id'=line_item->>'sourceStockId';
     if source is null or source->>'eventId' is not null or source->>'roundId' is distinct from e->>'roundId' or
       source->'test' is distinct from e->'test' or source->'cost' is distinct from line_item->'cost' or
       e->>'date'<source->>'date' or
       jsonb_typeof(line_item->'qty') is distinct from 'number' or (line_item->>'qty')::numeric<1 or
       (line_item->>'used')::numeric>(line_item->>'qty')::numeric
       then raise exception 'Invalid stock to snack transfer'; end if;
     select coalesce(sum((l->>'qty')::numeric),0) into moved
       from jsonb_array_elements(d->'events') ev cross join lateral jsonb_array_elements(ev->'lines') l
       where l->>'sourceStockId'=source->>'id';
     select moved+coalesce(sum((st->>'qty')::numeric),0) into moved
       from jsonb_array_elements(d->'stocks') st where st->>'sourceStockId'=source->>'id';
     select moved+coalesce(sum((sa->>'qty')::numeric),0) into moved
       from jsonb_array_elements(d->'sales') sa where sa->>'stockId'=source->>'id' and coalesce(sa->>'void','false')='false';
     select moved+coalesce(sum((bs->>'qty')::numeric*(c->>'qty')::numeric),0) into moved
       from jsonb_array_elements(coalesce(d->'bundleSales','[]'::jsonb)) bs
       cross join lateral jsonb_array_elements(bs->'components') c
       where c->>'stockId'=source->>'id' and coalesce(bs->>'void','false')='false';
     if moved>coalesce((source->>'receivedQty')::numeric,(source->>'qty')::numeric)
       then raise exception 'Stock to snack exceeds unsold inventory'; end if;
   end loop;
   -- The old validator still checks legacy bills. Explicit group targets need
   -- their own integrity check because they no longer derive from used-fiscal.
   for old_e in select value from jsonb_array_elements(
      case when e->'billing' is not null and e->'billing'<>'null'::jsonb
        then jsonb_build_array(e->'billing') else '[]'::jsonb end) loop
     if coalesce(old_e->>'label','')='' or exists(select 1 from jsonb_array_elements(coalesce(old_e->'groups','[]'::jsonb)) grp where grp ? 'quantities') then
       if jsonb_typeof(old_e->'fiscal') is distinct from 'array' or
          jsonb_typeof(old_e->'household') is distinct from 'array' or
          jsonb_typeof(coalesce(old_e->'groups','[]'::jsonb)) is distinct from 'array'
          then raise exception 'Invalid confirmed snack sections'; end if;
       if exists(select 1 from jsonb_array_elements(old_e->'fiscal') x group by x->>'lineId' having count(*)>1) or
          exists(select 1 from jsonb_array_elements(old_e->'household') x group by x->>'buyerId',x->>'lineId',x->>'groupId' having count(*)>1)
          then raise exception 'Duplicate snack assignment'; end if;
       for group_record in select value from jsonb_array_elements(coalesce(old_e->'groups','[]'::jsonb)) loop
         if jsonb_typeof(group_record->'quantities') is distinct from 'object' or
            jsonb_typeof(group_record->'lineIds') is distinct from 'array' or
            jsonb_typeof(group_record->'unitPrice') is distinct from 'number'
            then raise exception 'Invalid explicit snack group'; end if;
         select coalesce(sum((x.value)::numeric),0) into qty from jsonb_each_text(group_record->'quantities') x;
         select coalesce(sum((x->>'qty')::numeric),0) into assigned
           from jsonb_array_elements(old_e->'household') x where x->>'groupId'=group_record->>'id';
         if qty<>assigned or exists(select 1 from jsonb_each(group_record->'quantities') x
           where not exists(select 1 from jsonb_array_elements_text(group_record->'lineIds') id where id=x.key))
           then raise exception 'Snack group assignment mismatch'; end if;
       end loop;
       for line_item in select value from jsonb_array_elements(e->'lines') loop
         select coalesce(sum((x->>'qty')::numeric),0) into used_qty
           from jsonb_array_elements(old_e->'fiscal') x where x->>'lineId'=line_item->>'id';
         select used_qty+coalesce(sum((x->>'qty')::numeric),0) into used_qty
           from jsonb_array_elements(old_e->'household') x where x->>'lineId'=line_item->>'id';
         select used_qty+coalesce(sum((grp->'quantities'->>(line_item->>'id'))::numeric),0) into used_qty
           from jsonb_array_elements(coalesce(old_e->'groups','[]'::jsonb)) grp
           where grp->'quantities' ? (line_item->>'id');
         select coalesce(sum((st->>'qty')::numeric),0) into moved
           from jsonb_array_elements(d->'stocks') st where st->>'eventLineId'=line_item->>'id';
         if used_qty>(coalesce((line_item->>'receivedQty')::numeric,(line_item->>'qty')::numeric)-moved) or
           used_qty<>(line_item->>'used')::numeric then raise exception 'Snack section quantity mismatch'; end if;
       end loop;
       for alloc in select value from jsonb_array_elements(old_e->'household') loop
         if not exists(select 1 from jsonb_array_elements(d->'buyers') b where b->>'id'=alloc->>'buyerId') or
           jsonb_typeof(alloc->'qty') is distinct from 'number' or (alloc->>'qty')::numeric<1 or
           jsonb_typeof(alloc->'unitPrice') is distinct from 'number' or
           (alloc->>'lineId' is not null and not exists(select 1 from jsonb_array_elements(e->'lines') l where l->>'id'=alloc->>'lineId')) or
           (alloc->>'groupId' is not null and not exists(select 1 from jsonb_array_elements(old_e->'groups') grp where
             grp->>'id'=alloc->>'groupId' and grp->'unitPrice'=alloc->'unitPrice'))
           then raise exception 'Invalid household snack section'; end if;
       end loop;
     end if;
   end loop;
 end loop;
 for sale in select value from jsonb_array_elements(coalesce(d->'otherSales','[]'::jsonb)) where value ? 'allocations' loop
   if jsonb_typeof(sale->'allocations') is distinct from 'array' or sale->>'paymentStatus'<>'unpaid' or
     exists(select 1 from jsonb_array_elements(sale->'allocations') x group by x->>'buyerId' having count(*)>1)
     then raise exception 'Invalid other sale allocation'; end if;
   amount:=0;
   for alloc in select value from jsonb_array_elements(sale->'allocations') loop
     if not exists(select 1 from jsonb_array_elements(d->'buyers') b where b->>'id'=alloc->>'buyerId') or
       not exists(select 1 from jsonb_array_elements(d->'rounds') r where r->>'id'=alloc->>'chargeRoundId'
         and r->>'date'=sale->>'date' and r->'test'=sale->'test') or
       jsonb_typeof(alloc->'qty') is distinct from 'number' or (alloc->>'qty')::numeric<1 or
       trunc((alloc->>'qty')::numeric)<>(alloc->>'qty')::numeric
       then raise exception 'Invalid other sale buyer or quantity'; end if;
     amount:=amount+(alloc->>'qty')::numeric;
   end loop;
   if amount>(sale->>'qty')::numeric then raise exception 'Other sale overallocated'; end if;
 end loop;
end;
$$;
revoke all on function public.wappan_validate_before_snack_sections(jsonb) from public,anon,authenticated;
revoke all on function public.wappan_validate(jsonb) from public,anon,authenticated;
