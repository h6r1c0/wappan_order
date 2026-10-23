import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {initialState,newRound} from '../src/domain.js';import {receiveCollection,saveCollectionCase,confirmBilling,correctCollectionRecord} from '../src/collection-workflow.js';
test('DB：旧データ互換・預かりと未収の分離・保留・訂正と重複拒否',async()=>{
 const db=new PGlite();await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;");
 const folder=new URL('../supabase/migrations/',import.meta.url);for(const f of (await fs.readdir(folder)).filter(x=>x.endsWith('.sql')).sort())await db.exec(await fs.readFile(new URL(f,folder),'utf8'));
 const s=initialState(),r=newRound(s,'2026-09-11');s.rounds.push(r);r.orders.hori={name:'堀',quantities:{brown:1}};r.products.find(p=>p.id==='brown').price=690;
 await db.query('select public.wappan_validate($1)',[s]);
 receiveCollection(s,{roundId:r.id,buyerId:'hori',received:590,reason:'前回の預かり金を今回使った',pastAmount:100,pastDate:'2026-07-24',requestId:'cash'});
 saveCollectionCase(s,{roundId:r.id,buyerId:'hori',received:10,reason:'原因不明'});confirmBilling(s,r.id,'hori',590);
 correctCollectionRecord(s,'collectionEntries',s.collectionEntries[0].id,'受取金額を間違えた');await db.query('select public.wappan_validate($1)',[s]);
 s.collectionCredits[0].amount=-100;await assert.rejects(()=>db.query('select public.wappan_validate($1)',[s]),/Invalid collection credit/);s.collectionCredits[0].amount=100;
 s.collectionCredits.push({...s.collectionCredits[0],id:'dup'});await assert.rejects(()=>db.query('select public.wappan_validate($1)',[s]),/Duplicate collection workflow/);s.collectionCredits.pop();
 s.collectionCorrections[0].targetId='missing';await assert.rejects(()=>db.query('select public.wappan_validate($1)',[s]),/Invalid collection correction/);s.collectionCorrections[0].targetId=s.collectionEntries[0].id;
 s.collectionEntries.push({...s.collectionEntries[0],id:'receipt-dup'});await assert.rejects(()=>db.query('select public.wappan_validate($1)',[s]),/Duplicate receipt request/);
 await db.close();
});
