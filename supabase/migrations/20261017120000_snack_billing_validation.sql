-- Household and fiscal assignments are snapshots on the existing snack event.
-- Preserve the old validator and historical events without assignments.
alter function public.wappan_validate(jsonb) rename to wappan_validate_before_snack_billing;
create function public.wappan_validate(d jsonb) returns void
language plpgsql set search_path = '' as $$
declare e jsonb; b jsonb; item jsonb; line_item jsonb; fiscal_qty numeric; home_qty numeric; moved numeric; assigned numeric; available numeric;
begin
 perform public.wappan_validate_before_snack_billing(d);
 for e in select value from jsonb_array_elements(d->'events') where value->'billing' is not null and value->'billing'<>'null'::jsonb loop
  b:=e->'billing';
  if jsonb_typeof(b) is distinct from 'object' or b->>'label' is null or btrim(b->>'label')='' or
     jsonb_typeof(b->'fiscal') is distinct from 'array' or jsonb_typeof(b->'household') is distinct from 'array'
    then raise exception 'Invalid snack billing'; end if;
  if exists(select 1 from jsonb_array_elements(b->'fiscal') x group by x->>'lineId' having count(*)>1) or
     exists(select 1 from jsonb_array_elements(b->'household') x group by x->>'buyerId',coalesce(x->>'lineId','') having count(*)>1)
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
end;
$$;
revoke all on function public.wappan_validate_before_snack_billing(jsonb) from public, anon, authenticated;
revoke all on function public.wappan_validate(jsonb) from public, anon, authenticated;
