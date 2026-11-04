// A first confirmed source cost fills only records whose cost was unknown.
// Existing historical prices and confirmed costs remain untouched.
export function confirmSourceStockCost(state,stockId,cost){
  const stock=state.stocks.find(x=>x.id===stockId);
  if(!stock||stock.cost!=null||!Number.isSafeInteger(cost)||cost<0)throw Error('元商品の未確定仕入単価を確認してください');
  const linked=new Set([stockId]);
  for(let changed=true;changed;){changed=false;for(const child of state.stocks.filter(x=>linked.has(x.sourceStockId)&&!linked.has(x.id))){linked.add(child.id);changed=true;}}
  const items=[...state.stocks.filter(x=>x.id!==stockId&&linked.has(x.id)),
    ...state.sales.filter(x=>linked.has(x.stockId)),
    ...state.events.flatMap(e=>e.lines.filter(l=>l.sourceStockId===stockId)),
    ...(state.bundleSales||[]).flatMap(b=>b.components.filter(c=>linked.has(c.stockId)))];
  if(items.some(x=>x.cost!=null))throw Error('連動する記録の原価が既に確定しています。履歴を確認してください');
  for(const item of items)item.cost=cost;
  stock.costHistory=[...(stock.costHistory||[]),{at:new Date().toISOString(),previous:null,updated:cost,reason:'未確定の元仕入単価を確認'}];
  stock.cost=cost;
}

// A correction is limited to the linked lot and its descendants. Refuse an
// already divergent historical cost rather than silently rewriting it.
export function correctSourceStockCost(state,stockId,cost,reason){
  const stock=state.stocks.find(x=>x.id===stockId);
  if(!stock||stock.cost==null||!Number.isSafeInteger(cost)||cost<0||!String(reason||'').trim())
    throw Error('仕入単価の訂正理由と正しい金額を入力してください');
  if(stock.cost===cost)return;
  const previous=stock.cost,linked=new Set([stockId]);
  for(let changed=true;changed;){
    changed=false;
    for(const child of state.stocks.filter(x=>x.sourceStockId&&linked.has(x.sourceStockId)&&!linked.has(x.id))){linked.add(child.id);changed=true;}
  }
  const children=state.stocks.filter(x=>linked.has(x.id)&&x.id!==stockId);
  const sales=state.sales.filter(x=>linked.has(x.stockId));
  const lines=state.events.flatMap(e=>e.lines.filter(l=>l.sourceStockId===stockId));
  const components=(state.bundleSales||[]).flatMap(b=>b.components.filter(c=>linked.has(c.stockId)));
  if([...children,...sales,...lines,...components].some(x=>x.cost!=null&&x.cost!==previous))
    throw Error('連動する販売・おやつ記録に別の原価があります。先に履歴を確認してください');
  const at=new Date().toISOString();
  for(const item of [stock,...children,...sales,...lines,...components]){
    item.costHistory=[...(item.costHistory||[]),{at,previous,updated:cost,reason,sourceStockId:stockId}];
    item.cost=cost;
  }
}
