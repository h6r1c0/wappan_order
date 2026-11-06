import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initialState,newRound,validate,collections,collectionPosition,report,stockRemaining,addSale,eventCost,transfer,correctSnackToSalesTransfer} from '../src/domain.js';
import {upgrade} from '../src/commerce.js';
import {saveSnackSection,confirmSnackPlan,snackBillingPreview} from '../src/snack-billing.js';
import {transferStockToSnack,cancelStockToSnackTransfer} from '../src/snack-transfer.js';
import {saveOtherSale,replaceOtherAllocations} from '../src/other-sales.js';

const setup=()=>{
 const s=initialState(),r=newRound(s,'2026-10-16',true);s.rounds.push(r);upgrade(s);
 s.buyers.push({id:'buyer-a',name:'検証A',active:true,fixed:[]},{id:'buyer-b',name:'検証B',active:true,fixed:[]});
 const e={id:'snack',roundId:r.id,name:'おやつ用',date:r.date,test:true,lines:[
  {id:'bean',name:'こしあんぱん',qty:12,used:4,usedConfirmed:true,cost:130},
  {id:'apple',name:'りんごデニッシュ',qty:12,used:4,usedConfirmed:true,cost:151},
 ]};
 s.events.push(e);r.eventIds.push(e.id);
 return {s,r,e};
};
test('10/16の4区分は途中保存・再読込・確定を分け、財政各4だけで家庭請求を作らない',()=>{
 const {s,r,e}=setup();
 saveSnackSection(s,e.id,'fiscal',[{lineId:'bean',qty:4},{lineId:'apple',qty:4}]);
 const reload=structuredClone(s);
 assert.equal(reload.events[0].billing,undefined);
 assert.equal(collections(s,'','',r.id,true).filter(x=>x.snack).length,0);
 const group={id:'common',label:'共通単価',unitPrice:150,lineIds:['bean','apple'],quantities:{bean:2,apple:1}};
 saveSnackSection(s,e.id,'common',{groups:[group],household:[
  {buyerId:'buyer-a',groupId:'common',lineId:null,qty:1,unitPrice:150},
  {buyerId:'buyer-b',groupId:'common',lineId:null,qty:2,unitPrice:150},
 ]});
 assert.equal(s.events[0].snackDraft.fiscal[0].qty,4);
 saveSnackSection(s,e.id,'direct',[{buyerId:'buyer-a',lineId:'apple',qty:1,unitPrice:160}]);
 assert.equal(s.events[0].snackDraft.groups[0].quantities.bean,2);
 assert.equal(collectionPosition(s,r.id,'buyer-a').current,0);
 e.lines.find(l=>l.id==='bean').used=6;e.lines.find(l=>l.id==='apple').used=6;
 confirmSnackPlan(s,e.id);
 assert.equal(e.lines.find(l=>l.id==='bean').used,6);
 assert.equal(e.lines.find(l=>l.id==='apple').used,6);
 assert.equal(snackBillingPreview(s,e).fiscal,1124);
 assert.equal(snackBillingPreview(s,e).household,610);
 assert.equal(collectionPosition(s,r.id,'buyer-a').current,310);
 assert.equal(collectionPosition(s,r.id,'buyer-b').current,300);
 assert.equal(e.billing.groups[0].quantities.apple,1);
 assert.equal(e.snackDraftHistory.length,2);
 validate(s);
});
test('確定請求の訂正理由がない失敗では使用数と元の請求を変更しない',()=>{
 const {s,e}=setup();
 saveSnackSection(s,e.id,'fiscal',[{lineId:'bean',qty:4},{lineId:'apple',qty:4}]);
 confirmSnackPlan(s,e.id);
 saveSnackSection(s,e.id,'fiscal',[{lineId:'bean',qty:5},{lineId:'apple',qty:4}]);
 const before=structuredClone(e);
 assert.throws(()=>confirmSnackPlan(s,e.id,''),/理由/);
 assert.deepEqual(e,before);
});
test('同じ販売済み8個を二重に売らず、その他商品を複数家庭の未収へ接続する',()=>{
 const {s,r}=setup();
 const item=saveOtherSale(s,{name:'検証用レモン',date:r.date,qty:8,unitPrice:120,unitCost:0,paymentStatus:'unpaid',test:true});
 const before=report(s,r.date,r.date,2026,{includeTest:true}).rows.find(x=>x.id===item.id);
 assert.equal(before.revenue,960);
 replaceOtherAllocations(s,item.id,[{buyerId:'buyer-a',qty:3},{buyerId:'buyer-b',qty:5}]);
 assert.equal(collectionPosition(s,r.id,'buyer-a').current,360);
 assert.equal(collectionPosition(s,r.id,'buyer-b').current,600);
 assert.equal(report(s,r.date,r.date,2026,{includeTest:true}).rows.find(x=>x.id===item.id).revenue,960);
 assert.throws(()=>replaceOtherAllocations(s,item.id,[{buyerId:'buyer-a',qty:9}]),/超える/);
 assert.throws(()=>saveOtherSale(s,{...item,qty:7},{id:item.id,reason:'減数'}),/先に訂正/);
 const next=newRound(s,'2026-11-13',true);s.rounds.push(next);
 assert.equal((s.otherSales||[]).filter(x=>x.date===next.date).length,0);
 validate(s);
});
test('販売用5個のうち販売済み3個を守り、おやつへ1個移して請求先を指定する',()=>{
 const {s,r,e}=setup();
 const source={id:'jelly',roundId:r.id,name:'検証用ゼリー',qty:5,cost:90,price:270,date:r.date,test:true,category:'その他'};
 s.stocks.push(source);r.stockIds.push(source.id);
 addSale(s,source,{qty:3,date:r.date,price:270,destinationType:'external',paymentStatus:'paid'});
 const prior=eventCost(e),line=transferStockToSnack(s,source.id,e.id,1);
 assert.equal(stockRemaining(s,source),1);
 assert.equal(eventCost(e),prior);
 assert.throws(()=>transferStockToSnack(s,source.id,e.id,2),/残数/);
 saveSnackSection(s,e.id,'fiscal',[{lineId:'bean',qty:4},{lineId:'apple',qty:4},{lineId:line.id,qty:1}]);
 assert.equal(e.billing,undefined);
 confirmSnackPlan(s,e.id);
 assert.equal(collections(s,'','',r.id,true).filter(x=>x.snack).length,0);
 assert.equal(s.sales.filter(x=>x.stockId===source.id&&!x.void).reduce((n,x)=>n+x.qty,0),3);
 assert.equal(e.stockTransferHistory[0].sourceStockId,source.id);
 validate(s);
});
test('仕入原価が未確認の振替は用途を途中保存し、確定請求を保留する',()=>{
 const {s,r,e}=setup();
 const stock={id:'uncosted',roundId:r.id,date:r.date,name:'検証商品',qty:2,cost:null,price:120,test:true};
 s.stocks.push(stock);r.stockIds.push(stock.id);
 const line=transferStockToSnack(s,stock.id,e.id,1);
 saveSnackSection(s,e.id,'fiscal',[{lineId:'bean',qty:4},{lineId:'apple',qty:4}]);
 saveSnackSection(s,e.id,'direct',[{buyerId:'buyer-a',lineId:line.id,qty:1,unitPrice:120}]);
 assert.equal(stockRemaining(s,stock),1);
 assert.throws(()=>confirmSnackPlan(s,e.id),/仕入単価/);
 assert.equal(e.billing,undefined);
 assert.equal(line.used,1);
});
test('DBは新しい途中保存と確定請求を受け取り、在庫・家庭請求の過剰を拒否する',async()=>{
 const db=new PGlite();
 await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text unique); create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;");
 for(const name of (await fs.readdir(new URL('../supabase/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())
  await db.exec(await fs.readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 const {s,r,e}=setup();saveSnackSection(s,e.id,'fiscal',[{lineId:'bean',qty:4},{lineId:'apple',qty:4}]);
 await db.query('select public.wappan_validate($1)',[s]);
 transfer(s,e,e.lines[1],3,190,r.date);const outbound=s.stocks.at(-1);outbound.roundId=r.id;
 await db.query('select public.wappan_validate($1)',[s]);
 correctSnackToSalesTransfer(s,outbound.id,2,'数量訂正');
 await db.query('select public.wappan_validate($1)',[s]);
 const item=saveOtherSale(s,{name:'検証用果物',date:r.date,qty:8,unitPrice:120,unitCost:0,paymentStatus:'unpaid',test:true});
 replaceOtherAllocations(s,item.id,[{buyerId:'buyer-a',qty:3},{buyerId:'buyer-b',qty:5}]);
 const st={id:'jelly',roundId:r.id,name:'検証商品',qty:5,cost:90,price:270,date:r.date,test:true};s.stocks.push(st);r.stockIds.push(st.id);
 addSale(s,st,{qty:3,date:r.date,price:270,destinationType:'external',paymentStatus:'paid'});
 const moved=transferStockToSnack(s,st.id,e.id,1);
 await db.query('select public.wappan_validate($1)',[s]);
 cancelStockToSnackTransfer(s,e.id,moved.id,'逆方向の入力を訂正');
 await db.query('select public.wappan_validate($1)',[s]);
 const restored=transferStockToSnack(s,st.id,e.id,1);
 saveSnackSection(s,e.id,'direct',[{lineId:restored.id,buyerId:'buyer-a',qty:1,unitPrice:150}]);
 saveSnackSection(s,e.id,'common',{groups:[{id:'group',label:'共通単価',lineIds:['bean','apple'],quantities:{bean:1,apple:1},unitPrice:150}],
  household:[{buyerId:'buyer-b',groupId:'group',lineId:null,qty:2,unitPrice:150}]});
 await db.query('select public.wappan_validate($1)',[s]);
 e.lines.find(l=>l.id==='bean').used=5;e.lines.find(l=>l.id==='apple').used=5;
 confirmSnackPlan(s,e.id);
 await db.query('select public.wappan_validate($1)',[s]);
 const original=structuredClone(e.billing);
 e.billing.fiscal.push({lineId:'does-not-exist',qty:1});
 await assert.rejects(()=>db.query('select public.wappan_validate($1)',[s]),/Invalid fiscal snack section/);
 e.billing=original;
 item.allocations[0].qty=4;
 await assert.rejects(()=>db.query('select public.wappan_validate($1)',[s]),/Other sale overallocated/);
 item.allocations[0].qty=3;st.qty=3;
 await assert.rejects(()=>db.query('select public.wappan_validate($1)',[s]),/Stock to snack exceeds/);
 await db.close();
});
