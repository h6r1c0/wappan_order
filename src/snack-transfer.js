import {stockRemaining} from './domain.js';

// The event line is a physical-use record linked to the original stock lot.
// Its acquisition cost stays with that lot, avoiding a second purchase.
export function transferStockToSnack(state,stockId,eventId,qty){
  const stock=state.stocks.find(x=>x.id===stockId),event=state.events.find(x=>x.id===eventId);
  if(!stock||stock.eventId||!event||stock.roundId!==event.roundId||stock.test!==event.test||
    event.date<stock.date||!Number.isSafeInteger(qty)||qty<1||qty>stockRemaining(state,stock))
    throw Error('同じ納品回の販売用残数から振替数量を選んでください');
  const line={id:crypto.randomUUID(),productId:stock.productId,name:stock.name,category:stock.category,
    qty,used:qty,usedConfirmed:true,cost:stock.cost,sourceStockId:stock.id};
  event.lines.push(line);
  event.stockTransferHistory??=[];
  event.stockTransferHistory.push({at:new Date().toISOString(),action:'販売用からおやつへ',sourceStockId:stock.id,lineId:line.id,qty});
  return line;
}

// Keep the source stock and the old line as audit evidence. A mistaken
// reverse transfer can be voided only before its snack allocation is billed.
export function cancelStockToSnackTransfer(state,eventId,lineId,reason){
  const event=state.events.find(e=>e.id===eventId),line=event?.lines.find(l=>l.id===lineId);
  const plan=event?.snackDraft;
  if(!line?.sourceStockId||!String(reason||'').trim())throw Error('振替記録と訂正理由を確認してください');
  if(event.lines.length===1)throw Error('最後のおやつ商品はこの画面で取り消せません。元の注文記録を確認してください');
  if(event.billing)throw Error('請求確定済みです。先に請求を訂正してください');
  if(state.stocks.some(st=>st.eventLineId===lineId&&st.qty>0))throw Error('再振替した販売用在庫を先に確認してください');
  if((plan?.fiscal||[]).some(x=>x.lineId===lineId&&x.qty>0)||
    (plan?.household||[]).some(x=>x.lineId===lineId&&x.qty>0))
    throw Error('この振替分に請求先が残っています。先に請求先を訂正してください');
  const groups=(plan?.groups||[]).filter(g=>(g.quantities?.[lineId]||0)>0);
  if(groups.some(g=>(plan.household||[]).some(x=>x.groupId===g.id)))
    throw Error('この共通単価に家庭の食数があります。先に割当を確認してください');
  if(!line.qty)throw Error('この振替は既に取り消されています');
  if(plan){
    event.snackDraftHistory??=[];
    event.snackDraftHistory.push({at:new Date().toISOString(),section:'common',reason,previous:structuredClone(plan)});
    plan.fiscal=plan.fiscal.filter(x=>x.lineId!==lineId);
    plan.groups=plan.groups.map(g=>{
      if(!g.lineIds.includes(lineId))return g;
      const lineIds=g.lineIds.filter(id=>id!==lineId);
      const quantities=Object.fromEntries(Object.entries(g.quantities||{}).filter(([id])=>id!==lineId));
      // Keep the now-empty group, its identity and its manually chosen price.
      return {...g,lineIds,quantities};
    });
  }
  event.stockTransferHistory??=[];
  event.stockTransferHistory.push({at:new Date().toISOString(),action:'販売用からおやつへの振替を訂正',
    sourceStockId:line.sourceStockId,lineId,previous:line.qty,updated:0,reason,
    previousLine:structuredClone(line)});
  // The persisted validator requires active transfer lines to have qty >= 1.
  // Archive the original row and remove it from active calculations only.
  event.cancelledStockTransferLines??=[];
  event.cancelledStockTransferLines.push(structuredClone(line));
  event.lines=event.lines.filter(l=>l.id!==lineId);
  return line;
}
