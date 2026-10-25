import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,price,validate} from '../src/domain.js';
import {estimatePrice} from '../src/price-estimate.js';
import {parseBatchOrder,applyBatchOrder} from '../src/batch-import.js';

test('注文回作成時の固定注文は数量・価格未確定を一体で保持し、マスター変更後も変わらない',()=>{
 const s=initialState(),r=newRound(s,'2026-11-12',false,true);s.rounds.push(r);
 assert.equal(r.orders.asano.quantities.brown,1);
 assert.equal(r.orders.hori.quantities.donut,2);
 assert.equal(r.products.find(p=>p.id==='donut').price,null);
 s.buyers.find(b=>b.id==='hori').fixed[1].qty=3;
 assert.equal(r.orders.hori.quantities.donut,2);
 assert.equal(newRound(s,'2026-11-26',false,true).orders.hori.quantities.donut,3);
 validate(s);
});
test('既存固定注文を一括取込が重複しない',()=>{
 const s=initialState(),r=newRound(s,'2026-10-16',false,true);s.rounds.push(r);
 const rows=parseBatchOrder('浅野\n黒糖ブレッド 1',s,r);
 assert.throws(()=>applyBatchOrder(s,r.id,rows),/登録済み/);
 assert.equal(r.orders.asano.quantities.brown,1);
});
test('実商品からの価格候補は未知商品を除いた検証精度を要件とし、不足時は出さない',()=>{
 const s=initialState();assert.equal(estimatePrice(s.products,130),null);
 const products=Array.from({length:20},(_,i)=>({name:`既知${i}`,cost:120+i*11,gross:Math.round((120+i*11)*1.25)}));
 const suggestion=estimatePrice(products,156);
 assert.equal(suggestion.price,190);assert.equal(suggestion.count,20);
 assert.ok(suggestion.exact>=18);
 assert.equal(price({mode:'manual',manual:suggestion.price,gross:null}),190);
 assert.equal(estimatePrice([...products,{cost:500,gross:2000}],156),null);
});
test('自然な販売・おやつ見出しを商品名と誤認しない',()=>{
 const s=initialState(),r=newRound(s,'2026-11-12');
 const rows=parseBatchOrder('販売用・焼き菓子\nガレット 2\nおやつ用・リハーサル\nガレット 1',s,r);
 assert.deepEqual(rows.map(x=>[x.kind,x.productId,x.qty]),[['sales','galette',2],['snack','galette',1]]);
});
