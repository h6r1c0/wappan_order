import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {initialState,newRound,report,collections,collectionPosition,collectionDueItems,orderDraft,productTotals,unpricedOrderLines,validate} from '../src/domain.js';
import {billingAudit,chargeLines,confirmBilling,confirmLinePrice,flagMissingCharge,receiveCollection,receiveFullCollection,receiveDueItem,saveCollectionCase,correctCollectionRecord,recordCollectionAllocation,recordHistoricalCredit} from '../src/collection-workflow.js';
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
 assert.equal(billingAudit(s,r.id).issues.length,0,'保存済みの380円で説明できる袋額差は再警告しない');
 assert.equal(flagMissingCharge(s,r.id,'hori','order:donut',2).id,claim.id);assert.equal(s.receivableItems.length,1);
 assert.equal(report(s,r.date,r.date,2026).revenue,before.revenue);
 receiveCollection(s,{roundId:r.id,buyerId:'hori',received:2130,reason:'一部しか受け取っていない',requestId:'one'});
 assert.equal(collectionPosition(s,r.id,'hori').balance,380);assert.equal(collectionPosition(s,r.id,'hori').received,2130);
 assert.throws(()=>receiveCollection(s,{roundId:r.id,buyerId:'hori',received:2130,reason:'多く受け取ったので次回へ預かる',requestId:'one'}),/保存済み/);
 confirmBilling(s,r.id,'hori',2510);assert.equal(billingAudit(s,r.id).issues.length,0);validate(s);
});
test('余語：既存の現金受取1650円を9月分に指定しても受取原本を変えず7月1670円だけ残す',()=>{
 const {s,r}=setup();r.products[0].price=1650;r.orders.hori.quantities={base:1};
 s.receivableItems.push({id:'july',kind:'opening',buyerId:'hori',date:'2026-07-24',amount:1670,reason:'未受取',note:'7月分'});
 const receipt=receiveCollection(s,{roundId:r.id,buyerId:'hori',received:1650,reason:'一部しか受け取っていない'});
 const original=structuredClone(receipt),revenue=report(s,r.date,r.date,2026);
 assert.deepEqual(collectionDueItems(s,r.id,'hori').items.map(x=>x.balance),[1670,1650],'旧形式は充当先を断定できない');
 assert.equal(collectionPosition(s,r.id,'hori').unallocated,1650);
 recordCollectionAllocation(s,receipt.id,[{itemId:`round:${r.id}:hori`,amount:1650}]);
 assert.deepEqual(s.collectionEntries[0],original);assert.deepEqual(collectionDueItems(s,r.id,'hori').items.map(x=>x.balance),[1670,0]);
 assert.equal(collectionPosition(s,r.id,'hori').balance,1670);assert.equal(collectionPosition(s,r.id,'hori').unallocated,0);assert.deepEqual(report(s,r.date,r.date,2026),revenue);
 assert.throws(()=>recordCollectionAllocation(s,receipt.id,[{itemId:'july',amount:1650}]),/確認済み/);validate(s);
 correctCollectionRecord(s,'collectionEntries',receipt.id,'受取金額を間違えた');
 assert.equal(collectionPosition(s,r.id,'hori').balance,3320);assert.equal(s.collectionAllocations.length,1,'訂正後も元の充当判断を監査履歴として保持');validate(s);
});
test('余語：訂正済み支払確認と有効な充当が併存しても、9月の現金は一度だけ控除',()=>{
 const {s,r}=setup();r.products[0].price=1650;r.orders.hori.quantities={base:1};
 s.receivableItems.push({id:'july',kind:'opening',buyerId:'hori',date:'2026-07-24',amount:1670,reason:'未受取',note:'7月分'});
 s.collectionReconciliations.push({id:'old-confirmation',roundId:r.id,buyerId:'hori',amount:1650,note:'誤った支払確認'});
 correctCollectionRecord(s,'collectionReconciliations','old-confirmation','支払済みの確認が誤っていた');
 const receipt=receiveCollection(s,{roundId:r.id,buyerId:'hori',received:1650,reason:'一部しか受け取っていない'});
 recordCollectionAllocation(s,receipt.id,[{itemId:`round:${r.id}:hori`,amount:1650}]);
 assert.deepEqual(collectionDueItems(s,r.id,'hori').items.map(x=>x.balance),[1670,0]);
 assert.equal(collectionPosition(s,r.id,'hori').balance,1670);
 assert.equal(s.collectionEntries.length,1);assert.equal(s.collectionAllocations.length,1);assert.equal(s.collectionCorrections.length,1);
 validate(s);
});
test('西尾：元の受取日不明の預かり100円を今回請求へ充当し、現金590円は記録しない',()=>{
 const {s,r}=setup();r.products[0].price=690;r.orders.hori.quantities={base:1};
 const previous=report(s,r.date,r.date,2026);
 const credit=recordHistoricalCredit(s,{roundId:r.id,buyerId:'hori',amount:100,appliedTo:`round:${r.id}:hori`});
 assert.equal(credit.date,null);assert.equal(credit.amount,100);
 assert.equal(collectionPosition(s,r.id,'hori').balance,590);
 assert.equal(collectionDueItems(s,r.id,'hori').items.at(-1).balance,590);
 assert.equal(collectionPosition(s,r.id,'hori').availableCredit,0);
 assert.equal(s.collectionEntries.length,0);assert.deepEqual(report(s,r.date,r.date,2026),previous);
 assert.throws(()=>recordHistoricalCredit(s,{roundId:r.id,buyerId:'hori',amount:100,appliedTo:credit.appliedTo}),/記録済み/);
 assert.throws(()=>receiveCollection(s,{roundId:r.id,buyerId:'hori',received:-100,reason:'返金がある'}),/返金できる預かり残高/);
 validate(s);
});
test('充当先は混合受取の金額を分けて保存し、未収超過・金額不足を拒否する',()=>{
 const {s,r}=setup();r.products[0].price=1650;r.orders.hori.quantities={base:1};s.receivableItems.push({id:'july',kind:'opening',buyerId:'hori',date:'2026-07-24',amount:1670,reason:'未受取',note:'7月分'});
 const e=receiveCollection(s,{roundId:r.id,buyerId:'hori',received:1800,reason:'一部しか受け取っていない'});
 assert.throws(()=>recordCollectionAllocation(s,e.id,[{itemId:'july',amount:1670}]),/一致/);
 assert.throws(()=>recordCollectionAllocation(s,e.id,[{itemId:'july',amount:1800}]),/未収/);
 recordCollectionAllocation(s,e.id,[{itemId:'july',amount:150},{itemId:`round:${r.id}:hori`,amount:1650}]);
 assert.deepEqual(collectionDueItems(s,r.id,'hori').items.map(x=>x.balance),[1520,0]);validate(s);
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
 const backup=JSON.parse(fs.readFileSync(process.env.WAPPAN_BASELINE));const original=backup.workspace?.data||backup.data,s=structuredClone(original);upgrade(s);const before=structuredClone(s);
 for(const r of s.rounds){billingAudit(s,r.id);for(const b of s.buyers){collectionPosition(s,r.id,b.id);collectionDueItems(s,r.id,b.id);}}
 validate(s);assert.deepEqual(s,before);for(const key of ['rounds','sales','collectionEntries','receivableItems','collectionReconciliations','buyers'])assert.deepEqual(s[key],original[key]);
});


