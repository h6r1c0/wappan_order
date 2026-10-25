-- A collection close is an immutable workflow decision, not a receipt or new claim.
-- Existing rounds without this optional field remain valid.
alter function public.wappan_validate(jsonb) rename to wappan_validate_before_round_close;
create function public.wappan_validate(d jsonb) returns void
language plpgsql set search_path='' as $$
declare r jsonb; c jsonb; item record;
begin
 perform public.wappan_validate_before_round_close(d);
 for r in select value from jsonb_array_elements(d->'rounds') value loop
  c:=r->'collectionClose';
  if c is null or c='null'::jsonb then continue; end if;
  if jsonb_typeof(c)<>'object' or nullif(btrim(c->>'id'),'') is null
    or coalesce(c->>'at','') !~ '^\d{4}-\d{2}-\d{2}T'
    or jsonb_typeof(c->'balances') is distinct from 'object'
    or c->'balances'='{}'::jsonb then raise exception 'Invalid collection close'; end if;
  for item in select key,value from jsonb_each(c->'balances') loop
   if nullif(btrim(item.key),'') is null or jsonb_typeof(item.value)<>'number'
     or (item.value::text)::numeric<=0 or (item.value::text)::numeric>100000000
     or trunc((item.value::text)::numeric)<>(item.value::text)::numeric
     then raise exception 'Invalid collection close balance'; end if;
  end loop;
 end loop;
end;$$;
revoke all on function public.wappan_validate_before_round_close(jsonb) from public,anon,authenticated;
revoke all on function public.wappan_validate(jsonb) from public,anon,authenticated;
