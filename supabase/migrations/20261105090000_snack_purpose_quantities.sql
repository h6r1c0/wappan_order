-- Preserve historical line.used and its audit trail in stored JSON. Earlier
-- validators can check the derived quantity in an in-memory copy of the payload.
alter function public.wappan_validate(jsonb) rename to wappan_validate_before_purpose_quantities;
create function public.wappan_validate(d jsonb) returns void
language plpgsql set search_path='' as $$
declare checked jsonb:=d; ev jsonb; plan jsonb; changed_lines jsonb; line_item jsonb;
  purpose numeric; moved numeric;
begin
 for ev in select value from jsonb_array_elements(d->'events') loop
   if not (ev ? 'snackDraft') and not exists(
     select 1 from jsonb_array_elements(coalesce(ev->'billing'->'groups','[]'::jsonb)) g
     where jsonb_typeof(g->'quantities')='object') then continue; end if;
   plan:=coalesce(ev->'billing',ev->'snackDraft');
   -- Legacy group records have no explicit product quantities and still use
   -- their saved line.used value. Keep that validator path untouched.
   if plan is null or jsonb_typeof(plan)<>'object' or exists(
     select 1 from jsonb_array_elements(coalesce(plan->'groups','[]'::jsonb)) g
     where jsonb_typeof(g->'quantities') is distinct from 'object') then continue; end if;
   changed_lines:='[]'::jsonb;
   for line_item in select value from jsonb_array_elements(ev->'lines') loop
     select coalesce(sum((x->>'qty')::numeric),0) into purpose
       from jsonb_array_elements(coalesce(plan->'fiscal','[]'::jsonb)) x where x->>'lineId'=line_item->>'id';
     select purpose+coalesce(sum((x->>'qty')::numeric),0) into purpose
       from jsonb_array_elements(coalesce(plan->'household','[]'::jsonb)) x where x->>'lineId'=line_item->>'id';
     select purpose+coalesce(sum((g->'quantities'->>(line_item->>'id'))::numeric),0) into purpose
       from jsonb_array_elements(coalesce(plan->'groups','[]'::jsonb)) g
       where g->'quantities' ? (line_item->>'id');
     changed_lines:=changed_lines||jsonb_set(line_item,'{used}',to_jsonb(purpose));
   end loop;
   checked:=jsonb_set(checked,'{events}',(
     select jsonb_agg(case when x->>'id'=ev->>'id' then jsonb_set(x,'{lines}',changed_lines) else x end order by ord)
       from jsonb_array_elements(checked->'events') with ordinality as t(x,ord)));
 end loop;
 perform public.wappan_validate_before_purpose_quantities(checked);
 -- Drafts can differ from a previously confirmed bill. Validate their own
 -- product quantities against received stock before allowing a partial save.
 for ev in select value from jsonb_array_elements(d->'events') where value ? 'snackDraft' loop
   plan:=ev->'snackDraft';
   if exists(select 1 from jsonb_array_elements(coalesce(plan->'groups','[]'::jsonb)) g
     where jsonb_typeof(g->'quantities') is distinct from 'object') then continue; end if;
   for line_item in select value from jsonb_array_elements(ev->'lines') loop
     select coalesce(sum((x->>'qty')::numeric),0) into purpose
       from jsonb_array_elements(plan->'fiscal') x where x->>'lineId'=line_item->>'id';
     select purpose+coalesce(sum((x->>'qty')::numeric),0) into purpose
       from jsonb_array_elements(plan->'household') x where x->>'lineId'=line_item->>'id';
     select purpose+coalesce(sum((g->'quantities'->>(line_item->>'id'))::numeric),0) into purpose
       from jsonb_array_elements(plan->'groups') g where g->'quantities' ? (line_item->>'id');
     select coalesce(sum((st->>'qty')::numeric),0) into moved
       from jsonb_array_elements(d->'stocks') st where st->>'eventLineId'=line_item->>'id' and coalesce((st->>'cancelled')::boolean,false)=false;
     if purpose<0 or trunc(purpose)<>purpose or purpose+moved>
       coalesce((line_item->>'receivedQty')::numeric,(line_item->>'qty')::numeric)
       then raise exception 'Snack draft exceeds received product'; end if;
   end loop;
 end loop;
end;
$$;
revoke all on function public.wappan_validate_before_purpose_quantities(jsonb) from public,anon,authenticated;
revoke all on function public.wappan_validate(jsonb) from public,anon,authenticated;
