-- Keep supplier transfers and seller handovers separate from buyer receipts.
-- Existing workspaces without these keys remain valid. No business data is rewritten.
alter function public.wappan_validate(jsonb) rename to wappan_validate_before_cash_settlement;
create function public.wappan_validate(d jsonb) returns void
language plpgsql set search_path='' as $$
declare k text; x jsonb; source text;
begin
 perform public.wappan_validate_before_cash_settlement(d);
 foreach k in array array['externalCashReceipts','externalCashCorrections','supplierPlans','supplierPayments','supplierPaymentCorrections'] loop
  if not d ? k then continue; end if;
  if jsonb_typeof(d->k) is distinct from 'array' then raise exception 'Invalid cash settlement array'; end if;
  if exists(select 1 from jsonb_array_elements(d->k) v group by v->>'id' having count(*)>1) then raise exception 'Duplicate cash settlement ID'; end if;
  for x in select value from jsonb_array_elements(d->k) loop
   if nullif(btrim(x->>'id'),'') is null then raise exception 'Invalid cash settlement ID'; end if;
   if k in ('externalCashReceipts','supplierPayments') then
    if nullif(btrim(x->>'requestId'),'') is null or nullif(btrim(x->>'note'),'') is null or
      coalesce(x->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or
      not exists(select 1 from jsonb_array_elements(d->'rounds') r where r->>'id'=x->>'roundId') or
      coalesce(x->>'amount','') !~ '^[1-9][0-9]*$' or (x->>'amount')::numeric>100000000
      then raise exception 'Invalid cash settlement entry'; end if;
    perform (x->>'date')::date;
   elsif k='supplierPlans' then
    if coalesce(x->>'dueDate','') !~ '^\d{4}-\d{2}-\d{2}$' or
      not exists(select 1 from jsonb_array_elements(d->'rounds') r where r->>'id'=x->>'roundId') or
      coalesce(x->>'amount','') !~ '^[1-9][0-9]*$' or (x->>'amount')::numeric>100000000 or
      jsonb_typeof(x->'history') is distinct from 'array' then raise exception 'Invalid supplier plan'; end if;
    perform (x->>'dueDate')::date;
   else
    source:=case k when 'externalCashCorrections' then 'externalCashReceipts' else 'supplierPayments' end;
    if nullif(btrim(x->>'reason'),'') is null or
      not exists(select 1 from jsonb_array_elements(coalesce(d->source,'[]'::jsonb)) item where item->>'id'=x->>'targetId')
      then raise exception 'Invalid cash correction'; end if;
   end if;
  end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(coalesce(d->'supplierPlans','[]'::jsonb)) v group by v->>'roundId' having count(*)>1) or
    exists(select 1 from jsonb_array_elements(coalesce(d->'supplierPayments','[]'::jsonb)) v group by v->>'requestId' having count(*)>1) or
    exists(select 1 from jsonb_array_elements(coalesce(d->'externalCashReceipts','[]'::jsonb)) v group by v->>'requestId' having count(*)>1) or
    exists(select 1 from jsonb_array_elements(coalesce(d->'supplierPaymentCorrections','[]'::jsonb)) v group by v->>'targetId' having count(*)>1) or
    exists(select 1 from jsonb_array_elements(coalesce(d->'externalCashCorrections','[]'::jsonb)) v group by v->>'targetId' having count(*)>1)
    then raise exception 'Duplicate cash settlement record'; end if;
end;$$;
revoke all on function public.wappan_validate_before_cash_settlement(jsonb) from public,anon,authenticated;
