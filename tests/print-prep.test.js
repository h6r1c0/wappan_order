import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound} from '../src/domain.js';
import {setSalesOrderQuantities} from '../src/commerce.js';
import {salesPrintRows,sortingPrintRows,sortingPages,sortingSpan} from '../src/print-prep.js';

function fixture(){
  const state=initialState();
  state.products.forEach((p,i)=>{p.gross=300+i*10;p.faxOrder=i;});
  const round=newRound(state,'2026-10-16');state.rounds.push(round);
  return {state,round};
}

test('販売記録表は販売用の未販売数量と注文表順、当時の価格だけを読み取る',()=>{
  const {state,round}=fixture();
  assert.deepEqual(salesPrintRows(state,round),[]);
  setSalesOrderQuantities(state,round.id,{brown:7,milk:1});
  const before=structuredClone(state);
  assert.deepEqual(salesPrintRows(state,round).map(x=>[x.name,x.price,x.qty]),[
    ['ミルクスティックパン',280,1],['黒糖ブレッド',430,7]
  ]);
  const brown=state.stocks.find(x=>x.productId==='brown');
  brown.receivedQty=5;
  assert.equal(salesPrintRows(state,round).find(x=>x.name==='黒糖ブレッド').qty,5);
  assert.deepEqual(before.stocks.map(x=>x.qty),state.stocks.map(x=>x.qty));
  assert.equal(salesPrintRows(state,round).length,2);
});

test('個人仕分け表は注文のある購入者だけを画面と同じ読み順・FAX順で扱う',()=>{
  const {state,round}=fixture();
  state.buyers=[{id:'y',name:'山﨑',kana:'やまざき'}, {id:'a',name:'淺野',kana:'あさの'}, {id:'none',name:'堀',kana:'ほり'}];
  round.orders.y={name:'山﨑',quantities:{brown:2,milk:1}};
  round.orders.a={name:'淺野',quantities:{donut:2}};
  round.orders.none={name:'堀',quantities:{}};
  const before=structuredClone(state);
  assert.deepEqual(sortingPrintRows(state,round).map(x=>[x.name,x.lines.map(l=>[l.name,l.qty])]),[
    ['淺野',[['ツイストドーナツ 2個入り',2]]],
    ['山﨑',[['ミルクスティックパン',1],['黒糖ブレッド',2]]]
  ]);
  round.orders.y.deliveredQuantities={brown:1,milk:0};
  assert.deepEqual(sortingPrintRows(state,round).find(x=>x.id==='y').lines.map(l=>[l.id,l.qty]),[['brown',1]]);
  assert.deepEqual(before.rounds[0].orders.y.quantities,round.orders.y.quantities);
});

test('16人は4×4、商品量の多い人は縦2～4枠を割きページ途中で切らない',()=>{
  const row=(id,count)=>({id,lines:Array.from({length:count},(_,i)=>({name:`商品${i}`,qty:1}))});
  assert.equal(sortingPages(Array.from({length:16},(_,i)=>row(String(i),1))).length,1);
  assert.equal(sortingPages(Array.from({length:17},(_,i)=>row(String(i),1))).length,2);
  assert.deepEqual([9,17,25].map(n=>sortingSpan(row('x',n).lines)),[2,3,4]);
  const pages=sortingPages([row('tall',25),...Array.from({length:12},(_,i)=>row(String(i),1))]);
  assert.equal(pages[0][0].span,4);
  for(const page of pages)for(const item of page) assert.ok(item.top+item.span<=5);
});
