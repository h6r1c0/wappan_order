import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,validate} from '../src/domain.js';
import {salesOrderQuantities,snackOrderQuantities} from '../src/commerce.js';
import {parseBatchOrder,applyBatchOrder} from '../src/batch-import.js';
import {productCandidates,samePack} from '../src/line-import.js';

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
test('名前：商品数量のLINE形式を購入者別に分ける',()=>{
 const {s,r}=fixture();
 const rows=parseBatchOrder('ホリ：黒糖ブレッド 2\n浅野：ミルクスティックパン ×1',s,r);
 assert.deepEqual(rows.map(x=>[x.buyerId,x.productId,x.qty]),[['hori','brown',2],['asano','milk',1]]);
});
test('保留一行を除外するだけで確定し、注文や固定注文は変わらない',()=>{
 const {s,r}=fixture();r.pendingImports=[{id:'pending',raw:'浅野',productName:'浅野',qty:0,kind:'personal',buyerId:''}];
 const before=structuredClone(r.orders);
 assert.equal(applyBatchOrder(s,r.id,[{...r.pendingImports[0],pendingId:'pending',ignored:true,held:true}]),0);
 assert.equal(r.pendingImports.length,0);assert.deepEqual(r.orders,before);validate(s);
});
test('商品候補は表記揺れと括弧の包装単位を扱い、曖昧な商品を自動確定しない',()=>{
 const {s,r}=fixture();
 r.products.push({id:'bread2',name:'くるみパン 2個入り',price:240,cost:130});
 r.products.push({id:'bread3',name:'くるみパン 3個入り',price:340,cost:190});
 assert.equal(samePack('くるみパン(2)',r.products.at(-1)),false);
 const row=parseBatchOrder('販売用\nくるみパン(2) 1',s,r)[0];
 assert.equal(row.qty,1);assert.equal(row.productId,'');
 assert.equal(row.options[0].id,'bread2');
 assert.equal(row.options.some(p=>p.id==='bread3'),false);
 assert.ok(productCandidates('ゆだね食パン',r.products).length<=5);
});
