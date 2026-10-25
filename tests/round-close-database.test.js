import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initialState,newRound} from '../src/domain.js';

test('DB：未収繰越の記録形式を検証し、既存注文回と保存競合を守る',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text unique); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  const migrations=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await fs.readdir(migrations)).filter(x=>x.endsWith('.sql')).sort())await db.exec(await fs.readFile(new URL(file,migrations),'utf8'));
  const id='00000000-0000-0000-0000-000000000001';
  await db.exec(`insert into auth.users values('${id}','staff@example.test'); insert into wappan_private.wappan_staff(user_id) values('${id}'); set role authenticated; set "request.jwt.claim.sub"='${id}'`);
  const state=initialState(),r=newRound(state,'2026-09-11');state.rounds.push(r);
  await db.query('select public.wappan_save(0,$1,$2)',[state,'作成']);
  r.collectionClose={id:crypto.randomUUID(),at:new Date().toISOString(),balances:{[`round:${r.id}:hori`]:430}};
  await db.query('select public.wappan_save(1,$1,$2)',[state,'未収を残して終了']);
  await assert.rejects(()=>db.query('select public.wappan_save(1,$1,$2)',[state,'競合']),/CONFLICT/);
  const bad=structuredClone(state);bad.rounds[0].collectionClose.balances={x:-1};
  await assert.rejects(()=>db.query('select public.wappan_save(2,$1,$2)',[bad,'不正']),/Invalid collection close balance/);
  assert.equal((await db.query('select revision from public.wappan_workspace')).rows[0].revision,2);
 }finally{await db.close();}
});
