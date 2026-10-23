import {collections,collectionPosition,collectionDueItems,price,snapshot,integer,uid,today,stockAllocation} from './domain.js';
import {deliveredQuantity} from './shortages.js';

export const collectionReasons=['前回の不足分をまとめて受け取った','前回の預かり金を今回使った','今回の請求から商品が漏れている','一部しか受け取っていない','多く受け取ったので次回へ預かる','返金がある','原因が分からないので調べたい'];
export const correctionReasons=['支払済みの確認が誤っていた','受取金額を間違えた','重複して登録した','対象の人・注文回を間違えた'];
export function effective(state,kind){
  const voids=new Set((state.collectionCorrections||[]).filter(x=>x.kind===kind).map(x=>x.targetId));
  return (state[kind]||[]).filter(x=>!voids.has(x.id));
}
export function chargeLines(state,roundId,buyerId){
  const r=state.rounds.find(x=>x.id===roundId),o=r.orders[buyerId];
  const lines=Object.entries(o?.quantities||{}).filter(([,q])=>q>0).map(([id,ordered])=>{
    const p=r.products.find(x=>x.id===id),master=state.products.find(x=>x.id===id);
    const qty=deliveredQuantity(o,id),unitPrice=p?.price??null;
    const amount=unitPrice==null?null:unitPrice*qty+(p.cutFee||0)*Math.min(o.cutQuantities?.[id]||0,qty);
    return {key:`order:${id}`,source:'order',sourceId:id,productId:id,name:p?.name||master?.name||'注文表で確認が必要な商品',category:p?.category||'',ordered,qty,cancelled:ordered-qty,unitPrice,amount,
      candidate:master?price(master):null,candidateName:master?.name,missingProduct:!p};
  });
  for(const sale of state.sales.filter(x=>!x.void&&x.destinationType==='buyer'&&x.buyerId===buyerId&&x.chargeRoundId===roundId)){
    const st=state.stocks.find(x=>x.id===sale.stockId);
    lines.push({key:`sale:${sale.id}`,source:'sale',sourceId:sale.id,productId:st?.productId,name:st?.name||'販売用商品',category:st?.category,ordered:sale.qty,qty:sale.qty,cancelled:0,unitPrice:sale.price,amount:sale.price==null?null:sale.qty*sale.price});
  }
  return lines;
}
export function billingAudit(state,roundId){
  const r=state.rounds.find(x=>x.id===roundId),rows=collections(state,'','',roundId,r.test);
  const ids=new Set([...Object.keys(r.orders),...rows.map(x=>x.id)]);
  const buyers=[...ids].map(buyerId=>{
    const lines=chargeLines(state,roundId,buyerId),row=rows.find(x=>x.id===buyerId),expected=row?.total||0;
    const review=(state.billingReviews||[]).find(x=>x.roundId===roundId&&x.buyerId===buyerId);
    const additions=(state.receivableItems||[]).filter(x=>x.kind==='additional'&&x.roundId===roundId&&x.buyerId===buyerId);
    const knownBag=review?.bagAmount??additions.find(x=>x.notifiedAmount!=null)?.notifiedAmount??null;
    const issues=[];
    for(const line of lines){
      if(line.missingProduct)issues.push({type:'missing-product',key:line.key,productId:line.productId,qty:line.qty,message:`${line.name} ${line.qty}個が今回の商品一覧にありません`});
      else if(line.qty>0&&line.unitPrice==null)issues.push({type:'price',key:line.key,productId:line.productId,qty:line.qty,message:`${line.name} ${line.qty}個の請求単価が未確定です`});
      if(line.qty>line.ordered||line.qty<0)issues.push({type:'quantity',key:line.key,message:`${line.name}の注文数と受取確定数を確認してください`});
    }
    if(knownBag!=null&&knownBag!==expected)issues.push({type:'bag',message:`案内済み ${knownBag.toLocaleString()}円と現在の請求 ${expected.toLocaleString()}円に差があります`,difference:expected-knownBag});
    if(review)for(const l of lines){const prior=review.lines.find(x=>x.key===l.key);if(prior&&prior.qty!==l.qty)issues.push({type:'review-quantity',key:l.key,productId:l.productId,qty:l.qty,message:`${l.name}：受取確定 ${l.qty}個に対し、確認した請求対象 ${prior.qty}個です`});}
    if(review?.status==='pending')issues.push({type:'pending',message:`請求は未確定です：${review.exceptionReason}`});
    if(review&&JSON.stringify(review.lines)!==JSON.stringify(lines.map(({key,qty,unitPrice,amount})=>({key,qty,unitPrice,amount}))))issues.push({type:'changed',message:'請求確認後に商品・数量・単価が変わっています'});
    return {buyerId,name:state.buyers.find(x=>x.id===buyerId)?.name||r.orders[buyerId]?.name,lines,expected,knownBag,review,issues,complete:!issues.length};
  });
  const stocks=state.stocks.filter(x=>x.roundId===roundId).map(stock=>({stock,...stockAllocation(state,stock)}));
  return {buyers,issues:buyers.flatMap(b=>b.issues.map(x=>({...x,buyerId:b.buyerId,name:b.name}))),stocks};
}
export function confirmBilling(state,roundId,buyerId,bagAmount,{exceptionReason=''}={}){
  integer(bagAmount,'集金袋の金額');
  const audit=billingAudit(state,roundId).buyers.find(x=>x.buyerId===buyerId);
  if(!audit)throw Error('請求が見つかりません');
  const unresolved=audit.lines.some(l=>l.qty>0&&(l.unitPrice==null||l.missingProduct));
  if((unresolved||bagAmount!==audit.expected)&&!exceptionReason)throw Error('未確定の理由を選び、照合してください');
  state.billingReviews??=[];
  const old=state.billingReviews.find(x=>x.roundId===roundId&&x.buyerId===buyerId);
  const review={id:old?.id||uid(),roundId,buyerId,bagAmount,total:audit.expected,status:unresolved||bagAmount!==audit.expected?'pending':'confirmed',exceptionReason,at:new Date().toISOString(),
    lines:audit.lines.map(({key,qty,unitPrice,amount})=>({key,qty,unitPrice,amount})),history:old?[...(old.history||[]),{...old,history:undefined}]:[]};
  if(old)Object.assign(old,review);else state.billingReviews.push(review);
  return review;
}
export function confirmLinePrice(state,roundId,productId,value){
  integer(value,'確認した請求単価');
  const r=state.rounds.find(x=>x.id===roundId);let p=r.products.find(x=>x.id===productId);
  if(!p){const master=state.products.find(x=>x.id===productId);if(!master)throw Error('今回の商品を確認してください');p=snapshot(master);r.products.push(p);}
  r.priceCorrections??=[];r.priceCorrections.push({id:uid(),productId,before:p.price??null,after:value,at:new Date().toISOString(),reason:'請求前の単価照合'});p.price=value;
}
export function flagMissingCharge(state,roundId,buyerId,key,qty,unitPrice){
  const r=state.rounds.find(x=>x.id===roundId);
  let line=chargeLines(state,roundId,buyerId).find(x=>x.key===key);
  if(!line)throw Error('注文・追加購入の商品を選んでください');
  integer(qty,'請求漏れ数量');if(qty<1||qty>line.qty)throw Error('請求漏れ数量は受取確定数量以下にしてください');
  if(line.unitPrice==null){if(line.source!=='order')throw Error('販売履歴の単価を確認してください');confirmLinePrice(state,roundId,line.productId,unitPrice);line=chargeLines(state,roundId,buyerId).find(x=>x.key===key);}
  const amount=qty*line.unitPrice;
  state.receivableItems??=[];
  const old=state.receivableItems.find(x=>x.kind==='additional'&&x.roundId===roundId&&x.buyerId===buyerId&&
    (x.sourceKey===key||!x.sourceKey&&x.reason==='商品請求漏れ'&&x.amount===amount&&String(x.note).replace(/\s/g,'').includes(line.name.replace(/\s/g,''))));
  if(!old&&state.receivableItems.some(x=>x.kind==='additional'&&x.roundId===roundId&&x.buyerId===buyerId&&!x.sourceKey&&x.amount===amount))throw Error('同額の追加請求が登録済みです。履歴の商品を確認してください');
  if(old){if(old.amount!==amount)throw Error('この商品の請求漏れは登録済みです。既存履歴を確認してください');return old;}
  const audit=billingAudit(state,roundId).buyers.find(x=>x.buyerId===buyerId);
  const total=collections(state,'','',roundId,r.test).find(x=>x.id===buyerId)?.total||0;
  const prior=state.receivableItems.filter(x=>x.kind==='additional'&&x.roundId===roundId&&x.buyerId===buyerId).reduce((n,x)=>n+x.amount,0);
  if(prior+amount>total)throw Error('同じ請求を重複登録できません');
  const item={id:uid(),kind:'additional',roundId,buyerId,date:r.date,amount,reason:'商品請求漏れ',note:`${line.name} ×${qty} 請求漏れ`,sourceKey:key,qty,unitPrice:line.unitPrice,notifiedAmount:audit.knownBag??total-amount};
  state.receivableItems.push(item);return item;
}
export function saveCollectionCase(state,entry){
  integer(entry.received,'実際受取額',true);
  const old=(state.collectionCases||[]).find(x=>x.roundId===entry.roundId&&x.buyerId===entry.buyerId&&x.status==='pending');
  state.collectionCases??=[];
  const item={id:old?.id||uid(),...entry,status:'pending',at:new Date().toISOString()};
  if(old)Object.assign(old,item);else state.collectionCases.push(item);return item;
}
export function correctCollectionRecord(state,kind,id,reason){
  if(!['collectionEntries','collectionReconciliations'].includes(kind)||!correctionReasons.includes(reason))throw Error('訂正理由を選んでください');
  const item=state[kind]?.find(x=>x.id===id);if(!item)throw Error('対象の記録が見つかりません');
  state.collectionCorrections??=[];
  if(state.collectionCorrections.some(x=>x.kind===kind&&x.targetId===id))throw Error('この記録は訂正済みです');
  state.collectionCorrections.push({id:uid(),kind,targetId:id,roundId:item.roundId,buyerId:item.buyerId,reason,at:new Date().toISOString()});
}
export function receiveCollection(state,{roundId,buyerId,received,reason='',pastAmount=0,pastDate,requestId,caseId,itemId}){
  integer(received,'実際受取額',true);if(!received)throw Error('受取額を入力してください');
  if(requestId&&(state.collectionEntries||[]).some(x=>x.requestId===requestId))throw Error('この受取は保存済みです');
  const before=collectionPosition(state,roundId,buyerId),r=state.rounds.find(x=>x.id===roundId);
  if(received!==before.balance&&!collectionReasons.includes(reason))throw Error('差額の理由を選んでください');
  if(reason==='原因が分からないので調べたい')throw Error('原因を確認するか、要確認として保存してください');
  if(received<0&&reason!=='返金がある')throw Error('返金の理由を選んでください');
  if(pastAmount){
    integer(pastAmount,'前回分');if(!pastDate||pastDate>r.date||pastDate===r.date)throw Error('前回分の対象日を確認してください');
    if(reason==='前回の不足分をまとめて受け取った'){
      const existing=collectionDueItems(state,roundId,buyerId).items.filter(x=>x.kind==='opening'&&x.balance>0);
      if(!existing.some(x=>x.balance===pastAmount)){
        if(received-before.balance!==pastAmount)throw Error('登録済みの未収・差額を再確認してください');
        state.receivableItems??=[];state.receivableItems.push({id:uid(),kind:'opening',buyerId,date:pastDate,amount:pastAmount,reason:'未払い / 未受取',note:'前回の不足分を今回受取'});
      }
    }else if(reason==='前回の預かり金を今回使った'){
      if(before.balance-received!==pastAmount)throw Error('登録済みの預かり・差額を再確認してください');
      state.collectionCredits??=[];
      if(!state.collectionCredits.some(x=>x.buyerId===buyerId&&x.date===pastDate&&x.amount===pastAmount))state.collectionCredits.push({id:uid(),buyerId,roundId,date:pastDate,amount:pastAmount,reason:'前回の預かり金'});
    }else throw Error('前回分の区分を確認してください');
  }
  const position=collectionPosition(state,roundId,buyerId);
  if(reason==='一部しか受け取っていない'&&received>position.balance)throw Error('受取額が残高を超えています。多く受け取った理由を確認してください');
  if(reason==='多く受け取ったので次回へ預かる'&&received<position.balance)throw Error('受取額は残高より少ないため、未収が残ります');
  if(reason==='前回の不足分をまとめて受け取った'&&received>position.balance)throw Error('不足分を確認してください');
  if(reason==='前回の預かり金を今回使った'&&received<position.balance)throw Error('預かり金を確認してください');
  if(received<0&&-received>Math.max(0,position.received+position.credits+Math.max(0,-position.carry)))throw Error('返金できる預かり残高を超えています');
  if(itemId){const item=collectionDueItems(state,roundId,buyerId).items.find(x=>x.id===itemId);if(!item||received<0||received>item.balance)throw Error('対象の未収と受取額を確認してください');}
  state.collectionEntries??=[];
  const entry={id:uid(),roundId,buyerId,date:today(),received,adjustment:0,note:reason||'全額受取',reason:reason||'全額受取',requestId:requestId||uid(),...(itemId?{itemId}:{})};
  state.collectionEntries.push(entry);
  if(caseId){const c=state.collectionCases?.find(x=>x.id===caseId);if(c)c.status='resolved';}
  for(const c of state.collectionCases||[])if(c.roundId===roundId&&c.buyerId===buyerId&&c.status==='pending')c.status='resolved';
  return entry;
}

export function adjustReceivable(state,{roundId,buyerId,amount,reason}){
 integer(amount,'債権調整額',true);
 if(!amount||!['回収しないことが確定した未収','以前の債権調整を戻す'].includes(reason))throw Error('債権調整の理由を選んでください');
 if(amount>collectionPosition(state,roundId,buyerId).balance)throw Error('現在の未収を超える債権調整はできません');
 state.collectionEntries??=[];state.collectionEntries.push({id:uid(),roundId,buyerId,date:today(),received:0,adjustment:amount,note:reason,reason,entryType:'receivable-adjustment'});
}
