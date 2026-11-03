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
