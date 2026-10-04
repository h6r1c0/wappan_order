import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,orderAmount,orderDraft,unpricedOrderLines,collectionPosition,collectionDueItems,validate} from '../src/domain.js';

function setup(){
  const s=initialState();
  const donut=s.products.find(x=>x.id==='donut');donut.cost=156;donut.lifecycle='permanent';
  const sept=newRound(s,'2026-09-11');s.rounds.push(sept);
  sept.products.find(x=>x.id==='donut').price=190;
  sept.orders.hori={name:'堀',quantities:{brown:1,donut:2}};
  s.receivableItems.push({id:'addition',kind:'additional',roundId:sept.id,buyerId:'hori',date:sept.date,amount:380,reason:'商品請求漏れ',note:'9/11 ツイストドーナツ 2個入り ×2 請求漏れ',notifiedAmount:430});
  const next=newRound(s,'2026-10-16');next.orders.hori={name:'堀',quantities:{brown:1}};s.rounds.push(next);
  return {s,sept,next};
}
test('価格未確認の商品は固定注文から消えず、0円商品と区別される',()=>{
  const s=initialState();s.products.find(p=>p.id==='donut').cost=156;s.products.find(p=>p.id==='donut').lifecycle='permanent';
  const r=newRound(s,'2026-09-11');s.rounds.push(r);
  const draft=orderDraft(s,r,s.buyers[0]);assert.equal(draft.quantities.donut,2);
  r.orders.hori=draft;
  assert.equal(unpricedOrderLines(r,draft).find(x=>x.productId==='donut').qty,2);
  assert.equal(validate(s),s);
});
test('追加請求は元請求内訳であり二重計上せず、一部受取の残高は次回に移る',()=>{
  const {s,sept,next}=setup();
  assert.equal(orderAmount(sept,sept.orders.hori),810);
  assert.equal(collectionPosition(s,sept.id,'hori').balance,810);
  s.collectionEntries.push({id:'received',roundId:sept.id,buyerId:'hori',date:sept.date,received:430,adjustment:0,note:'当初案内額'});
  assert.equal(collectionPosition(s,sept.id,'hori').balance,380);
  assert.equal(collectionDueItems(s,sept.id,'hori').items.find(x=>x.id==='addition').balance,380);
  assert.equal(collectionPosition(s,next.id,'hori').carry,380);
  assert.equal(collectionPosition(s,next.id,'hori').balance,810);
  s.collectionEntries.push({id:'rest',roundId:next.id,buyerId:'hori',date:next.date,received:380,adjustment:0,note:'請求漏れを受取',itemId:'addition'});
  assert.equal(collectionDueItems(s,next.id,'hori').items.find(x=>x.id==='addition').balance,0);
  assert.equal(collectionPosition(s,next.id,'hori').balance,430);
  assert.equal(validate(s),s);
});
test('開始残高は元注文を捏造せず個別消込と繰越を行う',()=>{
  const {s,sept,next}=setup();s.buyers.push({id:'yogo',name:'余語',active:true,fixed:[]});
  s.receivableItems.push({id:'old',kind:'opening',buyerId:'yogo',date:'2026-07-24',amount:1670,reason:'未払い / 未受取',note:'7/24分 未受取'});
  assert.equal(collectionPosition(s,next.id,'yogo').carry,1670);
  s.collectionEntries.push({id:'old-paid',roundId:next.id,buyerId:'yogo',date:next.date,received:1670,adjustment:0,note:'7/24分を受取',itemId:'old'});
  assert.equal(collectionDueItems(s,next.id,'yogo').items.find(x=>x.id==='old').balance,0);
  assert.equal(collectionPosition(s,next.id,'yogo').balance,0);
  assert.equal(Object.keys(sept.orders).length,1);
  assert.equal(validate(s),s);
});
test('堀さんの既知6商品2,130円と追加2点380円を分け、受取0/2,130/2,510を照合',()=>{
  const s=initialState();
  const r=newRound(s,'2026-09-11');s.rounds.push(r);
  r.products=[
    {id:'a',name:'抹茶シフォンケーキ',price:640,category:'焼き菓子'},
    {id:'b',name:'甘夏サンドクッキー',price:490,category:'焼き菓子'},
    {id:'c',name:'ミニブッセ',price:460,category:'焼き菓子'},
    {id:'d',name:'パン・オ・レザン',price:180,category:'パン'},
    {id:'e',name:'メロンパン',price:170,category:'パン'},
    {id:'f',name:'紅茶メロンパン',price:190,category:'パン'},
    {id:'donut',name:'ツイストドーナツ 2個入り',price:190,cost:156,category:'パン'},
  ];
  r.orders.hori={name:'堀',quantities:{a:1,b:1,c:1,d:1,e:1,f:1,donut:2}};
  s.receivableItems.push({id:'late-donut',kind:'additional',buyerId:'hori',roundId:r.id,date:r.date,amount:380,notifiedAmount:2130,reason:'商品請求漏れ',note:'9/11 ツイストドーナツ 2個入り ×2 請求漏れ'});
  assert.equal(orderAmount(r,r.orders.hori),2510);
  assert.equal(collectionPosition(s,r.id,'hori').balance,2510);
  assert.deepEqual(collectionDueItems(s,r.id,'hori').items.map(x=>x.balance),[2130,380]);
  s.collectionEntries.push({id:'bag',roundId:r.id,buyerId:'hori',date:r.date,received:2130,adjustment:0,note:'当初の袋'});
  assert.equal(collectionPosition(s,r.id,'hori').balance,380);
  assert.deepEqual(collectionDueItems(s,r.id,'hori').items.map(x=>x.balance),[0,380]);
  s.collectionEntries.push({id:'late',roundId:r.id,buyerId:'hori',date:r.date,received:380,adjustment:0,note:'追加分'});
  assert.equal(collectionPosition(s,r.id,'hori').balance,0);
  assert.equal(validate(s),s);
});
test('9/11試験回を年度集計から除外したまま集金のみ次の通常回へ引き継ぐ',()=>{
  const {s,sept,next}=setup();
  sept.test=true;sept.collectionLive=true;
  assert.equal(collectionPosition(s,next.id,'hori').carry,810);
  assert.equal(collectionPosition(s,next.id,'hori').balance,1240);
});
test('支払済みと確認した過去回は未収の予定額に再加算しない',()=>{
  const {s,sept,next}=setup();
  s.buyers.push({id:'yogo',name:'余語',active:true,fixed:[]});
  sept.orders.yogo={name:'余語',quantities:{brown:1}};
  s.receivableItems.push({id:'old',kind:'opening',buyerId:'yogo',date:'2026-07-24',amount:1670,reason:'未払い / 未受取',note:'7/24分 未受取'});
  s.collectionReconciliations.push({id:'confirmed',buyerId:'yogo',roundId:sept.id,amount:430,note:'9月分支払済み・日付未記録'});
  assert.equal(collectionPosition(s,sept.id,'yogo').confirmedHistorical,430);
  assert.equal(collectionPosition(s,sept.id,'yogo').balance,1670);
  assert.equal(collectionPosition(s,next.id,'yogo').carry,1670);
  assert.equal(validate(s),s);
});
