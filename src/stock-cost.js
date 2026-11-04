// A first confirmed source cost fills only records whose cost was unknown.
// Existing historical prices and confirmed costs remain untouched.
export function confirmSourceStockCost(state,stockId,cost){
  const stock=state.stocks.find(x=>x.id===stockId);
  if(!stock||stock.cost!=null||!Number.isSafeInteger(cost)||cost<0)throw Error('元商品の未確定仕入単価を確認してください');
  for(const sale of state.sales.filter(x=>x.stockId===stockId&&x.cost==null))sale.cost=cost;
  for(const event of state.events)for(const line of event.lines.filter(l=>l.sourceStockId===stockId&&l.cost==null))line.cost=cost;
  stock.costHistory=[...(stock.costHistory||[]),{at:new Date().toISOString(),previous:null,updated:cost,reason:'未確定の元仕入単価を確認'}];
  stock.cost=cost;
}
