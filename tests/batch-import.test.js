import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,validate} from '../src/domain.js';
import {salesOrderQuantities,snackOrderQuantities} from '../src/commerce.js';
import {parseBatchOrder,applyBatchOrder} from '../src/batch-import.js';

function fixture(){const s=initialState(),r=newRound(s,'2026-10-16');s.rounds.push(r);return {s,r};}
test('LINEの複数人と販売用・おやつ用を一回の貼り付けで区分し、確認後にだけ保存',()=>{
 const {s,r}=fixture();
 const rows=parseBatchOrder('ホリ\n黒糖ブレッド 2\n浅野\nミルクスティックパン 1\n販売用\n黒糖ブレッド ×3\nおやつ用\nミルクスティックパン 4',s,r);
 assert.deepEqual(rows.map(x=>[x.kind,x.buyerId,x.productId,x.qty]),[['personal','hori','brown',2],['personal','asano','milk',1],['sales','', 'brown',3],['snack','','milk',4]]);
 assert.equal(Object.keys(r.orders).length,0);
 applyBatchOrder(s,r.id,rows);validate(s);
 assert.equal(r.orders.hori.quantities.brown,2);assert.equal(r.orders.asano.quantities.milk,1);
 assert.equal(r.orders.asano.quantities.brown,1); // 既存の固定注文も保持
 assert.equal(salesOrderQuantities(s,r.id).brown,3);assert.equal(snackOrderQuantities(s,r.id).milk,4);
 assert.throws(()=>applyBatchOrder(s,r.id,rows),/取込済み/);
});
test('曖昧な区分や未登録商品は自動確定せず、既存の注文を上書きしない',()=>{
 const {s,r}=fixture(),ambiguous=parseBatchOrder('謎のパン 3',s,r);
 assert.equal(ambiguous[0].kind,'');assert.equal(ambiguous[0].productId,'');
 assert.throws(()=>applyBatchOrder(s,r.id,ambiguous),/確認/);
 r.orders.hori={name:'堀',quantities:{brown:2}};
 const rows=parseBatchOrder('ホリ\n黒糖ブレッド 3',s,r);
 assert.throws(()=>applyBatchOrder(s,r.id,rows),/登録済み/);
 assert.equal(r.orders.hori.quantities.brown,2);
});
test('未登録の購入者名の後に続く商品を直前の購入者へ誤割当しない',()=>{
 const {s,r}=fixture();
 const rows=parseBatchOrder('ホリ\n黒糖ブレッド 1\n山田花子\nミルクスティックパン 2',s,r);
 assert.equal(rows[0].buyerId,'hori');
 assert.equal(rows[1].productId,'');
 assert.equal(rows[2].buyerId,'');
 assert.throws(()=>applyBatchOrder(s,r.id,rows),/確認/);
 assert.equal(Object.keys(r.orders).length,0);
});
