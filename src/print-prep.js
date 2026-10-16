import {faxProducts} from './domain.js';
import {stockRemaining} from './domain.js';
import {deliveredQuantity} from './shortages.js';
import {buyerCompare} from './buyer-order.js';

// These projections only read the current workspace. Never copy a draft into it.
export function salesPrintRows(state, round) {
  const order = new Map(faxProducts(round.products).map((product, index) => [product.id, index]));
  return state.stocks.filter(stock => stock.roundId === round.id && !stock.eventId && !stock.sourceStockId)
    .map((stock, index) => ({stock, index, qty: stockRemaining(state, stock)}))
    .filter(row => row.qty > 0)
    .sort((a,b) => (order.get(a.stock.productId) ?? Infinity) - (order.get(b.stock.productId) ?? Infinity) || a.index-b.index)
    .map(({stock,qty}) => ({id:stock.id, name:stock.name, price:stock.price, qty}));
}

export function sortingPrintRows(state, round) {
  const products = faxProducts(round.products);
  const buyers = new Map(state.buyers.map(b => [b.id,b]));
  return Object.entries(round.orders).map(([id,order],index) => ({
    id, index, buyer:buyers.get(id), name:buyers.get(id)?.name || order.name,
    lines:products.map(product => ({id:product.id,name:product.name,qty:deliveredQuantity(order,product.id)}))
      .filter(line => line.qty > 0),
  })).filter(row => row.lines.length)
    .sort((a,b) => a.buyer && b.buyer ? buyerCompare(a.buyer,b.buyer) || a.index-b.index : a.buyer ? -1 : b.buyer ? 1 : a.index-b.index);
}

// A 47.5mm column leaves about 10 Japanese characters beside the quantity.
// Eight estimated lines per 63.5mm cell preserves comfortable handwriting/readability.
export function sortingSpan(lines) {
  const units = lines.reduce((total,line) => total + Math.max(1,Math.ceil([...line.name].length / 10)),0);
  return Math.min(4, Math.max(1, Math.ceil(units / 8)));
}

export function sortingPages(rows) {
  const pages = [];
  let page = [], occupied = Array(16).fill(false), cursor = 0;
  const flush = () => { if (page.length) pages.push(page); page=[]; occupied=Array(16).fill(false); cursor=0; };
  for (const row of rows) {
    const span = sortingSpan(row.lines);
    let slot = -1;
    for (let i=cursor;i<16;i++) {
      const col=i%4, top=Math.floor(i/4);
      if (top+span<=4 && Array.from({length:span},(_,n)=>i+n*4).every(index=>!occupied[index])) {slot=i;break;}
    }
    if (slot<0) {flush();slot=0;}
    for(let n=0;n<span;n++) occupied[slot+n*4]=true;
    page.push({...row,col:slot%4+1,top:Math.floor(slot/4)+1,span});
    cursor=slot+1;
  }
  flush();
  return pages;
}
