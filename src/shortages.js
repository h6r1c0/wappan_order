// Demand stays immutable; fulfillment and its audit trail are separate.
export const receivedQuantity = item => item.receivedQty ?? item.qty;
export const deliveredQuantity = (order, id) => order?.deliveredQuantities?.[id] ?? order?.quantities[id] ?? 0;
const count = (n, label) => {
  if (!Number.isSafeInteger(n) || n < 0 || n > 100000000) throw Error(`${label}を確認してください`);
  return n;
};
export function shortageRecipients(state, round, productId) {
  const rows = Object.entries(round.orders).filter(([, o]) => o.quantities[productId] > 0)
    .map(([id, o]) => ({key:`buyer:${id}`, buyerId:id, name:o.name, qty:o.quantities[productId], kind:'buyer'}));
  for (const stock of state.stocks.filter(s => s.roundId === round.id && s.productId === productId && !s.eventId && !s.sourceStockId && s.qty > 0))
    rows.push({key:`stock:${stock.id}`, stockId:stock.id, name:`販売用${stock.cut ? '（カット）' : ''}`, qty:stock.qty, kind:'stock'});
  for (const event of state.events.filter(e => e.roundId === round.id))
    for (const line of event.lines.filter(l => l.productId === productId && l.qty > 0))
      rows.push({key:`snack:${line.id}`, eventId:event.id, lineId:line.id, name:'おやつ用', qty:line.qty, kind:'snack'});
  return rows;
}
export function fairAllocation(people, received, random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) {
  count(received, '実入荷数');
  if (received > people.reduce((n,p)=>n+p.qty,0)) throw Error('実入荷数が注文数を超えています');
  const result = Object.fromEntries(people.map(p => [p.key,0]));
  let left = received;
  while (left) {
    const eligible = people.filter(p => result[p.key] < p.qty).map(p=>p.key);
    // Each person has one chance per pass, irrespective of ordered quantity.
    for (let i=eligible.length-1;i>0;i--) {
      const value=random();
      if (!(value >= 0 && value < 1)) throw Error('抽選値を確認してください');
      const j=Math.floor(value*(i+1)); [eligible[i],eligible[j]]=[eligible[j],eligible[i]];
    }
    for (const key of eligible) { if (!left) break; result[key]++;left--; }
  }
  return result;
}
export function applyShortage(state, roundId, productId, received, allocations, method, expectedRecipients) {
  const round=state.rounds.find(r=>r.id===roundId), product=round?.products.find(p=>p.id===productId);
  if (!product || round.status === '入力中') throw Error('先に発注を確定してください');
  if (!['manual','lottery'].includes(method)) throw Error('配分方法を確認してください');
  const rows=shortageRecipients(state,round,productId);
  if (expectedRecipients && JSON.stringify(rows)!==JSON.stringify(expectedRecipients)) throw Error('注文内容が変わりました。配分をやり直してください');
  count(received,'実入荷数');
  if (received >= rows.reduce((n,p)=>n+p.qty,0)) throw Error('不足のある商品の実入荷数を入力してください');
  if (Object.keys(allocations).length!==rows.length || rows.some(p=>!Object.hasOwn(allocations,p.key))) throw Error('全用途の配分を確認してください');
  let total=0;
  for (const row of rows) {
    const n=count(allocations[row.key],'実渡し数');
    if (n > row.qty) throw Error('配分が元の注文数を超えています');
    total+=n;
    if (row.kind==='stock') {
      const st=state.stocks.find(s=>s.id===row.stockId);
      const sold=state.sales.filter(s=>s.stockId===st.id&&!s.void).reduce((a,s)=>a+s.qty,0);
      const sets=state.bundleSales.filter(s=>!s.void).reduce((a,s)=>a+s.qty*s.components.filter(c=>c.stockId===st.id).reduce((a,c)=>a+c.qty,0),0);
      const moved=state.stocks.filter(s=>s.sourceStockId===st.id).reduce((a,s)=>a+s.qty,0);
      if (n < sold+sets+moved) throw Error('販売・振替済みの数量より少なくできません');
    }
    if (row.kind==='snack') {
      const l=state.events.find(e=>e.id===row.eventId).lines.find(l=>l.id===row.lineId);
      const moved=state.stocks.filter(s=>s.eventLineId===l.id).reduce((a,s)=>a+s.qty,0);
      if (n < l.used+moved) throw Error('おやつ使用・振替済みの数量より少なくできません');
    }
  }
  if (total !== received) throw Error('配分合計を実入荷数に合わせてください');
  for (const row of rows) {
    const n=allocations[row.key];
    if (row.kind==='buyer') {const o=round.orders[row.buyerId];o.deliveredQuantities??={};o.deliveredQuantities[productId]=n;}
    if (row.kind==='stock') state.stocks.find(s=>s.id===row.stockId).receivedQty=n;
    if (row.kind==='snack') state.events.find(e=>e.id===row.eventId).lines.find(l=>l.id===row.lineId).receivedQty=n;
  }
  const record={id:crypto.randomUUID(), productId, product:structuredClone(product), roundId, date:round.date,
    recordedAt:new Date().toISOString(), method, received, ordered:rows.reduce((n,p)=>n+p.qty,0),
    allocations:rows.map(p=>({...p,delivered:allocations[p.key],shortage:p.qty-allocations[p.key]}))};
  round.shortages??=[];round.shortages.push(record);round.shortageConfirmation='yes';round.shortageReviewComplete=false;
  updateDeliveryStatus(round);
  return record;
}
export function updateDeliveryStatus(round) {
  if (round.status !== '注文確定' || round.invoice == null) return;
  if (round.shortageConfirmation === 'none' || (round.shortageConfirmation === 'yes' && round.shortageReviewComplete)) round.status='納品済み';
}
export function shortageMessage(record, allocation) {
  if (!allocation.shortage || allocation.kind!=='buyer') return '';
  const why=record.received===0 ? '今回は入荷がありませんでした。' : record.method==='lottery'
    ? '入荷数が注文数を下回ったため、できるだけ多くの方に行き渡るよう、1個ずつの段階抽選で配分しました。'
    : '入荷数が注文数を下回ったため、お渡し数を調整しました。';
  const result=allocation.delivered===0 ? `ご注文の${allocation.qty}個をお渡しできません。` : `${allocation.qty}個のご注文のうち、${allocation.delivered}個のお渡しとなります。`;
  return `${allocation.name}さん\nご注文の「${record.product.name}」ですが、${why}${result}お渡しできない${allocation.shortage}個分は集金額から差し引いています。申し訳ありません。`;
}
export function validateFulfillment(state) {
  for (const r of state.rounds) {
    for (const o of Object.values(r.orders)) for (const [id,n] of Object.entries(o.deliveredQuantities||{})) {
      count(n,'実渡し数');if (!Object.hasOwn(o.quantities,id)||n>o.quantities[id]) throw Error('実渡し数が元注文数を超えています');
    }
    for (const record of r.shortages||[]) {
      if (record.roundId!==r.id||!r.products.some(p=>p.id===record.productId)||!['manual','lottery'].includes(record.method)) throw Error('欠品履歴の参照を確認してください');
      count(record.received,'実入荷数');count(record.ordered,'元注文数');
      if (new Set(record.allocations.map(p=>p.key)).size!==record.allocations.length) throw Error('欠品配分が重複しています');
      for (const p of record.allocations) {count(p.qty,'元注文数');count(p.delivered,'実渡し数');count(p.shortage,'欠品数');if(p.qty!==p.delivered+p.shortage)throw Error('欠品履歴の数量が一致しません');}
      if (record.allocations.reduce((n,p)=>n+p.delivered,0)!==record.received || record.allocations.reduce((n,p)=>n+p.qty,0)!==record.ordered) throw Error('欠品配分の合計が一致しません');
    }
  }
  for (const item of [...state.stocks,...state.events.flatMap(e=>e.lines)]) if(item.receivedQty!=null){count(item.receivedQty,'実入荷数');if(item.receivedQty>item.qty)throw Error('実入荷数が注文数を超えています');}
}
