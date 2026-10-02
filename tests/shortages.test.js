import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initialState,newRound,collections,roundRevenue,validate,stockRemaining,report} from '../src/domain.js';
import {upgrade,setSalesOrderQuantities,setSnackOrderQuantities,sellBundle,deliveryTotals} from '../src/commerce.js';
import {shortageRecipients,fairAllocation,applyShortage,shortageMessage,receivedQuantity} from '../src/shortages.js';
function fixture(){
 const s=upgrade(initialState());s.products.forEach(p=>{p.mode='manual';p.manual=200;p.cost=100;});
 s.buyers=['渡辺','近藤','堀','浅野'].map((name,i)=>({id:'b'+i,name,active:true,fixed:[]}));
 const r=newRound(s,'2026-10-16',true);s.rounds.push(r);
 s.buyers.forEach((b,i)=>{r.orders[b.id]={name:b.name,quantities:{walnut:[3,2,1,1][i]}};});
 r.status='注文確定';r.planned=structuredClone(r.orders);return {s,r};
}
test('段階抽選は初回1人1個を優先し、2巡目は未充足者だけ、注文数上限を保つ',()=>{
 const {s,r}=fixture(),p=shortageRecipients(s,r,'walnut');
 for(let seed=1;seed<100;seed++){
  let x=seed;const random=()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296;};
  const a=fairAllocation(p,5,random);assert.equal(Object.values(a).reduce((n,q)=>n+q,0),5);
  assert.equal(a['buyer:b2'],1);assert.equal(a['buyer:b3'],1);assert.ok(a['buyer:b0']>=1&&a['buyer:b1']>=1);
 }
 const firstWinners=new Set();for(const v of [0,.2,.5,.8,.99]){const a=fairAllocation(p,1,()=>v);firstWinners.add(Object.keys(a).find(k=>a[k]));}assert.ok(firstWinners.size>1);
 assert.throws(()=>fairAllocation(p,8),/超え/);
});
test('欠品配分は元注文・発注を保ち、実渡し・集金・売上だけを連動しテストを年間除外',()=>{
 const {s,r}=fixture(),before=structuredClone(r.orders),rows=shortageRecipients(s,r,'walnut');
 const a=fairAllocation(rows,5,()=>.1),record=applyShortage(s,r.id,'walnut',5,a,'lottery',rows);
 assert.deepEqual(Object.values(r.orders).map(o=>o.quantities),Object.values(before).map(o=>o.quantities));
 assert.deepEqual(r.planned,before);assert.equal(deliveryTotals(s,r)[0].qty,7);assert.equal(roundRevenue(r),1000);
 assert.equal(collections(s,'','',r.id,true).reduce((n,p)=>n+p.total,0),1000);
 assert.equal(report(s,2026,'2026-04-01','2027-03-31').revenue,0);
 assert.match(shortageMessage(record,record.allocations.find(p=>p.shortage)),/段階抽選/);validate(s);
 const broken=structuredClone(s);broken.rounds[0].orders.b0.deliveredQuantities.walnut=4;assert.throws(()=>validate(broken),/実渡し/);
});
test('全欠品・手動配分の連絡文は処理結果と一致し、配分過多・不足・古い確認を拒否',()=>{
 const {s,r}=fixture(),rows=shortageRecipients(s,r,'walnut');
 const zero=Object.fromEntries(rows.map(p=>[p.key,0]));
 assert.throws(()=>applyShortage(s,r.id,'walnut',1,zero,'manual',rows),/合計/);
 const record=applyShortage(s,r.id,'walnut',0,zero,'manual',rows);
 assert.match(shortageMessage(record,record.allocations[0]),/入荷がありません/);
 assert.doesNotMatch(shortageMessage(record,record.allocations[0]),/抽選/);assert.equal(roundRevenue(r),0);
 const mutated=structuredClone(rows);mutated[0].qty=9;assert.throws(()=>applyShortage(s,r.id,'walnut',0,zero,'manual',mutated),/変わり/);
});
test('販売用・おやつ欠品は発注数を残して入荷残数・原価を制限し、場所なしセットも会計を維持',()=>{
 const {s,r}=fixture();setSalesOrderQuantities(s,r.id,{walnut:3});setSnackOrderQuantities(s,r.id,{walnut:2});
 const st=s.stocks[0],line=s.events[0].lines[0],rows=shortageRecipients(s,r,'walnut');
 const a=Object.fromEntries(rows.map(p=>[p.key,0]));a['stock:'+st.id]=2;a['snack:'+line.id]=1;
 applyShortage(s,r.id,'walnut',3,a,'manual',rows);assert.equal(st.qty,3);assert.equal(stockRemaining(s,st),2);assert.equal(line.qty,2);assert.equal(receivedQuantity(line),1);
 const b={id:'set',roundId:r.id,marketId:null,name:'パンセット',price:350,components:[{stockId:st.id,qty:1}]};s.bundles.push(b);
 sellBundle(s,b,1,r.date,{destinationType:'buyer',paymentStatus:'later',buyerId:'b0'});assert.equal(stockRemaining(s,st),1);assert.equal(collections(s,'','',r.id,true)[0].total,350);validate(s);
 const tooFew={...a,['stock:'+st.id]:0};assert.throws(()=>applyShortage(s,r.id,'walnut',1,tooFew,'manual',rows),/販売・振替/);
});
test('DB保存検証: 元注文保持・入荷数上限・配分合計・場所なしセット・旧形式の互換',async()=>{
 const db=new PGlite();await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;");
 for(const name of (await fs.readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await fs.readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 const {s,r}=fixture();await db.query('select public.wappan_validate($1)',[s]);
 setSalesOrderQuantities(s,r.id,{walnut:3});const st=s.stocks[0],rows=shortageRecipients(s,r,'walnut');
 const a=Object.fromEntries(rows.map(p=>[p.key,p.kind==='stock'?1:0]));applyShortage(s,r.id,'walnut',1,a,'manual',rows);
 s.bundles.push({id:'set',roundId:r.id,marketId:null,name:'セット',price:300,components:[{stockId:st.id,qty:1}]});sellBundle(s,s.bundles[0],1,r.date,{destinationType:'external',paymentStatus:'paid'});
 await db.query('select public.wappan_validate($1)',[s]);
 const over=structuredClone(s);over.bundleSales[0].qty=2;await assert.rejects(()=>db.query('select public.wappan_validate($1)',[over]),/oversold/);
 const invalid=structuredClone(s);invalid.rounds[0].shortages[0].received=2;await assert.rejects(()=>db.query('select public.wappan_validate($1)',[invalid]),/total/);
 await db.close();
});