test('集金袋額は今回請求だけでなく過去不足・預かりを含めて照合する',()=>{
 const {s,r}=setup();r.products[0].price=1020;r.orders.hori.quantities={base:1};
 s.receivableItems.push({id:'old50',kind:'opening',buyerId:'hori',date:'2026-07-24',amount:50,reason:'不足',note:'前回分'});
 confirmBilling(s,r.id,'hori',1070);assert.equal(billingAudit(s,r.id).issues.length,0);assert.equal(billingAudit(s,r.id).buyers[0].current,1020);
 const {s:s2,r:r2}=setup();r2.products[0].price=690;r2.orders.hori.quantities={base:1};
 s2.collectionCredits=[{id:'credit100',roundId:r2.id,buyerId:'hori',date:'2026-07-24',amount:100,reason:'前回預かり'}];
 confirmBilling(s2,r2.id,'hori',590);assert.equal(billingAudit(s2,r2.id).issues.length,0);
});
test('通常の全額受取は過去不足・預かりを含む集金予定額を一度だけ記録する',()=>{
 const {s,r}=setup();r.products[0].price=1020;r.orders.hori.quantities={base:1};
 s.receivableItems.push({id:'old50',kind:'opening',buyerId:'hori',date:'2026-07-24',amount:50,reason:'不足',note:'前回分'});
 const annual=report(s,'2026-04-01','2027-03-31',2026);
 const receipt=receiveFullCollection(s,r.id,'hori');assert.equal(receipt.received,1070);assert.equal(collectionPosition(s,r.id,'hori').balance,0);
 assert.throws(()=>receiveFullCollection(s,r.id,'hori'),/履歴を確認/);assert.equal(s.collectionEntries.length,1);assert.deepEqual(report(s,'2026-04-01','2027-03-31',2026),annual);
 const {s:credit,r:round}=setup();round.products[0].price=690;round.orders.hori.quantities={base:1};credit.collectionCredits=[{id:'prior100',roundId:round.id,buyerId:'hori',date:'2026-07-24',amount:100,reason:'前回預かり'}];
 assert.equal(receiveFullCollection(credit,round.id,'hori').received,590);assert.equal(collectionPosition(credit,round.id,'hori').balance,0);
 const {s:past,r:later}=setup();later.orders={};past.receivableItems=[{id:'opening',kind:'opening',buyerId:'hori',date:'2026-07-24',amount:1670,reason:'未受取',note:'7月分'}];
 assert.equal(receiveFullCollection(past,later.id,'hori').received,1670);assert.equal(collectionPosition(past,later.id,'hori').balance,0);
});
test('請求を選ぶと金額と充当先を同時保存し、今回・過去を別々に回収できる',()=>{
 const {s,r}=setup();r.products[0].price=1650;r.orders.hori.quantities={base:1};
 s.receivableItems.push({id:'july',kind:'opening',buyerId:'hori',date:'2026-07-24',amount:1670,reason:'未受取',note:'7月'});
 const now=`round:${r.id}:hori`;
 const first=receiveDueItem(s,r.id,'hori',now);assert.equal(first.received,1650);assert.equal(first.itemId,now);
 assert.equal(collectionPosition(s,r.id,'hori').balance,1670);assert.throws(()=>receiveDueItem(s,r.id,'hori',now));
 const second=receiveDueItem(s,r.id,'hori','july');assert.equal(second.received,1670);assert.equal(collectionPosition(s,r.id,'hori').balance,0);
 const {s:past,r:empty}=setup();empty.orders={};past.receivableItems=[{id:'old',kind:'opening',buyerId:'hori',date:'2026-07-24',amount:50,reason:'未受取',note:'7月'}];
 assert.equal(receiveDueItem(past,empty.id,'hori','old').received,50);
});
test('単価未確定でも固定注文の2点は数量として残り、請求照合で止まる',()=>{
 const s=initialState(),r=newRound(s,'2026-09-11');s.rounds.push(r);
 const draft=orderDraft(s,r,s.buyers.find(x=>x.id==='hori'));
 assert.equal(draft.quantities.donut,2);
 r.orders.hori=draft;
 assert.equal(productTotals(r).find(x=>x.id==='donut')?.qty,2);
 assert.equal(unpricedOrderLines(r,draft).find(x=>x.productId==='donut')?.qty,2);
 assert.ok(billingAudit(s,r.id).issues.some(x=>x.type==='price'&&x.qty===2));
 assert.throws(()=>receiveFullCollection(s,r.id,'hori'));
 assert.equal(s.collectionEntries.length,0);
});
test('過去形式の受取記録に調整額がなくても一部未収と次回繰越を保持する',()=>{
 const {s,r}=setup();r.products[0].price=190;r.orders.hori.quantities={base:2};
 s.collectionEntries=[{id:'legacy',roundId:r.id,buyerId:'hori',date:r.date,received:190}];
 assert.equal(collectionPosition(s,r.id,'hori').balance,190);
 const later=newRound(s,'2026-10-16',r.test);s.rounds.push(later);
 assert.equal(collectionPosition(s,later.id,'hori').carry,190);
});
test('請求袋との差が既知・一部受取済み・要確認の場合は通常の全額受取にしない',()=>{
 const {s,r}=setup();confirmBilling(s,r.id,'hori',2130,{exceptionReason:'請求内容を照合中'});
 assert.throws(()=>receiveFullCollection(s,r.id,'hori'),/履歴を確認/);
 flagMissingCharge(s,r.id,'hori','order:donut',2);receiveCollection(s,{roundId:r.id,buyerId:'hori',received:2130,reason:'一部しか受け取っていない'});
 assert.throws(()=>receiveFullCollection(s,r.id,'hori'),/履歴を確認/);assert.equal(s.collectionEntries.length,1);
});
