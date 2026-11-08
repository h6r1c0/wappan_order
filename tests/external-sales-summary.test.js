import test from 'node:test';import assert from 'node:assert/strict';
import {externalSalesSummary} from '../src/external-sales-summary.js';
test('外部販売は個人請求と混ぜず保存済みの数量・価格だけを集計する',()=>{
 const state={stocks:[{id:'lot',name:'パン'}],sales:[
  {stockId:'lot',chargeRoundId:'round',qty:2,price:700,destinationType:'external',paymentStatus:'paid',destinationName:'マルシェ'},
  {stockId:'lot',chargeRoundId:'round',qty:3,price:700,destinationType:'buyer',paymentStatus:'later'},
  {stockId:'lot',chargeRoundId:'round',qty:1,price:700,destinationType:'external',paymentStatus:'paid',void:true}
 ],otherSales:[]};
 assert.deepEqual(externalSalesSummary(state,{id:'round',date:'2026-10-16',test:false}),{total:1400,lines:[{name:'パン',qty:2,unitPrice:700,place:'マルシェ',amount:1400}]});
});
