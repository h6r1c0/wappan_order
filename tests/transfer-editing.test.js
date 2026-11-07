import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import {initialState,newRound,transfer,correctSnackToSalesTransfer,snackTransferLimits,validate,addSale,report,collections,stockRemaining} from '../src/domain.js';
import {saveSnackSection,snackQuantityRows} from '../src/snack-billing.js';
import {transferStockToSnack,cancelStockToSnackTransfer} from '../src/snack-transfer.js';
import {moveStock} from '../src/commerce.js';

import {transferEditingFixture} from './fixtures/transfer-editing.js';

test('11/7: 残り0・対象23/家庭24・旧usedありでも、元3→2の1個を同じ共通単価へ戻せる',()=>{
 const {s,r,e,apple}=transferEditingFixture();validate(s);
 const before=structuredClone(s),financial=report(s,r.date,r.date,2026,{includeTest:true});
 assert.equal(snackQuantityRows(s,e).find(x=>x.line.id==='apple').unassigned,0);
 assert.deepEqual(snackTransferLimits(s,apple.id),{sold:0,moved:0,minimum:0,maximum:3,unused:3});
 correctSnackToSalesTransfer(s,apple.id,2,'販売実績を確認');validate(s);
 assert.equal(snackQuantityRows(s,e).find(x=>x.line.id==='apple').unassigned,1);
 assert.deepEqual(e.snackDraft,before.events[0].snackDraft);
 assert.deepEqual(s.collectionEntries,before.collectionEntries);
 assert.deepEqual(report(s,r.date,r.date,2026,{includeTest:true}),financial);
 const group={...e.snackDraft.groups[0],quantities:{bean:11,apple:13}};
 saveSnackSection(s,e.id,'common',{groups:[group,e.snackDraft.groups[1]],household:e.snackDraft.household.filter(x=>x.groupId)});
 const reload=JSON.parse(JSON.stringify(s));validate(reload);
 assert.equal(reload.stocks.find(x=>x.id===apple.id).qty,2);
 assert.equal(e.snackDraft.groups[0].unitPrice,150);assert.equal(e.snackDraft.groups[0].id,'original-common');
 assert.equal(e.snackDraft.household.find(x=>x.groupId).qty,24);
 assert.equal(snackQuantityRows(s,e).find(x=>x.line.id==='apple').unassigned,0);
 assert.deepEqual(collections(s,'','',r.id,true),collections(before,'','',r.id,true));
});

test('11/7: 白パンの販売済み2・再振替済み1を分けて示し、未使用分だけ訂正する',()=>{
 const {s,r,white}=transferEditingFixture();
 addSale(s,white,{qty:2,date:r.date,destinationType:'external',paymentStatus:'paid'});moveStock(s,white,1);
 assert.deepEqual(snackTransferLimits(s,white.id),{sold:2,moved:1,minimum:3,maximum:5,unused:2});
 correctSnackToSalesTransfer(s,white.id,3,'未使用2個を戻す');validate(s);
 const before=structuredClone(s);
 assert.throws(()=>correctSnackToSalesTransfer(s,white.id,2,'超過'),/販売済み 2個・再振替済み 1個、最小 3個/);
 assert.deepEqual(s,before);
 assert.equal(snackTransferLimits(s,white.id).unused,0);
});

test('11/7: 別の直接仕入在庫からの1個取消を元3個に混同せず、取消後のDB保存も成立する',async()=>{
 const {s,r,e,apple}=transferEditingFixture();
 const direct={id:'direct-apple',productId:'apple',name:'りんごデニッシュ（涼）',qty:5,cost:151,price:190,date:r.date,roundId:r.id,test:true};s.stocks.push(direct);r.stockIds.push(direct.id);
 const line=transferStockToSnack(s,direct.id,e.id,1);
 e.snackDraft.groups.push({id:'reverse-group',label:'共通単価',lineIds:[line.id],quantities:{[line.id]:1},unitPrice:150});
 cancelStockToSnackTransfer(s,e.id,line.id,'機能が実装されたから');
 assert.equal(stockRemaining(s,direct),5);assert.equal(snackTransferLimits(s,apple.id).moved,0);
 assert.equal(e.cancelledStockTransferLines.length,1);assert.equal(e.stockTransferHistory.at(-1).updated,0);
 assert.equal(e.snackDraft.groups.length,3);
 correctSnackToSalesTransfer(s,apple.id,2,'元の数量を訂正');validate(s);
 const db=new PGlite();
 try{
  await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text unique); create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;");
  for(const name of (await fs.readdir(new URL('../supabase/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())await db.exec(await fs.readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.query('select public.wappan_validate($1)',[s]);
  const roundtrip=JSON.parse(JSON.stringify(s));await db.query('select public.wappan_validate($1)',[roundtrip]);
  assert.equal(roundtrip.stocks.find(x=>x.id===apple.id).transferHistory.at(-1).updated,2);
 }finally{await db.close();}
});
