import {externalSalesSummary} from './external-sales-summary.js';

const legacyPaidThrough='2026-10-16'; // Confirmed by the operator, date and amount unknown.
const amount=n=>Number.isSafeInteger(n)&&n>0&&n<=100000000;
const date=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d));
const unique=(list,key)=>new Set(list.map(key)).size===list.length;
const id=()=>crypto.randomUUID();

export function provisionalSupplierDue(deliveryDate){
 const [year,month]=deliveryDate.split('-').map(Number);
 return new Date(Date.UTC(year,month+1,0)).toISOString().slice(0,10);
}
export function externalCashPosition(state,round){
 const sales=externalSalesSummary(state,round).total;
 const voids=new Set((state.externalCashCorrections||[]).map(x=>x.targetId));
 const entries=(state.externalCashReceipts||[]).filter(x=>x.roundId===round.id&&!voids.has(x.id));
 const received=entries.reduce((n,x)=>n+x.amount,0);
 return {sales,received,remaining:Math.max(0,sales-received),excess:Math.max(0,received-sales),entries};
}
export function recordExternalCash(state,roundId,value,note,receivedDate,requestId=id()){
 if(!state.rounds.some(r=>r.id===roundId)||!amount(value)||!date(receivedDate)||!String(note||'').trim())throw Error('外部販売の受取額・受取日・受渡者を確認してください');
 if((state.externalCashReceipts||[]).some(x=>x.requestId===requestId))throw Error('この受渡しは登録済みです');
 const round=state.rounds.find(r=>r.id===roundId),position=externalCashPosition(state,round);
 if(value>position.remaining)throw Error(`回収予定の残り ${position.remaining}円を超えています。販売記録を確認してください`);
 const entry={id:id(),requestId,roundId,date:receivedDate,amount:value,note:String(note).trim(),at:new Date().toISOString()};
 (state.externalCashReceipts??=[]).push(entry);return entry;
}
export function correctExternalCash(state,targetId,reason){
 const entry=(state.externalCashReceipts||[]).find(x=>x.id===targetId);
 if(!entry||!String(reason||'').trim()||(state.externalCashCorrections||[]).some(x=>x.targetId===targetId))throw Error('訂正する現金受渡しと理由を確認してください');
 (state.externalCashCorrections??=[]).push({id:id(),targetId,reason:String(reason).trim(),at:new Date().toISOString()});
}
export function supplierPosition(state,round){
 const plan=(state.supplierPlans||[]).find(x=>x.roundId===round.id);
 const voids=new Set((state.supplierPaymentCorrections||[]).map(x=>x.targetId));
 const payments=(state.supplierPayments||[]).filter(x=>x.roundId===round.id&&!voids.has(x.id));
 const paid=payments.reduce((n,x)=>n+x.amount,0),legacy=round.date<=legacyPaidThrough;
 const planned=plan?.amount??null,dueDate=plan?.dueDate||provisionalSupplierDue(round.date);
 const complete=legacy||planned!=null&&paid>=planned;
 return {plan,planned,reference:round.invoice??null,dueDate,provisional:!plan?.dueDate,
   legacy,paid,payments,complete,remaining:planned==null?null:Math.max(0,planned-paid)};
}
export function saveSupplierPlan(state,roundId,{amount:planned,dueDate},reason){
 if(!state.rounds.some(r=>r.id===roundId)||!amount(planned)||!date(dueDate)||!String(reason||'').trim())throw Error('支払予定額・期限・訂正理由を確認してください');
 const list=state.supplierPlans??=[];let plan=list.find(x=>x.roundId===roundId);
 if(plan){if(plan.amount===planned&&plan.dueDate===dueDate)throw Error('支払予定に変更がありません');
  (plan.history??=[]).push({amount:plan.amount,dueDate:plan.dueDate,reason,at:new Date().toISOString()});
  plan.amount=planned;plan.dueDate=dueDate;
 }else{plan={id:id(),roundId,amount:planned,dueDate,history:[],reason,at:new Date().toISOString()};list.push(plan);}
 return plan;
}
export function recordSupplierPayment(state,roundId,value,paidDate,note,requestId=id()){
 if(!state.rounds.some(r=>r.id===roundId)||!amount(value)||!date(paidDate)||!String(note||'').trim())throw Error('実際の振込額・日付・内容を確認してください');
 if((state.supplierPayments||[]).some(x=>x.requestId===requestId))throw Error('この振込は登録済みです');
 const entry={id:id(),requestId,roundId,date:paidDate,amount:value,note:String(note).trim(),at:new Date().toISOString()};
 (state.supplierPayments??=[]).push(entry);return entry;
}
export function correctSupplierPayment(state,targetId,reason){
 const entry=(state.supplierPayments||[]).find(x=>x.id===targetId);
 if(!entry||!String(reason||'').trim()||(state.supplierPaymentCorrections||[]).some(x=>x.targetId===targetId))throw Error('訂正する振込と理由を確認してください');
 (state.supplierPaymentCorrections??=[]).push({id:id(),targetId,reason:String(reason).trim(),at:new Date().toISOString()});
}
// Only cash explicitly attached to this round's invoices can support a
// conservative estimate. Ambiguous receipts, refunds and held money must not
// produce a false "ready to transfer" signal.
export function supplierCashEstimate(state,round){
 const position=supplierPosition(state,round);
 const voids=new Set((state.collectionCorrections||[]).filter(x=>x.kind==='collectionEntries').map(x=>x.targetId));
 const receipts=(state.collectionEntries||[]).filter(x=>!voids.has(x.id)&&x.received>0);
 const allocations=new Map((state.collectionAllocations||[]).map(x=>[x.entryId,x.parts]));
 let assigned=0,uncertain=false;
 for(const entry of receipts){
  const parts=allocations.get(entry.id)||(entry.itemId?[{itemId:entry.itemId,amount:entry.received}]:null);
  if(!parts){if(entry.roundId===round.id)uncertain=true;continue;}
  for(const part of parts)if(part.itemId===`round:${round.id}:${entry.buyerId}`||
    (state.receivableItems||[]).some(i=>i.id===part.itemId&&i.roundId===round.id))assigned+=part.amount;
 }
 const external=externalCashPosition(state,round);
 const refunds=(state.collectionEntries||[]).some(x=>!voids.has(x.id)&&x.received<0);
 const held=(state.collectionCredits||[]).some(x=>!x.appliedTo)||receipts.some(x=>x.reason==='多く受け取ったので次回へ預かる');
 const known=assigned+external.received-position.paid;
 return {known:Math.max(0,known),uncertain:uncertain||refunds||held||external.excess>0,
   ready:!position.complete&&position.remaining!=null&&!uncertain&&!refunds&&!held&&external.excess===0&&known>=position.remaining};
}
export function validateCashSettlement(state){
 const keys=['externalCashReceipts','externalCashCorrections','supplierPlans','supplierPayments','supplierPaymentCorrections'];
 for(const key of keys)if(state[key]!=null&&(!Array.isArray(state[key])||!unique(state[key],x=>x.id)))throw Error('現金・振込履歴が不正です');
 const rounds=new Set(state.rounds.map(x=>x.id));
 for(const x of state.externalCashReceipts||[])if(!rounds.has(x.roundId)||!date(x.date)||!amount(x.amount)||!x.note||!x.requestId)throw Error('外部販売の現金受渡し記録が不正です');
 for(const x of state.supplierPlans||[])if(!rounds.has(x.roundId)||!date(x.dueDate)||!amount(x.amount)||!Array.isArray(x.history))throw Error('仕入先への支払予定が不正です');
 if(!unique(state.supplierPlans||[],x=>x.roundId))throw Error('同じ注文回の支払予定が重複しています');
 for(const x of state.supplierPayments||[])if(!rounds.has(x.roundId)||!date(x.date)||!amount(x.amount)||!x.note||!x.requestId)throw Error('仕入先への振込履歴が不正です');
 for(const [key,source] of [['externalCashCorrections','externalCashReceipts'],['supplierPaymentCorrections','supplierPayments']]){
  if(!unique(state[key]||[],x=>x.targetId))throw Error('同じ現金記録を二重に取り消せません');
  for(const x of state[key]||[])if(!state[source]?.some(e=>e.id===x.targetId)||!x.reason)throw Error('現金・振込の訂正履歴が不正です');
 }
 for(const source of ['externalCashReceipts','supplierPayments'])if(!unique(state[source]||[],x=>x.requestId))throw Error('同じ現金記録が重複しています');
 for(const r of state.rounds)if(externalCashPosition(state,r).excess>0)throw Error('外部販売の現金回収が登録売上を超えています');
}
