import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initialState,newRound,transfer} from '../src/domain.js';

test('DB は旧注文を保ち、おやつ請求の二重割当・振替後数量超過・無効購入者を拒否する',async()=>{
  const db=new PGlite();
  await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text unique); create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;");
  for(const name of (await fs.readdir(new URL('../supabase/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())
    await db.exec(await fs.readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  const s=initialState(),r=newRound(s,'2026-10-16');s.rounds.push(r);
  s.events.push({id:'event',roundId:r.id,date:r.date,name:'運動会リハ',test:false,lines:[
    {id:'beanline',name:'こしあんぱん',qty:6,used:0,cost:130},
    {id:'appleline',name:'りんごデニッシュ',qty:6,used:0,cost:151},
  ]});r.eventIds.push('event');
  const e=s.events[0];
  await db.query('select public.wappan_validate($1)',[s]);
  e.billing={label:'運動会リハ',fiscal:[{lineId:'beanline',qty:3},{lineId:'appleline',qty:3}],household:[{buyerId:'hori',lineId:null,qty:2,unitPrice:150}]};
  await db.query('select public.wappan_validate($1)',[s]);
  e.billing.household.push({...e.billing.household[0]});
  await assert.rejects(()=>db.query('select public.wappan_validate($1)',[s]),/Duplicate snack/);
  e.billing.household.pop();e.billing.household[0].buyerId='missing';
  await assert.rejects(()=>db.query('select public.wappan_validate($1)',[s]),/Invalid household snack/);
  e.billing.household[0].buyerId='hori';
  transfer(s,e,e.lines[0],4,160,r.date);
  await assert.rejects(()=>db.query('select public.wappan_validate($1)',[s]),/Snack billing exceeds/);
  await db.close();
});
