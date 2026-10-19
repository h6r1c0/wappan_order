-- Extend the existing JSON workspace validator without rewriting historical records.
create or replace function public.wappan_validate(d jsonb) returns void
language plpgsql set search_path = '' as $$
declare e jsonb; b jsonb; g jsonb; item jsonb; sale jsonb; line_item jsonb;
        selected_ids text[]; all_ids text[]; expected numeric; assigned numeric; fiscal_qty numeric; specific_qty numeric; home_qty numeric; moved numeric; available numeric;
begin
 perform public.wappan_validate_before_snack_billing(d);
 for e in select value from jsonb_array_elements(d->'events') where value->'billing' is not null and value->'billing'<>'null'::jsonb loop
  b:=e->'billing';
  if jsonb_typeof(b) is distinct from 'object' or b->>'label' is null or btrim(b->>'label')='' or
     jsonb_typeof(b->'fiscal') is distinct from 'array' or jsonb_typeof(b->'household') is distinct from 'array'
    then raise exception 'Invalid snack billing'; end if;
  if exists(select 1 from jsonb_array_elements(b->'fiscal') x group by x->>'lineId' having count(*)>1) or
     exists(select 1 from jsonb_array_elements(b->'household') x group by x->>'buyerId',coalesce(x->>'lineId',''),coalesce(x->>'groupId','') having count(*)>1)
    then raise exception 'Duplicate snack billing assignment'; end if;
  for item in select value from jsonb_array_elements(b->'fiscal') loop
   if not exists(select 1 from jsonb_array_elements(e->'lines') l where l->>'id'=item->>'lineId') or
      jsonb_typeof(item->'qty') is distinct from 'number' or (item->>'qty')::numeric<0 or
      (item->>'qty')::numeric>100000000 or trunc((item->>'qty')::numeric)<>(item->>'qty')::numeric
     then raise exception 'Invalid fiscal snack quantity'; end if;
   if (item->>'qty')::numeric>0 and exists(select 1 from jsonb_array_elements(e->'lines') line where line->>'id'=item->>'lineId' and line->>'cost' is null)
     then raise exception 'Fiscal snack cost is unconfirmed'; end if;
  end loop;
  for item in select value from jsonb_array_elements(b->'household') loop
   if not exists(select 1 from jsonb_array_elements(d->'buyers') person where person->>'id'=item->>'buyerId') or
      (item->>'lineId' is not null and not exists(select 1 from jsonb_array_elements(e->'lines') l where l->>'id'=item->>'lineId')) or
      jsonb_typeof(item->'qty') is distinct from 'number' or (item->>'qty')::numeric<1 or
      trunc((item->>'qty')::numeric)<>(item->>'qty')::numeric or
      jsonb_typeof(item->'unitPrice') is distinct from 'number' or (item->>'unitPrice')::numeric<0 or
      (item->>'unitPrice')::numeric>100000000 or trunc((item->>'unitPrice')::numeric)<>(item->>'unitPrice')::numeric
     then raise exception 'Invalid household snack assignment'; end if;
  end loop;
  assigned:=0;available:=0;
  for line_item in select value from jsonb_array_elements(e->'lines') loop
   select coalesce(sum((x->>'qty')::numeric),0) into fiscal_qty from jsonb_array_elements(b->'fiscal') x where x->>'lineId'=line_item->>'id';
   select coalesce(sum((x->>'qty')::numeric),0) into home_qty from jsonb_array_elements(b->'household') x where x->>'lineId'=line_item->>'id';
   select coalesce(sum((st->>'qty')::numeric),0) into moved from jsonb_array_elements(d->'stocks') st where st->>'eventLineId'=line_item->>'id';
   if fiscal_qty+home_qty>coalesce((line_item->>'receivedQty')::numeric,(line_item->>'qty')::numeric)-moved then raise exception 'Snack billing exceeds available product'; end if;
   available:=available+coalesce((line_item->>'receivedQty')::numeric,(line_item->>'qty')::numeric)-moved;
   assigned:=assigned+fiscal_qty+home_qty;
  end loop;
  select assigned+coalesce(sum((x->>'qty')::numeric),0) into assigned from jsonb_array_elements(b->'household') x where x->>'lineId' is null;
  if assigned>available then raise exception 'Snack billing exceeds available quantity'; end if;
 end loop;
 if d ? 'otherSales' and jsonb_typeof(d->'otherSales') is distinct from 'array' then raise exception 'Invalid other sales'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(d->'otherSales','[]'::jsonb)) x group by x->>'id' having count(*)>1)
   then raise exception 'Duplicate other sale ID'; end if;
 for sale in select value from jsonb_array_elements(coalesce(d->'otherSales','[]'::jsonb)) loop
  if nullif(btrim(sale->>'id'),'') is null or nullif(btrim(sale->>'name'),'') is null or
     sale->>'date' is null or sale->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(sale->'test') is distinct from 'boolean' or
     jsonb_typeof(sale->'void') is distinct from 'boolean' or sale->>'paymentStatus' is null or sale->>'paymentStatus' not in ('paid','unpaid') or jsonb_typeof(sale->'history') is distinct from 'array' or
     jsonb_typeof(sale->'qty') is distinct from 'number' or jsonb_typeof(sale->'unitPrice') is distinct from 'number' or
     jsonb_typeof(sale->'unitCost') is distinct from 'number' or
     (sale->>'qty')::numeric<1 or (sale->>'qty')::numeric>100000000 or trunc((sale->>'qty')::numeric)<>(sale->>'qty')::numeric or
     (sale->>'unitPrice')::numeric<0 or (sale->>'unitPrice')::numeric>100000000 or trunc((sale->>'unitPrice')::numeric)<>(sale->>'unitPrice')::numeric or
     (sale->>'unitCost')::numeric<0 or (sale->>'unitCost')::numeric>100000000 or trunc((sale->>'unitCost')::numeric)<>(sale->>'unitCost')::numeric
   then raise exception 'Invalid other sale'; end if;
  perform (sale->>'date')::date;
 end loop;
 for e in select value from jsonb_array_elements(d->'events') where value->'billing' ? 'groups' or exists(select 1 from jsonb_array_elements(value->'billing'->'household') h where h->>'groupId' is not null) loop
  b:=e->'billing';all_ids:=array[]::text[];
  if jsonb_typeof(b->'groups') is distinct from 'array' then raise exception 'Invalid snack groups'; end if;
  if exists(select 1 from jsonb_array_elements(b->'groups') x group by x->>'id' having count(*)>1)
   then raise exception 'Duplicate snack group'; end if;
  for g in select value from jsonb_array_elements(b->'groups') loop
   if nullif(btrim(g->>'id'),'') is null or nullif(btrim(g->>'label'),'') is null or jsonb_typeof(g->'lineIds') is distinct from 'array' or jsonb_array_length(g->'lineIds')=0
    then raise exception 'Invalid snack group'; end if;
   if jsonb_typeof(g->'unitPrice') is distinct from 'number' or (g->>'unitPrice')::numeric<0 or (g->>'unitPrice')::numeric>100000000 or trunc((g->>'unitPrice')::numeric)<>(g->>'unitPrice')::numeric then raise exception 'Invalid snack group price'; end if;
   selected_ids:=array(select jsonb_array_elements_text(g->'lineIds'));
   if (select count(distinct x) from unnest(selected_ids) x)<>array_length(selected_ids,1) or
      exists(select 1 from unnest(selected_ids) id where not exists(select 1 from jsonb_array_elements(e->'lines') l where l->>'id'=id)) or
      selected_ids && all_ids then raise exception 'Overlapping snack groups'; end if;
   all_ids:=all_ids||selected_ids;expected:=0;
   for line_item in select value from jsonb_array_elements(e->'lines') where value->>'id'=any(selected_ids) loop
    if line_item->>'usedConfirmed' is distinct from 'true' and coalesce((line_item->>'used')::numeric,0)=0 then raise exception 'Snack use unconfirmed'; end if;
    if line_item->>'cost' is null then raise exception 'Snack group cost unconfirmed'; end if;
    select coalesce(sum((x->>'qty')::numeric),0) into fiscal_qty from jsonb_array_elements(b->'fiscal') x where x->>'lineId'=line_item->>'id';
    select coalesce(sum((x->>'qty')::numeric),0) into specific_qty from jsonb_array_elements(b->'household') x where x->>'lineId'=line_item->>'id';
    if fiscal_qty+specific_qty>(line_item->>'used')::numeric then raise exception 'Snack group allocation mismatch'; end if;
    expected:=expected+(line_item->>'used')::numeric-fiscal_qty-specific_qty;
   end loop;
   select coalesce(sum((x->>'qty')::numeric),0) into assigned from jsonb_array_elements(b->'household') x where x->>'groupId'=g->>'id';
   if expected<0 or assigned<>expected then raise exception 'Snack group allocation mismatch'; end if;
  end loop;
  if jsonb_array_length(b->'groups')>0 then
   if exists(select 1 from jsonb_array_elements(b->'household') x where x->>'groupId' is null and x->>'lineId' is null) then raise exception 'Ungrouped common snack assignment'; end if;
   for line_item in select value from jsonb_array_elements(e->'lines') where not (value->>'id'=any(all_ids)) loop
    select coalesce(sum((x->>'qty')::numeric),0) into fiscal_qty from jsonb_array_elements(b->'fiscal') x where x->>'lineId'=line_item->>'id';
    select coalesce(sum((x->>'qty')::numeric),0) into specific_qty from jsonb_array_elements(b->'household') x where x->>'lineId'=line_item->>'id';
    if (line_item->>'usedConfirmed' is distinct from 'true' and coalesce((line_item->>'used')::numeric,0)=0) or fiscal_qty+specific_qty<>(line_item->>'used')::numeric then raise exception 'Snack group allocation mismatch'; end if;
   end loop;
  end if;
  if exists(select 1 from jsonb_array_elements(b->'household') x where x->>'groupId' is not null and
    (x->>'lineId' is not null or not exists(select 1 from jsonb_array_elements(b->'groups') as grp where grp->>'id'=x->>'groupId' and grp->>'unitPrice'=x->>'unitPrice')))
   then raise exception 'Invalid snack group assignment'; end if;
 end loop;
end;
$$;
revoke all on function public.wappan_validate(jsonb) from public, anon, authenticated;
