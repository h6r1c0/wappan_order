import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,addSale} from '../src/domain.js';
import {setSalesOrderQuantities} from '../src/commerce.js';
import {salesPrintRows,salesPrintName,sortingPrintRows,sortingPages,sortingSpan,sortingPrintName} from '../src/print-prep.js';

function fixture(){
  const state=initialState();
  state.products.forEach((p,i)=>{p.gross=300+i*10;p.faxOrder=i;});
  const round=newRound(state,'2026-10-16');state.rounds.push(round);
  return {state,round};
}

test('販売記録表は販売後も販売用入荷数と注文表順、当時の価格だけを読み取る',()=>{
  const {state,round}=fixture();
  assert.deepEqual(salesPrintRows(state,round),[]);
  setSalesOrderQuantities(state,round.id,{milk:1});
  assert.deepEqual(salesPrintRows(state,round).map(x=>[x.name,x.qty]),[['ミルクスティックパン',1]]);
  setSalesOrderQuantities(state,round.id,{brown:7,milk:1});
  const before=structuredClone(state);
  assert.deepEqual(salesPrintRows(state,round).map(x=>[x.name,x.price,x.qty]),[
    ['ミルクスティックパン',280,1],['黒糖ブレッド',430,7]
  ]);
  const brown=state.stocks.find(x=>x.productId==='brown');
  brown.receivedQty=5;
  assert.equal(salesPrintRows(state,round).find(x=>x.name==='黒糖ブレッド').qty,5);
  addSale(state,brown,{qty:5,destinationType:'external',paymentStatus:'paid'});
  assert.equal(salesPrintRows(state,round).find(x=>x.name==='黒糖ブレッド').qty,5);
  assert.deepEqual(before.stocks.map(x=>x.qty),state.stocks.map(x=>x.qty));
  assert.equal(salesPrintRows(state,round).length,2);
});

test('古い注文回は完売後も帳票へ載せ、別注文回の在庫を混ぜない',()=>{
  const {state,round}=fixture();
  setSalesOrderQuantities(state,round.id,{milk:1});
  const next=newRound(state,'2026-10-30');state.rounds.push(next);
  setSalesOrderQuantities(state,next.id,{brown:2});
  assert.deepEqual(salesPrintRows(state,round).map(x=>x.name),['ミルクスティックパン']);
  assert.deepEqual(salesPrintRows(state,next).map(x=>x.name),['黒糖ブレッド']);
});

test('販売記録表だけ一時的な資料注記を除き、規格と注文スナップショットを保つ',()=>{
  const historic='くるみパン【1個・9月11日資料】';
  assert.equal(salesPrintName(historic),'くるみパン');
  assert.equal(salesPrintName('くるみパン 2個入り'),'くるみパン 2個入り');
  assert.equal(historic,'くるみパン【1個・9月11日資料】');
});

test('販売記録表だけ顧客向け表示へ整え、同じ表の規格違いは区別する',()=>{
  for(const [name,label] of [
    ['塩パン　1個','塩パン'],
    ['ライ麦くるみレーズン　1個','ライ麦くるみレーズン'],
    ['植物素材のビスケット　約80g','植物素材ビスケット'],
    ['Ｆ.Ｔ.鳩ココアクッキー','鳩ココアクッキー'],
    ['シナモンレーズンクッキー','シナモンレーズンクッキー'],
    ['白うさぎと黒うさぎのチョコパン　2種×2個','白黒うさぎチョコパン'],
    ['天然酵母食パン（大）約620g【スライス】','天然酵母食パン大・スライス'],
    ['抹茶シフォンケーキ(冷） 直径12㎝型','抹茶シフォンケーキ'],
  ])assert.equal(salesPrintName(name),label);
  const {state,round}=fixture();
  const products=[['one','くるみパン 1個入り'],['two','くるみパン 2個入り'],
    ['small','天然酵母食パン（小）約410g'],['large','天然酵母食パン（大）約620g']];
  products.forEach(([id,name],i)=>{
    state.products.push({id,name,salesLabel:id==='small'?'天然酵母食パン':'',active:true});
    round.products.push({id,name,price:200,faxOrder:i+10});
    state.stocks.push({id:`st-${id}`,roundId:round.id,productId:id,name,price:200,qty:1});
  });
  const before=structuredClone(state);
  assert.deepEqual(salesPrintRows(state,round).map(row=>row.name),[
    'くるみパン 1個入り','くるみパン 2個入り','天然酵母食パン（小）','天然酵母食パン（大）'
  ]);
  assert.deepEqual(state,before);
});

