import {faxProducts} from './domain.js';
import {deliveredQuantity,receivedQuantity} from './shortages.js';
import {buyerCompare} from './buyer-order.js';

// These projections only read the current workspace. Never copy a draft into it.
export function salesPrintRows(state, round) {
  const order = new Map(faxProducts(round.products).map((product, index) => [product.id, index]));
  return state.stocks.filter(stock => stock.roundId === round.id && !stock.eventId && !stock.sourceStockId)
    // A sales record sheet represents the delivered sales order, even after all
    // units have been assigned. Only a confirmed shortage reduces its blanks.
    .map((stock, index) => ({stock, index, qty: receivedQuantity(stock)}))
    .filter(row => row.qty > 0)
    .sort((a,b) => (order.get(a.stock.productId) ?? Infinity) - (order.get(b.stock.productId) ?? Infinity) || a.index-b.index)
    .map(({stock,qty}) => ({id:stock.id, name:salesPrintName(stock.name), price:stock.price, qty}));
}

// The stock snapshot is authoritative; remove only temporary source-note text
// from the paper label. Keep pack sizes that distinguish products.
export function salesPrintName(name) {
  return name.replace(/【(?:(\d+個)・)?\d+月\d+日資料】$/,(_,pack)=>pack?` ${pack}入り`:'');
}

export function sortingPrintRows(state, round) {
  const products = faxProducts(round.products);
  const buyers = new Map(state.buyers.map(b => [b.id,b]));
  return Object.entries(round.orders).map(([id,order],index) => ({
    id, index, buyer:buyers.get(id), name:buyers.get(id)?.name || order.name,
    lines:products.map(product => ({id:product.id,name:product.name,
      printName:sortingPrintName(product.name,products),qty:deliveredQuantity(order,product.id)}))
      .filter(line => line.qty > 0),
  })).filter(row => row.lines.length)
    .sort((a,b) => a.buyer && b.buyer ? buyerCompare(a.buyer,b.buyer) || a.index-b.index : a.buyer ? -1 : b.buyer ? 1 : a.index-b.index);
}

// Only known, unambiguous names receive a shorter label on the cut-out sheet.
// The full snapshot remains in the order and in the sales record sheet.
const shortLabels = new Map([
  ['シナモンレーズンクッキー','シナモンRクッキー'],
  ['Ｆ.Ｔ.ジンジャークッキー','ジンジャークッキー'],
  ['Ｆ.Ｔ.鳩ココアクッキー','鳩ココアクッキー'],
  ['F.T.エスプレッソクッキー','エスプレッソクッキー'],
  ['F.T.紅茶クッキー','紅茶クッキー'],
  ['甘夏サンドクッキー(冷)　約70g','甘夏サンドクッキー'],
  ['白うさぎと黒うさぎのチョコパン　2種×2個','白黒うさぎチョコパン'],
  ['ミルクスティックパン','ミルクスティック'],
  ['ちびっこモーニング　3種、14個','ちびモーニング14個'],
  ['にこにこドッグ(リーン)(涼)　6個','にこにこドッグ6個'],
  ['もちふわ玄丸パン(冷)　4個','もちふわ玄丸パン4個'],
  ['ゆめクロワッサン・ザク　2個','ゆめクロワッサンザク'],
  ['植物素材のビスケット　約80g','植物素材ビスケット'],
  ['抹茶シフォンケーキ(冷） 直径12㎝型','抹茶シフォン'],
  ['くるみパン【1個・9月11日資料】','くるみパン1個'],
  ['ソーセージロール(涼)　1個','ソーセージロール'],
  ['パン・オ・レザン(涼)　1個','パン・オ・レザン'],
  ['ミニブッセ(冷)　8個','ミニブッセ8個'],
  ['りんごデニッシュ(涼)　1個','りんごデニッシュ'],
  ['ライ麦くるみレーズン　1個','ライ麦くるみレーズン'],
]);
export function sortingPrintName(name, products) {
  const candidate=shortLabels.get(name);
  if (!candidate) return name;
  // When two products would read the same, retain the full name and its specification.
  return products.some(p => p.name!==name && (p.name===candidate || shortLabels.get(p.name)===candidate))
    ? name : candidate;
}

// Physical height estimate: 16mm for name/padding, 5.5mm per product line.
// Leave Safari substantial page-bottom headroom rather than filling the A4 box.
const sortingGridHeight=235;
export function sortingSpan(lines, rowCount=4) {
  const units=lines.reduce((n,line)=>n+Math.max(1,Math.ceil([...(line.printName||line.name)].length/11)),0);
  return Math.min(4,Math.max(1,Math.ceil((16+units*5.5)/(sortingGridHeight/rowCount))));
}

function arrange(rows,rowCount,pageCount=0) {
  const ranked=rows.map((row,index)=>({...row,index,span:sortingSpan(row.lines,rowCount)}))
    .sort((a,b)=>b.span-a.span || a.index-b.index);
  const pages=Array.from({length:pageCount},()=>({items:[],used:new Set()}));
  const place=(page,item)=>{
    for(let i=0;i<4*rowCount;i++){
      const col=i%4,top=Math.floor(i/4);
      if(top+item.span>rowCount)continue;
      const cells=Array.from({length:item.span},(_,n)=>i+n*4);
      if(cells.every(cell=>!page.used.has(cell))){
        cells.forEach(cell=>page.used.add(cell));
        page.items.push({...item,col:col+1,top:top+1});return true;
      }
    }
    return false;
  };
  for(const item of ranked){
    const choices=pageCount ? [...pages].sort((a,b)=>a.used.size-b.used.size) : pages;
    if(!choices.some(page=>place(page,item))){const page={items:[],used:new Set()};place(page,item);pages.push(page);}
  }
  return pages.map(p=>Object.assign(p.items,{rowCount}));
}

export function sortingPages(rows) {
  const four=arrange(rows,4);
  const five=arrange(rows,5);
  const rowCount=five.length<four.length ? 5 : 4;
  return arrange(rows,rowCount,rowCount===5?five.length:four.length);
}
