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
