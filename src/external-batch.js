import {addSale,assignUnknownSale,stockRemaining,uid,validate} from './domain.js';
import {replaceOtherDistribution} from './other-sales.js';
import {equalValue} from './structural-equality.js';
export function unassignedExternalItems(state,roundId){
 const round=state.rounds.find(r=>r.id===roundId);if(!round)return [];
 return [...state.stocks.filter(s=>s.roundId===roundId).map(stock=>{const pending=state.sales.filter(s=>s.stockId===stock.id&&!s.void&&(s.pending||s.destinationType==='unknown'));return {key:'stock:'+stock.id,name:stock.name,source:stock.eventLineId?'おやつからの振替':'販売用の入荷',qty:stockRemaining(state,stock)+pending.reduce((n,s)=>n+s.qty,0),price:stock.price,pending:pending.length>0,date:stock.date};}),
 ...(state.otherSales||[]).filter(s=>!s.void&&s.paymentStatus==='unpaid'&&s.date===round.date&&s.test===round.test).map(s=>({key:'other:'+s.id,name:s.name,qty:s.qty-(s.allocations||[]).reduce((n,x)=>n+x.qty,0)-(s.paidExternalQty||0),price:s.unitPrice,recorded:true,date:s.date}))].filter(s=>s.qty>0);
}
export function allocateExternalBatch(state,roundId,items,{date,name='',requestId=uid(),reason='未割当商品の外部販売を照合'}={}){
 const previous=(state.externalAllocationBatches||[]).find(b=>b.requestId===requestId);
 if(previous){if(previous.roundId!==roundId||previous.date!==date||previous.name!==name||!equalValue(previous.items,items))throw Error('同じ操作番号の内容が変わっています');return previous;}
 if(!items.length||new Set(items.map(x=>x.key)).size!==items.length||!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('対象商品と販売日を確認してください');
 const probe=structuredClone(state),available=unassignedExternalItems(probe,roundId);
 for(const item of items){const row=available.find(x=>x.key===item.key);if(!row||!Number.isSafeInteger(item.qty)||item.qty<1||item.qty>row.qty||!Number.isSafeInteger(item.price)||item.price<0||item.price>100000000||date<row.date)throw Error('数量・単価・販売日が未割当の範囲と一致しません');
  if(row.recorded){if(item.price!==row.price)throw Error('登録済みのその他商品の単価訂正は元の販売記録から行ってください');const s=probe.otherSales.find(x=>'other:'+x.id===item.key);replaceOtherDistribution(probe,s.id,s.allocations||[],(s.paidExternalQty||0)+item.qty,reason);}
  else {const stock=probe.stocks.find(s=>'stock:'+s.id===item.key);let left=item.qty;
   for(const pending of probe.sales.filter(s=>s.stockId===stock.id&&!s.void&&(s.pending||s.destinationType==='unknown'))){if(!left)break;if(pending.price!==item.price)throw Error('販売先未確認の登録済み単価を変える場合は元の販売記録を訂正してください');const take=Math.min(left,pending.qty);assignUnknownSale(probe,pending.id,take,{destinationType:'external',destinationName:name,paymentStatus:'paid'});left-=take;}
   if(left)addSale(probe,stock,{qty:left,price:item.price,date,destinationType:'external',destinationName:name,paymentStatus:'paid',note:reason});
  }
 }
 const batch={id:uid(),requestId,roundId,items:structuredClone(items),date,name,reason,at:new Date().toISOString()};(probe.externalAllocationBatches??=[]).push(batch);validate(probe);Object.assign(state,probe);return batch;
}
