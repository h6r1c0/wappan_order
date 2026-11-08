// Other goods are recorded once. Buyer assignments attribute the same revenue
// to a collection round; they do not create another sale or a second receipt.
const checked=(v,label,min=0)=>{
  if(!Number.isSafeInteger(v)||v<min||v>100000000)throw Error(`${label}を確認してください`);
  return v;
};
export function saveOtherSale(state,entry,{id=null,reason=''}={}){
  const name=String(entry.name||'').trim(),date=String(entry.date||'');
  if(!name||!/^\d{4}-\d{2}-\d{2}$/.test(date)||(Number.isNaN(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date))throw Error('商品名と販売日を確認してください');
  checked(entry.qty,'販売数量',1);checked(entry.unitPrice,'販売単価');checked(entry.unitCost,'原価');
  if(!['paid','unpaid'].includes(entry.paymentStatus))throw Error('現金受取状況を選んでください');
  state.otherSales??=[];
  const old=id?state.otherSales.find(x=>x.id===id):null;
  if(id&&(!old||old.void))throw Error('変更する販売記録が見つかりません');
  if(old&&!String(reason).trim())throw Error('訂正理由を入力してください');
  const next={name,date,qty:entry.qty,unitPrice:entry.unitPrice,unitCost:entry.unitCost,
    paymentStatus:entry.paymentStatus,note:String(entry.note||'').trim(),test:old?.test??Boolean(entry.test),
    origin:['wappan','non-wappan'].includes(entry.origin)?entry.origin:old?.origin||'unknown'};
  if(old?.allocations?.length && (next.date!==old.date||next.paymentStatus!=='unpaid'||
    next.qty<old.allocations.reduce((n,x)=>n+x.qty,0)+(old.paidExternalQty||0)))
    throw Error('個人請求への割当を先に訂正してください');
  if(old && next.qty<(old.paidExternalQty||0))throw Error('支払い済み・外部販売の数量を先に訂正してください');
  if(old){
    old.history??=[];
    old.history.push({at:new Date().toISOString(),reason,previous:{name:old.name,date:old.date,qty:old.qty,
      unitPrice:old.unitPrice,unitCost:old.unitCost,paymentStatus:old.paymentStatus,note:old.note,paidExternalQty:old.paidExternalQty||0,origin:old.origin||'unknown'}});
    Object.assign(old,next);return old;
  }
  const sale={id:crypto.randomUUID(),...next,void:false,history:[]};
  state.otherSales.push(sale);return sale;
}
export function voidOtherSale(state,id,reason){
  const sale=(state.otherSales||[]).find(x=>x.id===id&&!x.void);
  if(!sale||!String(reason||'').trim())throw Error('取消対象と理由を確認してください');
  if(sale.allocations?.length||sale.paidExternalQty)throw Error('個人請求・外部販売の割当を先に訂正してください');
  sale.history.push({at:new Date().toISOString(),reason,previous:{...sale,history:undefined}});
  sale.void=true;
}
export function replaceOtherAllocations(state,id,assignments,reason='購入者への割当を登録'){
  const sale=(state.otherSales||[]).find(x=>x.id===id&&!x.void);
  if(!sale||sale.paymentStatus!=='unpaid'||!Array.isArray(assignments)||!String(reason||'').trim())
    throw Error('未受取の販売実績と割当理由を確認してください');
  const round=state.rounds.find(r=>r.date===sale.date&&r.test===sale.test);
  if(!round)throw Error('販売日と同じ納品回を確認してください');
  const rows=assignments.filter(x=>x.qty>0).map(x=>({buyerId:x.buyerId,qty:x.qty,chargeRoundId:round.id}));
  if(new Set(rows.map(x=>x.buyerId)).size!==rows.length||rows.some(x=>!state.buyers.some(b=>b.id===x.buyerId)||
    !Number.isSafeInteger(x.qty)||x.qty<1)||rows.reduce((n,x)=>n+x.qty,0)+(sale.paidExternalQty||0)>sale.qty)
    throw Error('購入者・数量を確認してください。販売済み数を超える割当はできません');
  if(JSON.stringify(rows)===JSON.stringify(sale.allocations||[]))return sale;
  const previous=sale.allocations||[];
  if(previous.some(x=>rows.find(y=>y.buyerId===x.buyerId)?.qty!==x.qty) &&
    (!String(reason||'').trim()||reason==='購入者への割当を登録'||reason==='購入者へ割当'))
    throw Error('保存済みの割当を変更・取消する理由を入力してください');
  sale.history.push({at:new Date().toISOString(),reason,previousAllocations:structuredClone(sale.allocations||[])});
  sale.allocations=rows;
  return sale;
}

export function replaceOtherDistribution(state,id,assignments,paidExternalQty,reason='販売先への割当を登録'){
  const sale=(state.otherSales||[]).find(x=>x.id===id&&!x.void);
  if(!sale||sale.paymentStatus!=='unpaid')throw Error('対象のその他商品を確認してください');
  checked(paidExternalQty,'支払い済み・外部販売数');
  const previous=sale.paidExternalQty||0;
  if(previous!==paidExternalQty){
    if(previous>0&&!String(reason).trim())throw Error('外部販売の訂正理由を入力してください');
    sale.history.push({at:new Date().toISOString(),reason,previousPaidExternalQty:previous,paidExternalQty});
    sale.paidExternalQty=paidExternalQty;
  }
  // Validate the combined number, including unchanged buyer allocations.
  return replaceOtherAllocations(state,id,assignments,reason);
}

export function otherAllocationNeedsReason(sale,rows){
  return (sale.allocations||[]).some(x=>rows.find(y=>y.buyerId===x.buyerId)?.qty!==x.qty);
}
