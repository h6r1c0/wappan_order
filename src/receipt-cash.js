import {collectionDueItems,effectiveCollectionState,uid,integer,today} from './domain.js';
import {equalValue} from './structural-equality.js';
const sum=xs=>xs.reduce((n,x)=>n+x,0);
export function collectionCashLedger(state,roundId,buyerId){
 const target=state.rounds.find(r=>r.id===roundId);
 if(!target)throw Error('注文回を確認してください');
 const rounds=state.rounds.filter(r=>r.test===target.test||r.collectionLive).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const ids=new Set(rounds.map(r=>r.id)),active=effectiveCollectionState(state).collectionEntries.filter(x=>x.buyerId===buyerId&&ids.has(x.roundId));
 const latest=rounds.at(-1),due=collectionDueItems(state,latest.id,buyerId);
 const refunds=active.filter(x=>x.received<0),unlinkedRefund=refunds.some(x=>!x.sourceReceiptId);
 const receipts=active.filter(x=>x.received>0).map(entry=>{
  const allocation=(state.collectionAllocations||[]).find(a=>a.entryId===entry.id);
  const parts=due.appliedByReceipt?.[entry.id]||[];
  const allocated=sum(parts.map(p=>p.amount));
  const refunded=sum(refunds.filter(x=>x.sourceReceiptId===entry.id).map(x=>-x.received));
  const remaining=Math.max(0,entry.received-allocated-refunded);
  return {entry,allocation,parts,allocated,refunded,remaining,refundPending:allocation?.heldPurpose==='refund-pending'?remaining:0};
 });
 return {receipts,received:sum(receipts.map(x=>x.entry.received)),allocated:sum(receipts.map(x=>x.allocated)),
  refunded:sum(refunds.map(x=>-x.received)),refundPending:sum(receipts.map(x=>x.refundPending)),
  remaining:Math.max(0,sum(receipts.map(x=>x.remaining))-sum(refunds.filter(x=>!x.sourceReceiptId).map(x=>-x.received))),
  availableForAllocation:sum(receipts.filter(x=>x.allocation?.heldPurpose!=='refund-pending').map(x=>x.remaining)),
  unlinkedRefund,claims:due.items.filter(x=>x.balance>0),latestRoundId:latest.id};
}
export function allocateReceivedCash(state,entryId,parts,{heldPurpose='refund-pending',reason='受取済み現金の充当先と残額を確認',requestId}={}){
 const entry=effectiveCollectionState(state).collectionEntries.find(e=>e.id===entryId&&e.received>0);
 if(!entry)throw Error('有効な受取済み現金を選んでください');
 const old=(state.collectionAllocations||[]).find(a=>a.entryId===entryId);
 if(requestId&&old?.requestId===requestId){if(!equalValue(old.parts,parts)||old.heldPurpose!==heldPurpose)throw Error('同じ操作番号の内容が変わっています');return old;}
 if(!Array.isArray(parts)||new Set(parts.map(p=>p.itemId)).size!==parts.length||!['credit','refund-pending'].includes(heldPurpose)||!reason.trim())throw Error('充当先・残額の扱い・理由を確認してください');
 const total=sum(parts.map(p=>p.amount)),held=entry.received-total;
 if(held<0||parts.some(p=>!Number.isSafeInteger(p.amount)||p.amount<=0))throw Error('充当額は受取総額以下にしてください');
 const ledger=collectionCashLedger(state,entry.roundId,entry.buyerId);
 if(ledger.unlinkedRefund)throw Error('元の受取先が未確認の返金履歴を先に確認してください');
 const actualRefund=ledger.receipts.find(x=>x.entry.id===entryId)?.refunded||0;
 if(held<actualRefund)throw Error('すでに実際に返した金額を請求へ再利用できません');
 const probe={...state,collectionEntries:state.collectionEntries.filter(e=>e.id!==entryId&&e.sourceReceiptId!==entryId),collectionAllocations:(state.collectionAllocations||[]).filter(a=>a.entryId!==entryId)};
 const available=collectionDueItems(probe,ledger.latestRoundId,entry.buyerId).items;
 for(const part of parts){const item=available.find(x=>x.id===part.itemId);if(!item||part.amount>item.balance)throw Error('請求の残額を超える充当はできません');}
 const updated={id:old?.id||uid(),entryId,roundId:entry.roundId,buyerId:entry.buyerId,parts:parts.map(p=>({...p})),held,heldPurpose,reason,at:new Date().toISOString(),requestId:requestId||uid()};
 if(old){
  if(equalValue(old.parts,updated.parts)&&old.held===held&&old.heldPurpose===heldPurpose)return old;
  updated.history=[...(old.history||[]),{...old,history:undefined}];Object.assign(old,updated);return old;
 }
 (state.collectionAllocations??=[]).push(updated);return updated;
}
export function refundReceivedCash(state,entryId,{amount,date=today(),requestId=uid(),note='実際に返金した'}={}){
 integer(amount,'実際に返した金額');
 const entry=effectiveCollectionState(state).collectionEntries.find(e=>e.id===entryId&&e.received>0);
 if(!entry||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('返金元・実際の返金日と金額を確認してください');
 const prior=state.collectionEntries.find(e=>e.requestId===requestId);if(prior){if(prior.sourceReceiptId!==entryId||prior.received!==-amount||prior.date!==date)throw Error('同じ操作番号の内容が変わっています');return prior;}
 const ledger=collectionCashLedger(state,entry.roundId,entry.buyerId),cash=ledger.receipts.find(x=>x.entry.id===entryId);
 if(ledger.unlinkedRefund||!cash||amount>cash.remaining)throw Error('返金できる未充当の現金を超えています');
 const refund={id:uid(),roundId:entry.roundId,buyerId:entry.buyerId,received:-amount,adjustment:0,reason:'返金がある',note,date,sourceReceiptId:entryId,requestId,at:new Date().toISOString()};
 state.collectionEntries.push(refund);return refund;
}
