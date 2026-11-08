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
test('その他商品の個人1個・外部1個は外部の1個だけ集金表示へ出す',()=>{
 const round={id:'r',date:'2026-10-30',test:true};
 const state={stocks:[],sales:[],otherSales:[{date:round.date,test:true,qty:2,unitPrice:100,paymentStatus:'unpaid',paidExternalQty:1,allocations:[{buyerId:'a',qty:1,chargeRoundId:'r'}],name:'青レモン'}]};
 assert.equal(externalSalesSummary(state,round).total,100);
});
