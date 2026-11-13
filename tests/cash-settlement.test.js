import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,validate,collectionPosition,collectionDueItems,report} from '../src/domain.js';
import {receiveDueItem,receiveCollection} from '../src/collection-workflow.js';
import {saveOtherSale} from '../src/other-sales.js';
import {externalCashPosition,recordExternalCash,correctExternalCash,provisionalSupplierDue,supplierPosition,supplierCashEstimate,saveSupplierPlan,recordSupplierPayment,correctSupplierPayment} from '../src/cash-settlement.js';

function fixture(){
 const s=initialState(),old=newRound(s,'2026-10-16',true),now=newRound(s,'2026-10-30',true);
 s.rounds.push(old,now);
 for(const r of [old,now]){r.orders.hori={name:'堀',quantities:{brown:1}};r.invoice=200;r.status='納品済み';}
 saveOtherSale(s,{name:'その他商品',date:now.date,test:true,qty:2,unitPrice:200,unitCost:50,paymentStatus:'paid',place:'園外'});
 return {s,old,now};
}
test('過去の仕入先支払済みを日付・金額の捏造なしで保持し、次回は未振込',()=>{
 const {s,old,now}=fixture();
 assert.equal(supplierPosition(s,old).complete,true);
 assert.equal(supplierPosition(s,old).paid,0);
 assert.equal(supplierPosition(s,old).payments.length,0);
 assert.equal(supplierPosition(s,now).complete,false);
 assert.equal(provisionalSupplierDue(now.date),'2026-11-30');
 assert.equal(supplierPosition(JSON.parse(JSON.stringify(s)),old).complete,true);
});
test('外部売上と係への一部引渡しは別履歴。訂正後再受取しても売上・個人未収は不変',()=>{
 const {s,now}=fixture(),before=collectionPosition(s,now.id,'hori').balance;
 const prior=report(s,'2026-04-01','2027-03-31',2026,{includeTest:true}).revenue;
 assert.equal(externalCashPosition(s,now).sales,400);
 const a=recordExternalCash(s,now.id,150,'販売担当','2026-11-13','cash-1');
 assert.throws(()=>recordExternalCash(s,now.id,150,'販売担当','2026-11-13','cash-1'),/登録済み/);
 assert.equal(externalCashPosition(s,now).remaining,250);
 correctExternalCash(s,a.id,'記入金額誤り');
 assert.equal(externalCashPosition(s,now).remaining,400);
 recordExternalCash(s,now.id,400,'訂正して受渡し','2026-11-13','cash-2');
 assert.equal(externalCashPosition(JSON.parse(JSON.stringify(s)),now).remaining,0);
 assert.equal(collectionPosition(s,now.id,'hori').balance,before);
 assert.equal(report(s,'2026-04-01','2027-03-31',2026,{includeTest:true}).revenue,prior);
 validate(s);
});
test('仕入先予定の訂正履歴と一部振込・取消を保ち、現金受取へ触れない',()=>{
 const {s,old,now}=fixture();
 const before=collectionPosition(s,now.id,'hori').balance;
 saveSupplierPlan(s,now.id,{amount:350,dueDate:'2026-11-30'},'納品書を確認');
 saveSupplierPlan(s,now.id,{amount:400,dueDate:'2026-12-05'},'仕入先に確認');
 assert.equal(supplierPosition(s,now).plan.history.length,1);
 const a=recordSupplierPayment(s,now.id,150,'2026-11-13','銀行振込','transfer-1');
 assert.throws(()=>recordSupplierPayment(s,now.id,150,'2026-11-13','銀行振込','transfer-1'),/登録済み/);
 assert.equal(supplierPosition(s,now).remaining,250);
 correctSupplierPayment(s,a.id,'振込額誤記');
 assert.equal(supplierPosition(s,now).paid,0);
 recordSupplierPayment(s,now.id,400,'2026-11-14','訂正済み振込','transfer-2');
 assert.equal(supplierPosition(JSON.parse(JSON.stringify(s)),now).complete,true);
 assert.equal(supplierPosition(s,old).complete,true);
 assert.equal(collectionPosition(s,now.id,'hori').balance,before);
 assert.equal(s.collectionEntries.length,0);
 validate(s);
});
test('他回の未収受取と外部販売引渡しを区別し、充当先不明・預かりがあれば振込可能と断定しない',()=>{
 const {s,old,now}=fixture();
 saveSupplierPlan(s,now.id,{amount:300,dueDate:'2026-11-30'},'納品書');
 receiveDueItem(s,now.id,'hori',`round:${old.id}:hori`);
 assert.equal(supplierCashEstimate(s,now).known,0);
 assert.equal(collectionDueItems(s,old.id,'hori').items.find(i=>i.roundId===old.id).balance,0);
 recordExternalCash(s,now.id,300,'販売担当','2026-11-13');
 assert.equal(supplierCashEstimate(s,now).ready,true);
 s.collectionCredits=[{id:'held',roundId:now.id,buyerId:'hori',date:'2026-10-01',amount:100,reason:'前回の預かり金'}];
 assert.equal(supplierCashEstimate(s,now).ready,false);
 assert.equal(supplierCashEstimate(s,now).uncertain,true);
 assert.equal(supplierPosition(s,old).complete,true);
});
test('過払いの預かりから実際の受取を再登録せず返金できる',()=>{
 const {s,old}=fixture();old.orders.hori.quantities={};old.collectionLive=true;
 s.receivableItems.push({id:'bill',kind:'opening',buyerId:'hori',date:'2026-10-01',amount:100,reason:'請求',note:'過去分'});
 receiveCollection(s,{roundId:old.id,buyerId:'hori',received:1150,reason:'多く受け取ったので次回へ預かる'});
 assert.equal(collectionPosition(s,old.id,'hori').availableCredit,1050);
 receiveCollection(s,{roundId:old.id,buyerId:'hori',received:-1050,reason:'返金がある'});
 assert.equal(collectionPosition(s,old.id,'hori').availableCredit,0);
 assert.equal(s.collectionEntries.filter(x=>x.received>0).length,1);
});