test('マスターIDの任意表示名は別注文回の同一商品にも使われ、同名なら正式規格へ戻す',()=>{
  const {state,round}=fixture();
  state.products.push({id:'season',name:'ハロウィンパンプキンガレット　約20g×4個',salesLabel:'ハロウィンガレット'});
  const next=newRound(state,'2027-10-16');state.rounds.push(next);
  for(const r of [round,next]){
    r.products.push({id:'season',name:'ハロウィンパンプキンガレット　約20g×4個',price:300});
    state.stocks.push({id:`st-${r.date}`,roundId:r.id,productId:'season',name:'ハロウィンパンプキンガレット　約20g×4個',qty:1,price:300});
  }
  assert.equal(salesPrintRows(state,round)[0].name,'ハロウィンガレット');
  assert.equal(salesPrintRows(state,next)[0].name,'ハロウィンガレット');
  state.products.push({id:'other',name:'別商品',salesLabel:'ハロウィンガレット'});
  round.products.push({id:'other',name:'別商品',price:300});
  state.stocks.push({id:'st-other',roundId:round.id,productId:'other',name:'別商品',qty:1,price:300});
  assert.deepEqual(salesPrintRows(state,round).map(row=>row.name),['ハロウィンパンプキンガレット 約20g×4個','別商品']);
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

test('仕分けの略称は規格や識別を守り、衝突時は正式名称に戻す',()=>{
  const products=[{name:'甘夏サンドクッキー(冷)　約70g'},{name:'Ｆ.Ｔ.ジンジャークッキー'},
    {name:'白うさぎと黒うさぎのチョコパン　2種×2個'},{name:'くるみパン 1個入り'},{name:'くるみパン 2個入り'}];
  assert.equal(sortingPrintName(products[0].name,products),'甘夏サンドクッキー');
  assert.equal(sortingPrintName(products[1].name,products),'ジンジャークッキー');
  assert.equal(sortingPrintName(products[2].name,products),'白黒うさぎチョコパン');
  assert.equal(sortingPrintName(products[3].name,products),'くるみパン 1個入り');
  assert.equal(sortingPrintName(products[4].name,products),'くるみパン 2個入り');
  assert.equal(sortingPrintName('シナモンレーズンクッキー',products),'シナモンRクッキー');
  products.push({name:'甘夏サンドクッキー'});
  assert.equal(sortingPrintName(products[0].name,products),products[0].name);
});

test('16人は4×4、必要なら5段で1枚に収め、複数ページは均衡させる',()=>{
  const row=(id,count)=>({id,lines:Array.from({length:count},(_,i)=>({name:`商品${i}`,qty:1}))});
  const sixteen=sortingPages(Array.from({length:16},(_,i)=>row(String(i),1)));
  assert.equal(sixteen.length,1);assert.equal(sixteen[0].rowCount,4);
  const seventeen=sortingPages(Array.from({length:17},(_,i)=>row(String(i),1)));
  assert.equal(seventeen.length,1);assert.equal(seventeen[0].rowCount,5);
  assert.deepEqual([9,17,25].map(n=>sortingSpan(row('x',n).lines)),[2,2,3]);
  const pages=sortingPages([row('tall',25),...Array.from({length:15},(_,i)=>row(String(i),1))]);
  assert.equal(pages.length,1);assert.equal(pages[0].rowCount,5);assert.equal(pages[0][0].span,4);
  const many=sortingPages(Array.from({length:21},(_,i)=>row(String(i),1)));
  assert.deepEqual(many.map(p=>p.length),[11,10]);
  for(const page of [...pages,...many])for(const item of page) assert.ok(item.top+item.span<=page.rowCount+1);
});
