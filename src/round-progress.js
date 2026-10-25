import {collectionDueItems, roundSettlementStatus, uid} from './domain.js';
import {billingAudit} from './collection-workflow.js';
import {snackBillingPreview} from './snack-billing.js';

// The work status is a view of saved facts. Never create a second receivable
// when a round is closed; the original invoice remains its source of truth.
const latestFor=(state,round)=>[...state.rounds]
  .filter(r=>r.id===round.id||r.date>=round.date&&(r.test===round.test||round.collectionLive))
  .sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).at(-1)||round;

export function currentRoundDue(state,round){
  const latest=latestFor(state,round),buyers=new Set([
    ...Object.keys(round.orders),
    ...(state.receivableItems||[]).filter(x=>x.roundId===round.id).map(x=>x.buyerId),
    ...(state.sales||[]).filter(x=>!x.void&&x.chargeRoundId===round.id&&x.buyerId).map(x=>x.buyerId),
  ]);
  const people=[];
  for(const buyerId of buyers){
    const items=collectionDueItems(state,latest.id,buyerId).items
      .filter(x=>x.roundId===round.id&&x.balance>0);
    const amount=items.reduce((n,x)=>n+x.balance,0);
    if(amount)people.push({buyerId,name:state.buyers.find(b=>b.id===buyerId)?.name||round.orders[buyerId]?.name||'購入者',amount,items});
  }
  return {people,total:people.reduce((n,x)=>n+x.amount,0)};
}

export function roundCompletionIssues(state,round){
  const issues=[];
  if(roundSettlementStatus(state,round)!=='精算済み'){
    if(!round.shortageConfirmation||round.shortageConfirmation==='yes'&&!round.shortageReviewComplete)
      issues.push({message:'欠品・納品を確認してください',stage:'納品・精算',target:'shortage'});
    if(round.invoice==null)issues.push({message:'納品書の税込合計を入力してください',stage:'納品・精算',target:'invoice'});
    if(round.invoice!=null)issues.push({message:'商品利益に必要な売上・原価を確認してください',stage:'納品・精算',target:'profit'});
    return issues;
  }
  const audit=billingAudit(state,round.id);
  for(const x of audit.issues)issues.push({message:`${x.name}：${x.message}`,stage:'集金',target:'buyer',buyerId:x.buyerId});
  if(audit.stocks.some(x=>x.unconfirmed>0))
    issues.push({message:'販売済み・購入者未確認の商品があります',stage:'納品・精算',target:'sales'});
  for(const id of round.eventIds||[]){
    const event=state.events.find(x=>x.id===id);
    if(event?.billing&&!snackBillingPreview(state,event).complete)
      issues.push({message:`${event.name}：おやつ・財政請求の対象数を確認してください`,stage:'納品・精算',target:'snack'});
  }
  if((state.collectionCases||[]).some(x=>x.roundId===round.id&&x.status==='pending'))
    issues.push({message:'要確認として保留した集金があります',stage:'集金',target:'cases'});
  const corrected=new Set((state.collectionCorrections||[]).filter(x=>x.kind==='collectionEntries').map(x=>x.targetId));
  const allocations=new Set((state.collectionAllocations||[]).filter(x=>!corrected.has(x.entryId)).map(x=>x.entryId));
  if((state.collectionEntries||[]).some(x=>x.roundId===round.id&&x.received>0&&!x.itemId&&!corrected.has(x.id)&&!allocations.has(x.id)&&collectionDueItems(state,round.id,x.buyerId).unallocated>0))
    issues.push({message:'受取済み現金の充当先を確認してください',stage:'集金',target:'cash'});
  return issues;
}

export function roundProgress(state,round){
  if(round.status==='入力中'||round.status==='注文確定')return {status:round.status,carry:false,issues:[],due:{people:[],total:0}};
  const settled=roundSettlementStatus(state,round)==='精算済み';
  if(!settled)return {status:'納品済み',carry:false,issues:roundCompletionIssues(state,round),due:{people:[],total:0}};
  const due=currentRoundDue(state,round),issues=roundCompletionIssues(state,round);
  const previouslyClosed=round.collectionClose;
  const increased=previouslyClosed&&due.people.some(p=>p.items.some(item=>item.balance>(previouslyClosed.balances?.[item.id]||0)));
  const complete=!issues.length&&(due.total===0||previouslyClosed&&!increased);
  return {status:complete?'完了':'集金中',carry:!!(complete&&previouslyClosed&&due.total>0),issues,due,increased:!!increased};
}

export function closeRoundWithCarry(state,roundId){
  const round=state.rounds.find(r=>r.id===roundId);
  if(!round)throw Error('注文回が見つかりません');
  if(round.collectionClose)throw Error('この注文回の集金終了は記録済みです');
  const progress=roundProgress(state,round);
  if(progress.status!=='集金中'||progress.issues.length||progress.due.total<=0)
    throw Error(progress.issues[0]?.message||'今回分の未収と集金状態を確認してください');
  const balances=Object.fromEntries(progress.due.people.flatMap(p=>p.items.map(item=>[item.id,item.balance])));
  round.collectionClose={id:uid(),at:new Date().toISOString(),balances};
  return round.collectionClose;
}
