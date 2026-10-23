import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {initialState,newRound,report,collections,collectionPosition,collectionDueItems,validate} from '../src/domain.js';
import {billingAudit,chargeLines,confirmBilling,confirmLinePrice,flagMissingCharge,receiveCollection,saveCollectionCase,correctCollectionRecord} from '../src/collection-workflow.js';
import {reassignSale} from '../src/sale-reassignment.js';
import {setSalesOrderQuantities,upgrade} from '../src/commerce.js';
import {addSale} from '../src/domain.js';
function setup(){const s=initialState(),r=newRound(s,'2026-09-11');s.rounds.push(r);r.products=[{id:'base',name:'注文済み商品',price:2130,category:'パン',cost:1800},{id:'donut',name:'ツイストドーナツ',price:190,category:'パン',cost:156}];r.orders.hori={name:'堀',quantities:{base:1,donut:2}};return {s,r};}
test('堀：請求前に注文・数量・単価と袋額を照合し、2個×190円の漏れを選択で修復する',()=>{
 const {s,r}=setup();confirmBilling(s,r.id,'hori',2130,{exceptionReason:'請求内容を照合中'});
 const a=billingAudit(s,r.id).buyers[0];assert.equal(a.expected,2510);assert.equal(a.issues.find(x=>x.type==='bag').difference,380);
 assert.equal(a.lines.find(l=>l.productId==='donut').qty,2);
 const before=report(s,r.date,r.date,2026);
 const claim=flagMissingCharge(s,r.id,'hori','order:donut',2);assert.equal(claim.amount,380);
 assert.equal(flagMissingCharge(s,r.id,'hori','order:donut',2).id,claim.id);assert.equal(s.receivableItems.length,1);
 assert.equal(report(s,r.date,r.date,2026).revenue,before.revenue);
 receiveCollection(s,{roundId:r.id,buyerId:'hori',received:2130,reason:'一部しか受け取っていない',requestId:'one'});
 assert.equal(collectionPosition(s,r.id,'hori').balance,380);assert.equal(collectionPosition(s,r.id,'hori').received,2130);
 assert.throws(()=>receiveCollection(s,{roundId:r.id,buyerId:'hori',received:2130,reason:'多く受け取ったので次回へ預かる',requestId:'one'}),/保存済み/);
 confirmBilling(s,r.id,'hori',2510);assert.equal(billingAudit(s,r.id).issues.length,0);validate(s);
});
test('未確定単価は0円で完了せず候補確認後に一度だけ計上、欠品・正当な変更は漏れ扱いにしない',()=>{
 const {s,r}=setup();r.products[1].price=null;
 assert.equal(billingAudit(s,r.id).issues[0].type,'price');assert.throws(()=>confirmBilling(s,r.id,'hori',2130),/未確定/);
 confirmLinePrice(s,r.id,'donut',190);assert.equal(collectionPosition(s,r.id,'hori').current,2510);
 r.orders.hori.deliveredQuantities={donut:1};
 assert.equal(chargeLines(s,r.id,'hori').find(x=>x.productId==='donut').cancelled,1);assert.equal(billingAudit(s,r.id).issues.length,0);
 r.orders.hori.quantities.donut=3;r.orders.hori.deliveredQuantities.donut=2;assert.equal(billingAudit(s,r.id).issues.length,0);
 r.orders.hori.deliveredQuantities.donut=4;assert.equal(billingAudit(s,r.id).issues[0].type,'quantity');
});
test('請求確認は現金を作らず、確認後の数量変更は再照合する',()=>{
 const {s,r}=setup();confirmBilling(s,r.id,'hori',2510);assert.equal(s.collectionEntries.length,0);
 r.orders.hori.quantities.donut=1;assert(billingAudit(s,r.id).issues.some(x=>x.type==='changed'));
});
test('佐々木：未登録の不足50円を受取1070円の操作内で記録し、再登録・利益加算しない',()=>{
 const {s,r}=setup();r.products[0].price=1020;r.orders.hori.quantities={base:1};const revenue=report(s,r.date,r.date,2026).revenue;
 receiveCollection(s,{roundId:r.id,buyerId:'hori',received:1070,reason:'前回の不足分をまとめて受け取った',pastAmount:50,pastDate:'2026-07-24'});
 assert.equal(collectionPosition(s,r.id,'hori').balance,0);assert.equal(s.receivableItems.length,1);assert.equal(report(s,r.date,r.date,2026).revenue,revenue);validate(s);
 const {s:s2,r:r2}=setup();r2.products[0].price=1020;r2.orders.hori.quantities={base:1};s2.receivableItems.push({id:'old',kind:'opening',buyerId:'hori',date:'2026-07-24',amount:50,reason:'不足',note:'不足'});
 receiveCollection(s2,{roundId:r2.id,buyerId:'hori',received:1070,reason:'前回の不足分をまとめて受け取った',pastAmount:50,pastDate:'2026-07-24'});
 assert.equal(s2.receivableItems.length,1);assert.equal(collectionPosition(s2,r2.id,'hori').balance,0);
});
test('西尾：690円に前回預かり100円を充当し590円受取、売上・利益・翌回残高を保つ',()=>{
 const {s,r}=setup();r.products[0].price=690;r.orders.hori.quantities={base:1};const before=report(s,r.date,r.date,2026);
 receiveCollection(s,{roundId:r.id,buyerId:'hori',received:590,reason:'前回の預かり金を今回使った',pastAmount:100,pastDate:'2026-07-24'});
 assert.equal(collectionPosition(s,r.id,'hori').balance,0);assert.equal(collectionDueItems(s,r.id,'hori').items[0].balance,0);assert.equal(s.collectionCredits.length,1);
 assert.equal(report(s,r.date,r.date,2026).profit,before.profit);
 const next=newRound(s,'2026-10-16');s.rounds.push(next);assert.equal(collectionPosition(s,next.id,'hori').carry,0);validate(s);
});
test('原因不明は金額と調査を保存・再開するだけで、売上・受取・調整を作らない',()=>{
 const {s,r}=setup(),before=structuredClone(s);
 const draft=saveCollectionCase(s,{roundId:r.id,buyerId:'hori',received:2130,reason:'原因が分からないので調べたい',memo:'確認中'});
 assert.equal(draft.received,2130);assert.deepEqual(s.collectionEntries,before.collectionEntries);assert.deepEqual(report(s,r.date,r.date,2026),report(before,r.date,r.date,2026));
 assert.throws(()=>receiveCollection(s,{roundId:r.id,buyerId:'hori',received:2130,reason:draft.reason}),/原因を確認/);
 saveCollectionCase(s,{roundId:r.id,buyerId:'hori',received:2130,reason:draft.reason,memo:'調査再開'});assert.equal(s.collectionCases.length,1);validate(s);
});
test('余語：7月1670円と9月1650円、誤った支払済み確認を履歴付き訂正して3320円を再現',()=>{
 const {s,r}=setup();r.products[0].price=1650;r.orders.hori.quantities={base:1};s.receivableItems.push({id:'july',kind:'opening',buyerId:'hori',date:'2026-07-24',amount:1670,reason:'未受取',note:'7/24分'});
 s.collectionReconciliations.push({id:'wrong',roundId:r.id,buyerId:'hori',amount:1650,note:'9月支払済み'});
 assert.deepEqual([collectionPosition(s,r.id,'hori').carry,collectionPosition(s,r.id,'hori').balance],[1670,1670]);
 const original=structuredClone(s.collectionReconciliations);
 correctCollectionRecord(s,'collectionReconciliations','wrong','支払済みの確認が誤っていた');
 assert.equal(collectionPosition(s,r.id,'hori').balance,3320);assert.equal(collectionDueItems(s,r.id,'hori').items.reduce((n,x)=>n+x.balance,0),3320);
 assert.deepEqual(s.collectionReconciliations,original);assert.throws(()=>correctCollectionRecord(s,'collectionReconciliations','wrong','支払済みの確認が誤っていた'),/訂正済み/);validate(s);
});
test('過入金・返金・入金訂正は売上を変えず、明細残高と総残高が一致する',()=>{
 const {s,r}=setup();receiveCollection(s,{roundId:r.id,buyerId:'hori',received:2610,reason:'多く受け取ったので次回へ預かる'});
 assert.equal(collectionPosition(s,r.id,'hori').balance,-100);assert.equal(collectionDueItems(s,r.id,'hori').credit,100);
 receiveCollection(s,{roundId:r.id,buyerId:'hori',received:-100,reason:'返金がある'});assert.equal(collectionPosition(s,r.id,'hori').balance,0);assert.equal(collectionDueItems(s,r.id,'hori').credit,0);
 correctCollectionRecord(s,'collectionEntries',s.collectionEntries[0].id,'受取金額を間違えた');
 assert.equal(collectionDueItems(s,r.id,'hori').items.reduce((n,x)=>n+x.balance,0),collectionPosition(s,r.id,'hori').balance);
});
test('2個を1個ずつ割り当て直し、修正済みレコードと売上・在庫総数を保持する',()=>{
 const {s,r}=setup();r.products.push({id:'rye',name:'ライ麦くるみレーズン',category:'パン',price:200,cost:150});setSalesOrderQuantities(s,r.id,{rye:2});const st=s.stocks[0];
 addSale(s,st,{qty:2,date:r.date,buyerId:'hori',destinationType:'buyer',chargeRoundId:r.id,paymentStatus:'later'});const sale=s.sales.at(-1);
 const total=report(s,r.date,r.date,2026).revenue;const id=sale.id;
 reassignSale(s,sale.id,1,{buyerId:s.buyers[1].id,destinationType:'buyer',chargeRoundId:r.id});
 assert.equal(s.sales.find(x=>x.id===id).qty,1);assert.equal(s.sales.length,2);assert.equal(report(s,r.date,r.date,2026).revenue,total);validate(s);
});
test('本番バックアップは読み込み・表示で既存ID・内容・修正履歴を変えない',{skip:!process.env.WAPPAN_BASELINE},()=>{
 const original=JSON.parse(fs.readFileSync(process.env.WAPPAN_BASELINE)).workspace.data,s=structuredClone(original);upgrade(s);const before=structuredClone(s);
 for(const r of s.rounds){billingAudit(s,r.id);for(const b of s.buyers){collectionPosition(s,r.id,b.id);collectionDueItems(s,r.id,b.id);}}
 validate(s);assert.deepEqual(s,before);for(const key of ['rounds','sales','collectionEntries','receivableItems','collectionReconciliations','buyers'])assert.deepEqual(s[key],original[key]);
});
