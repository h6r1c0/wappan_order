import {receivedQuantity} from './shortages.js';

const sum = values => values.reduce((n,v)=>n+v,0);
export const suggestedSnackPrice = costs => costs.length && costs.every(Number.isSafeInteger)
  ? Math.ceil((sum(costs)/costs.length)/10)*10 : null;

// Billing assignments are separate from physical use and transfers. A saved
// draft replaces the prior assignment; no purchase, stock or sale is created.
export function snackBillingPreview(state,event,billing=event.billing){
  if(!billing)return {fiscal:null,household:0,cost:null,profit:null,discrepancy:0};
  if(!String(billing.label||'').trim())throw Error('行事・おやつ名を入力してください');
  const lines=new Map(event.lines.map(l=>[l.id,l]));
  const fiscalItems=billing.fiscal||[], householdItems=billing.household||[];
  if(new Set(fiscalItems.map(x=>x.lineId)).size!==fiscalItems.length)throw Error('同じ商品の財政請求が重複しています');
  let fiscal=0,household=0;
  for(const item of fiscalItems){
    const line=lines.get(item.lineId);
    if(!line)throw Error('財政請求の商品が見つかりません');
    if(!Number.isSafeInteger(item.qty)||item.qty<0||item.qty>receivedQuantity(line))throw Error('財政請求数を確認してください');
    if(item.qty&&line.cost==null)throw Error(`${line.name}の実際の仕入単価を確認してください`);
    fiscal+=item.qty*(line.cost||0);
  }
  const perLine=new Map(fiscalItems.map(x=>[x.lineId,x.qty]));
  const known=new Map(),unknown=[];
  const seen=new Set();
  for(const item of householdItems){
    const key=`${item.buyerId}:${item.lineId||'common'}`;
    if(seen.has(key))throw Error('同じ行事・購入者・商品のおやつ請求が重複しています');
    seen.add(key);
    if(!state.buyers.some(b=>b.id===item.buyerId))throw Error('請求先の購入者を選んでください');
    if(!Number.isSafeInteger(item.qty)||item.qty<1||!Number.isSafeInteger(item.unitPrice)||item.unitPrice<0)throw Error('おやつ請求の食数・単価を確認してください');
    if(item.lineId&&!lines.has(item.lineId))throw Error('おやつ請求の商品が見つかりません');
    household+=item.qty*item.unitPrice;
    if(item.lineId)known.set(item.lineId,(known.get(item.lineId)||0)+item.qty);
    else unknown.push(item);
  }
  const remainder=[];
  for(const line of event.lines){
    const used=perLine.get(line.id)||0, specified=known.get(line.id)||0;
    const transferred=sum((state.stocks||[]).filter(st=>st.eventLineId===line.id).map(st=>st.qty));
    if(used+specified>receivedQuantity(line)-transferred)throw Error(`${line.name}の請求数が振替後のおやつ数量を超えています`);
    // A zero in an older event is not evidence that nothing was eaten.
    if(line.usedConfirmed||line.used>0)remainder.push({line,qty:line.used-used-specified});
  }
  const unknownQty=sum(unknown.map(x=>x.qty));
  const identified=sum([...perLine.values()])+sum([...known.values()])+unknownQty;
  const available=sum(event.lines.map(l=>receivedQuantity(l)))-sum((state.stocks||[]).filter(st=>st.eventId===event.id).map(st=>st.qty));
  if(identified>available)throw Error('請求対象数が販売振替後のおやつ入荷数を超えています');
  const complete=event.lines.every(l=>l.usedConfirmed||l.used>0) && remainder.every(x=>x.qty>=0) && sum(remainder.map(x=>x.qty))===unknownQty;
  const cost=complete && event.lines.every(l=>l.cost!=null)
    ? sum(event.lines.map(l=>(l.used-(perLine.get(l.id)||0))*l.cost)) : null;
  const discrepancy=complete?0:identified-sum(event.lines.map(l=>l.used||0));
  return {fiscal,household,cost,profit:cost==null?null:household-cost,discrepancy,complete};
}

export function replaceSnackBilling(state,eventId,billing,reason='請求先を更新'){
  const event=state.events.find(e=>e.id===eventId);
  if(!event)throw Error('おやつが見つかりません');
  snackBillingPreview(state,event,billing);
  if(event.billing&&!String(reason||'').trim())throw Error('請求修正・取消の理由を入力してください');
  if(event.billing){
    event.billingHistory??=[];
    event.billingHistory.push({at:new Date().toISOString(),reason,billing:structuredClone(event.billing)});
  }
  event.billing=billing?structuredClone(billing):null;
}
