// Shared delivery identity; transfers retain origin, never purchase twice.
const sum = xs => xs.reduce((a,b)=>a+b,0);
const requireInt = (v,label,positive=false) => { if(!Number.isSafeInteger(v)||v<(positive?1:0)||v>100000000) throw Error(`${label}を確認してください`); };
export function delivery(s,date,test=false) {
  let r=s.rounds.find(r=>r.date===date && r.test===test);
  if(!r) {r={id:crypto.randomUUID(),date,test,status:'入力中',note:'',products:[],orders:{},planned:null,invoice:null,eventIds:[],stockIds:[]};s.rounds.push(r);}
  return r;
}
export function upgrade(s) {
  s.markets ??=[];s.bundles??=[];s.bundleSales??=[];s.externalDestinations??=[];s.aliases??={products:{},buyers:{}};
  for(const sale of s.sales){
    sale.destinationType??=sale.pending?'unknown':sale.paid?'external':'buyer';
    sale.paymentStatus??=sale.pending?'unconfirmed':sale.paid?'paid':'later';
    if(sale.destinationType==='external'){
      sale.destinationName??=(sale.buyerName==='その場で支払い済み'?'外部販売（名称未入力）':sale.buyerName)||'外部販売（名称未入力）';
      if(!s.externalDestinations.includes(sale.destinationName))s.externalDestinations.push(sale.destinationName);
    }
  }
  for(const e of s.events){
    const linked=s.rounds.find(r=>r.eventIds.includes(e.id));
    e.roundId??=linked?.id || delivery(s,e.deliveryDate||e.date,e.test).id;
  }
  for(const st of s.stocks){
    const linked=s.rounds.find(r=>r.stockIds.includes(st.id));
    st.roundId??=linked?.id||s.events.find(e=>e.id===st.eventId)?.roundId||delivery(s,st.date,st.test).id;
    st.channel??='onsite';st.depth??=0;
  }
  syncDeliveryLinks(s);s.schema=2;return s;
}
export function syncDeliveryLinks(s){
  for(const r of s.rounds){
    r.eventIds=s.events.filter(e=>e.roundId===r.id).map(e=>e.id);
    r.stockIds=s.stocks.filter(st=>st.roundId===r.id&&!st.eventId&&!st.sourceStockId).map(st=>st.id);
  }
}
export const bundleUsed = (s,id) => sum((s.bundleSales||[]).filter(x=>!x.void).flatMap(x=>x.components.filter(c=>c.stockId===id).map(c=>c.qty*x.qty)));
export const movedOut = (s,id) => sum(s.stocks.filter(x=>x.sourceStockId===id).map(x=>x.qty));
export const remaining = (s,st) => st.qty-sum(s.sales.filter(x=>!x.void&&x.stockId===st.id).map(x=>x.qty))-bundleUsed(s,st.id)-movedOut(s,st.id);
export function moveStock(s,source,qty,marketId=null,price=source.price){
  requireInt(qty,'振替数量',true);requireInt(price,'販売価格');
  if(qty>remaining(s,source))throw Error('販売待ち数量を超えています');
  const market=s.markets.find(m=>m.id===marketId);
  if(marketId&&(!market||market.roundId!==source.roundId))throw Error('同じ納品回の販売イベントを選んでください');
  const child={id:crypto.randomUUID(),name:source.name,productId:source.productId,category:source.category,qty,price,cost:source.cost,date:source.date,test:source.test,roundId:source.roundId,channel:marketId?'external':'onsite',marketId,sourceStockId:source.id,depth:(source.depth||0)+1,eventId:null,eventLineId:null,note:'販売待ち商品から振替（追加仕入なし）'};
  s.stocks.push(child);return child;
}
export const possibleSets=(s,b)=>b.components.length?Math.max(0,Math.min(...b.components.map(c=>{const st=s.stocks.find(x=>x.id===c.stockId);return st?Math.floor(remaining(s,st)/c.qty):0;}))):0;
export function sellBundle(s,b,qty,date,entry={}){
  requireInt(qty,'販売セット数',true);requireInt(b.price,'セット価格');
  if(qty>possibleSets(s,b))throw Error('構成商品の残数が足りません');
  const components=b.components.map(c=>({...c,cost:s.stocks.find(st=>st.id===c.stockId).cost}));
  const destinationType=entry.destinationType||'external',paymentStatus=entry.paymentStatus||'paid';
  if(!['external','unknown','buyer'].includes(destinationType)||!['paid','unconfirmed','later'].includes(paymentStatus))throw Error('販売先・支払状態を確認してください');
  if(destinationType==='external'&&!String(entry.destinationName||'').trim())throw Error('外部販売先の名称を入力してください');
  if(destinationType==='buyer'&&!s.buyers.some(x=>x.id===entry.buyerId))throw Error('購入者を選んでください');
  const destinationName=destinationType==='external'?String(entry.destinationName).trim():destinationType==='buyer'?s.buyers.find(x=>x.id===entry.buyerId).name:null;
  const sale={id:crypto.randomUUID(),bundleId:b.id,marketId:b.marketId,name:b.name,qty,price:b.price,date,note:entry.note||'',paid:paymentStatus==='paid',pending:destinationType==='unknown',destinationType,paymentStatus,destinationName,buyerId:destinationType==='buyer'?entry.buyerId:null,chargeRoundId:destinationType==='buyer'?s.markets.find(m=>m.id===b.marketId)?.roundId:null,components};
  if(destinationType==='external'&&!s.externalDestinations.includes(destinationName))s.externalDestinations.push(destinationName);
  s.bundleSales.push(sale);return sale;
}
export const bundleCost = sale => sale.components.some(c=>c.cost==null)?null:sum(sale.components.map(c=>c.qty*c.cost))*sale.qty;
export function marketTotals(s,m){
  const sales=s.sales.filter(x=>!x.void&&(x.marketId===m.id||(!x.marketId&&s.stocks.find(st=>st.id===x.stockId)?.marketId===m.id)));
  const sets=s.bundleSales.filter(x=>!x.void&&x.marketId===m.id);
  const revenue=sum(sales.map(x=>x.price*x.qty))+sum(sets.map(x=>x.price*x.qty));
  const costs=[...sales.map(x=>x.cost==null?null:x.cost*x.qty),...sets.map(bundleCost)];
  const cost=costs.some(x=>x==null)?null:sum(costs);
  const expense=m.expenseMode==='apply'&&m.expense!=null?m.expense:0;
  return {revenue,cost,baseProfit:cost==null?null:revenue-cost,profit:cost==null?null:revenue-cost-expense,expenseUnknown:m.expense==null,expenseApplied:m.expenseMode==='apply'&&m.expense!=null};
}
export function deliveryTotals(s,r){
  const map=new Map();
  const add=(id,name,kind,qty)=>{if(!map.has(id))map.set(id,{id,name,personal:0,sales:0,snack:0,onsite:0,event:0,external:0});map.get(id)[kind]+=qty;};
  for(const p of r.products)for(const o of Object.values(r.orders))add(p.id,p.name,'personal',o.quantities[p.id]||0);
  for(const st of s.stocks.filter(st=>st.roundId===r.id&&!st.sourceStockId&&!st.eventId)){
    add(st.productId||st.id,st.name,'sales',st.qty);
    add(st.productId||st.id,st.name,st.channel==='external'?'external':'onsite',st.qty);
  }
  for(const e of s.events.filter(e=>e.roundId===r.id))for(const l of e.lines){add(l.productId||l.id,l.name,'snack',l.qty);add(l.productId||l.id,l.name,'event',l.qty);}
  return [...map.values()].map(x=>({...x,qty:x.personal+x.sales+x.snack})).filter(x=>x.qty>0);
}
export function validateCommerce(s){
  if(s.schema!==2)return;
  const keys=new Set();for(const r of s.rounds){const k=r.date+':'+r.test;if(keys.has(k))throw Error('同じ納品日は既存の注文回を開いてください');keys.add(k);}
  for(const col of ['markets','bundles','bundleSales'])if(!Array.isArray(s[col])||new Set(s[col].map(x=>x.id)).size!==s[col].length)throw Error('販売データが重複しています');
  for(const e of s.events){const r=s.rounds.find(r=>r.id===e.roundId);if(!r||r.test!==e.test||!r.eventIds.includes(e.id))throw Error('行事の納品回を確認してください');}
  for(const st of s.stocks){
    const r=s.rounds.find(r=>r.id===st.roundId);if(!r||r.test!==st.test)throw Error('商品の納品回を確認してください');
    if(remaining(s,st)<0)throw Error('販売・セット・振替の数量が在庫を超えています');
    if(st.sourceStockId){const p=s.stocks.find(p=>p.id===st.sourceStockId);if(!p||st.depth!==(p.depth||0)+1||p.cost!==st.cost||p.roundId!==st.roundId||st.eventId||st.eventLineId||st.date<p.date)throw Error('振替元・原価が一致しません');}
    if(st.channel==='external'){const m=s.markets.find(m=>m.id===st.marketId);if(!m||m.roundId!==st.roundId)throw Error('外部販売先を選んでください');}
  }
  for(const m of s.markets){const r=s.rounds.find(r=>r.id===m.roundId);if(!m.name.trim()||!r||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||m.date<r.date)throw Error('販売イベント名・納品回・日付を確認してください');if(m.expense!=null)requireInt(m.expense,'出店経費');if(!['reference','apply'].includes(m.expenseMode))throw Error('経費の扱いを確認してください');}
  for(const b of s.bundles){const market=s.markets.find(m=>m.id===b.marketId);if(!b.name.trim()||!market||!b.components.length||new Set(b.components.map(c=>c.stockId)).size!==b.components.length)throw Error('セット名・構成商品を確認してください');requireInt(b.price,'セット価格');for(const c of b.components){requireInt(c.qty,'必要数',true);if(s.stocks.find(st=>st.id===c.stockId)?.roundId!==market.roundId)throw Error('同じ納品回の販売用商品を選んでください');}}
  for(const x of s.bundleSales){const b=s.bundles.find(b=>b.id===x.bundleId),m=s.markets.find(m=>m.id===x.marketId);requireInt(x.qty,'セット数',true);requireInt(x.price,'セット価格');if(!b||!m||b.marketId!==x.marketId||x.date<m.date||!x.components.length||new Set(x.components.map(c=>c.stockId)).size!==x.components.length)throw Error('セット販売の記録を確認してください');if(x.paid!==(x.paymentStatus==='paid')||x.pending!==(x.destinationType==='unknown'))throw Error('セット販売の支払状態を確認してください');if(x.destinationType==='external'&&(!String(x.destinationName||'').trim()||!['paid','unconfirmed'].includes(x.paymentStatus)))throw Error('外部販売先の名称を確認してください');if(x.destinationType==='buyer'&&(x.paymentStatus!=='later'||!s.buyers.some(b=>b.id===x.buyerId)||x.chargeRoundId!==m.roundId))throw Error('購入者を確認してください');if(x.destinationType==='unknown'&&x.paymentStatus!=='unconfirmed')throw Error('未確認販売の支払状態を確認してください');for(const c of x.components){requireInt(c.qty,'構成数量',true);const st=s.stocks.find(st=>st.id===c.stockId);if(!st||st.roundId!==m.roundId||c.cost!==st.cost)throw Error('セットの仕入原価が一致しません');}}
}
