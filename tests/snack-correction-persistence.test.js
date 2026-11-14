import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initialState,newRound,transfer,validate,collectionPosition} from '../src/domain.js';
import {saveSnackSection,confirmSnackPlan,recordFiscalAdjustment,settleFiscalAdjustment} from '../src/snack-billing.js';

test('DB保存・再読込：確定請求100円の取消と1個振替、財政151円の精算は原本を保持する',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
  const folder=new URL('../supabase/migrations/',import.meta.url);
  for(const f of (await fs.readdir(folder)).filter(x=>x.endsWith('.sql')).sort())await db.exec(await fs.readFile(new URL(f,folder),'utf8'));
  const user='00000000-0000-0000-0000-000000000001';
  await db.exec(`insert into auth.users values('${user}','staff@example.test');insert into wappan_private.wappan_staff(user_id) values('${user}');set role authenticated;set "request.jwt.claim.sub"='${user}';`);
  let s=initialState();const r=newRound(s,'2026-10-16');s.rounds.push(r);
  const e={id:'snack-correct',name:'おやつ用',roundId:r.id,date:r.date,test:false,lines:[
   {id:'white',name:'白パン',qty:16,used:11,usedConfirmed:true,cost:95},
   {id:'apple',name:'りんごデニッシュ',qty:4,used:4,usedConfirmed:true,cost:151}],
   billing:{label:'おやつ用',fiscal:[{lineId:'apple',qty:4}],groups:[{id:'group',label:'共通',lineIds:['white'],quantities:{white:10},unitPrice:100,priceMode:'manual'}],
    household:[{buyerId:'hori',lineId:'white',qty:1,unitPrice:100},{buyerId:'asano',lineId:null,groupId:'group',qty:10,unitPrice:100}]},
   fiscalReceipts:[{id:'fiscal-cash',date:r.date,amount:604}]};
  s.events.push(e);r.eventIds.push(e.id);transfer(s,e,e.lines[0],5,180,r.date);
  const original=structuredClone(e),cash=structuredClone(s.collectionEntries);
  const save=async(rev,label)=>{validate(s);await db.query('select public.wappan_save($1,$2,$3)',[rev,s,label]);s=(await db.query('select data from public.wappan_workspace')).rows[0].data;};
  await save(0,'元請求');
  saveSnackSection(s,e.id,'direct',[],'食べていなかったため');await save(1,'途中保存');
  assert.equal(collectionPosition(s,r.id,'hori').current,100);
  confirmSnackPlan(s,e.id,'食べていなかったため');await save(2,'再確定');
  assert.equal(collectionPosition(s,r.id,'hori').current,0);
  let current=s.events.find(x=>x.id===e.id);assert.equal(current.lines[0].used,10);
  assert.deepEqual(current.billingHistory[0].billing,original.billing);
  transfer(s,current,current.lines[0],1,180,r.date);await save(3,'1個だけ振替');
  const adjustment=recordFiscalAdjustment(s,e.id,{id:'adjust',lineId:'apple',qty:1,reason:'1個分の過剰請求'});assert.equal(adjustment.amount,151);await save(4,'精算予定');
  settleFiscalAdjustment(s,e.id,'adjust',{date:'2026-11-15',method:'財政と相殺',amount:151});await save(5,'精算実績');
  current=s.events.find(x=>x.id===e.id);
  assert.equal(current.fiscalAdjustments[0].settlement.amount,151);
  assert.deepEqual(current.fiscalReceipts,original.fiscalReceipts);assert.deepEqual(current.billing.fiscal,original.billing.fiscal);
  assert.deepEqual(s.collectionEntries,cash);assert.equal(s.stocks.reduce((n,x)=>n+x.qty,0),6);
  await assert.rejects(()=>db.query('select public.wappan_save($1,$2,$3)',[5,s,'古い画面']),/CONFLICT/);
  assert.equal((await db.query('select revision from public.wappan_workspace')).rows[0].revision,6);
 }finally{await db.close();}
});
