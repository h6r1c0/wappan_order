import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,validate} from '../src/domain.js';
import {parseBatchOrder,applyBatchOrder,addSpecialProduct} from '../src/batch-import.js';
import {importDifference} from '../src/product-import-diff.js';

test('1個入りを3個入りへ誤照合せず、確認済みだけ保存し未解決行を保持・再開する',()=>{
  const s=initialState(),r=newRound(s,'2026-10-16');s.rounds.push(r);
  r.products.push({id:'three',name:'天然酵母ハイジの白パン 3個',price:350});
  let rows=parseBatchOrder('ホリ\n黒糖ブレッド 1\n天然酵母ハイジの白パン・1個入り 16',s,r);
  assert.equal(rows[1].productId,'');
  rows=rows.map(x=>({...x,held:!x.productId}));
  assert.equal(applyBatchOrder(s,r.id,rows),1);validate(s);
  assert.equal(r.orders.hori.quantities.brown,1);
  assert.equal(r.pendingImports.length,1);
  assert.equal(r.pendingImports[0].qty,16);
  assert.equal(r.pendingImports[0].raw,'天然酵母ハイジの白パン・1個入り 16');
  assert.equal(r.orders.hori.quantities.three,undefined);
  // 再貼付しても保存済みの商品は二重登録しない。
  assert.equal(applyBatchOrder(s,r.id,rows),0);
  assert.equal(r.pendingImports.length,1);
  const id=addSpecialProduct(s,r.id,'天然酵母ハイジの白パン・1個入り',120);
  assert.equal(s.products.find(x=>x.id===id).gross,null);
  assert.equal(r.products.find(x=>x.id===id).price,120);
  assert.throws(()=>addSpecialProduct(s,r.id,'天然酵母ハイジの白パン・1個入り',120),/登録済み/);
  const pending=r.pendingImports[0];
  const resolved={...pending,pendingId:pending.id,productId:id,held:false};
  assert.equal(applyBatchOrder(s,r.id,[resolved]),1);validate(s);
  assert.equal(r.orders.hori.quantities[id],16);
  assert.equal(r.pendingImports.length,0);
  assert.equal(r.orders.hori.quantities.three,undefined);
});

test('価格差分は同規格の継続品と包装違いを区別する',()=>{
  const previous=[{name:'定番パン',gross:538,category:'パン',section:'定番'}, {name:'天然酵母ハイジの白パン 3個',gross:356,category:'パン',section:'酵母パン'}, {name:'終了品',gross:200,category:'パン',section:''}];
  const current=[{name:'定番パン',gross:550,category:'パン',section:'定番',include:true},{name:'天然酵母ハイジの白パン 1個',gross:120,category:'パン',section:'酵母パン',include:true}];
  const diff=importDifference(current,previous);
  assert.equal(diff.changes[0].kind,'up');
  assert.equal(diff.changes[1].kind,'changed');
  assert.deepEqual(diff.removed.map(x=>x.name),['終了品']);
});
