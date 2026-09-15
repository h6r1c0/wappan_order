-- Remote migration version: 20260915113650. No customer data is embedded.
create or replace function public.wappan_validate(d jsonb) returns void language plpgsql set search_path = '' as $$
declare k text; r jsonb; p jsonb; e jsonb; st jsonb; sa jsonb; line jsonb; v jsonb;
 qty numeric; deduction numeric; cost numeric; linked jsonb := '[]';
begin
 if (d->>'schema') is distinct from '1' then raise exception 'Invalid schema'; end if;
 foreach k in array array['products','buyers','rounds','events','stocks','sales','history','adjustments'] loop
  if jsonb_typeof(d->k) is distinct from 'array' then raise exception 'Invalid collection %',k; end if;
  if exists(select 1 from jsonb_array_elements(d->k) x group by x->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(d->k) x where coalesce(x->>'id','')='') then raise exception 'Duplicate or missing id'; end if;
 end loop;
 if jsonb_typeof(d->'goals') is distinct from 'object' then raise exception 'Invalid goals'; end if;
 for k,v in select key,value from jsonb_each(d->'goals') loop
  if jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or trunc((v::text)::numeric)<>(v::text)::numeric then raise exception 'Invalid goal'; end if;
 end loop;
 for r in select value from jsonb_array_elements(d->'history') loop
  if r->>'revenue' is null then
   if r->>'cost' is not null or jsonb_typeof(r->'profit') is distinct from 'number' then raise exception 'Unknown history must have profit only'; end if;
  elsif jsonb_typeof(r->'cost') is distinct from 'number' then raise exception 'Missing history cost'; end if;
 end loop;
 for r in select value from jsonb_array_elements(d->'adjustments') loop
  if jsonb_typeof(r->'amount') is distinct from 'number' or jsonb_typeof(r->'year') is distinct from 'number' then raise exception 'Invalid adjustment'; end if;
 end loop;
 -- Reject fractional, negative or overlarge monetary/quantity fields wherever nested.
 for r in with recursive walk(v) as (select d union all select c.value from walk w cross join lateral (select value from jsonb_each(case when jsonb_typeof(w.v)='object' then w.v else '{}' end) union all select value from jsonb_array_elements(case when jsonb_typeof(w.v)='array' then w.v else '[]' end)) c) select w.v from walk w where jsonb_typeof(w.v)='object' loop
  for k,v in select key,value from jsonb_each(r) loop
   if k=any(array['price','gross','manual','cost','qty','used','invoice','revenue']) and v<>'null'::jsonb then
    if jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric>100000000 or trunc((v::text)::numeric)<>(v::text)::numeric then raise exception 'Invalid number %',k; end if;
   end if;
   if k=any(array['profit','amount']) and v<>'null'::jsonb then
    if jsonb_typeof(v)<>'number' or abs((v::text)::numeric)>100000000 or trunc((v::text)::numeric)<>(v::text)::numeric then raise exception 'Invalid signed amount'; end if;
   end if;
  end loop;
 end loop;
 for p in select value from jsonb_array_elements(d->'products') loop
  if p->>'lifecycle' is not null and p->>'lifecycle' not in ('staple','once','seasonal','permanent') then raise exception 'Invalid lifecycle'; end if;
  if p->>'lifecycle'='seasonal' and (coalesce(p->>'start','')='' or coalesce(p->>'end','')='' or p->>'start'>p->>'end') then raise exception 'Invalid seasonal dates'; end if;
 end loop;
 for st in select value from jsonb_array_elements(d->'stocks') loop
  if jsonb_typeof(st->'qty') is distinct from 'number' or (st->>'cost' is not null and jsonb_typeof(st->'cost') is distinct from 'number') or jsonb_typeof(st->'price') is distinct from 'number' then raise exception 'Missing stock numbers'; end if;
  select coalesce(sum((x->>'qty')::numeric),0) into qty from jsonb_array_elements(d->'sales') x where x->>'stockId'=st->>'id' and coalesce((x->>'void')::boolean,false)=false;
  if qty>(st->>'qty')::numeric then raise exception 'Stock oversold'; end if;
  if st->>'eventId' is not null then
   select value into e from jsonb_array_elements(d->'events') where value->>'id'=st->>'eventId';
   select value into line from jsonb_array_elements(e->'lines') where value->>'id'=st->>'eventLineId';
   if line is null or st->>'cost' is null or ((st->>'qty')::numeric > 0 and (line->>'cost') is distinct from (st->>'cost')) or e->'test' is distinct from st->'test' then raise exception 'Invalid event transfer'; end if;
  end if;
 end loop;
 for e in select value from jsonb_array_elements(d->'events') loop
  for line in select value from jsonb_array_elements(e->'lines') loop
   if jsonb_typeof(line->'qty') is distinct from 'number' or jsonb_typeof(line->'used') is distinct from 'number' then raise exception 'Missing event quantities'; end if;
   select coalesce(sum((x->>'qty')::numeric),0) into qty from jsonb_array_elements(d->'stocks') x where x->>'eventLineId'=line->>'id';
   if (line->>'used')::numeric+qty>(line->>'qty')::numeric then raise exception 'Event overallocated'; end if;
  end loop;
 end loop;
 for sa in select value from jsonb_array_elements(d->'sales') loop
  if jsonb_typeof(sa->'qty') is distinct from 'number' or jsonb_typeof(sa->'price') is distinct from 'number' or (sa->>'cost' is not null and jsonb_typeof(sa->'cost') is distinct from 'number') or jsonb_typeof(sa->'paid') is distinct from 'boolean' then raise exception 'Missing sale numbers'; end if;
  select value into st from jsonb_array_elements(d->'stocks') where value->>'id'=sa->>'stockId';
  if st is null or (sa->>'qty')::numeric<1 or sa->>'date'<st->>'date' or sa->'price' is distinct from st->'price' or sa->'cost' is distinct from st->'cost' then raise exception 'Invalid sale'; end if;
  if coalesce((sa->>'pending')::boolean,false) and ((sa->>'paid')::boolean or sa->>'buyerId' is not null or sa->>'chargeRoundId' is not null) then raise exception 'Pending sale must not be charged or paid'; end if;
  if not coalesce((sa->>'pending')::boolean,false) and not (sa->>'paid')::boolean and not exists(select 1 from jsonb_array_elements(d->'buyers') b where b->>'id'=sa->>'buyerId') then raise exception 'Missing buyer'; end if;
  if sa->>'chargeRoundId' is not null then
   select value into r from jsonb_array_elements(d->'rounds') where value->>'id'=sa->>'chargeRoundId';
   if r is null or r->'test' is distinct from st->'test' then raise exception 'Sale / round test mismatch'; end if;
  end if;
 end loop;
 for r in select value from jsonb_array_elements(d->'rounds') loop
  deduction:=0;
  for v in select value from jsonb_array_elements(r->'eventIds') loop
   if linked @> jsonb_build_array('e'||(v#>>'{}')) then raise exception 'Duplicate invoice allocation'; end if;
   linked:=linked||jsonb_build_array('e'||(v#>>'{}'));
   select value into e from jsonb_array_elements(d->'events') where value->>'id'=v#>>'{}';
   if e is null or e->'test' is distinct from r->'test' then raise exception 'Invoice event mismatch'; end if;
   for line in select value from jsonb_array_elements(e->'lines') loop
    if r->>'invoice' is not null and line->>'cost' is null then raise exception 'Unknown event cost'; end if;
    deduction:=deduction+coalesce((line->>'cost')::numeric,0)*(line->>'qty')::numeric;
   end loop;
  end loop;
  for v in select value from jsonb_array_elements(r->'stockIds') loop
   if linked @> jsonb_build_array('s'||(v#>>'{}')) then raise exception 'Duplicate invoice allocation'; end if;
   linked:=linked||jsonb_build_array('s'||(v#>>'{}'));
   select value into st from jsonb_array_elements(d->'stocks') where value->>'id'=v#>>'{}';
   if st is null or st->>'eventId' is not null or st->'test' is distinct from r->'test' then raise exception 'Invoice stock mismatch'; end if;
   if r->>'invoice' is not null and st->>'cost' is null then raise exception 'Unknown stock cost'; end if;
   deduction:=deduction+(st->>'cost')::numeric*(st->>'qty')::numeric;
  end loop;
  if r->>'invoice' is not null and (r->>'invoice')::numeric<deduction then raise exception 'Invoice below allocated costs'; end if;
  if r->>'status'='精算済み' and r->>'invoice' is null then raise exception 'Missing invoice'; end if;
  for k,v in select key,value from jsonb_each(r->'orders') loop
   if not exists(select 1 from jsonb_array_elements(d->'buyers') b where b->>'id'=k) then raise exception 'Unknown buyer'; end if;
   for k,p in select key,value from jsonb_each(v->'quantities') loop
    if not exists(select 1 from jsonb_array_elements(r->'products') pr where pr->>'id'=k) or jsonb_typeof(p)<>'number' or (p::text)::numeric<0 or (p::text)::numeric>100000000 or trunc((p::text)::numeric)<>(p::text)::numeric then raise exception 'Invalid order quantity'; end if;
   end loop;
  end loop;
 end loop;
end;
$$;
revoke all on function public.wappan_validate(jsonb) from public, anon, authenticated;
