import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,addSale,collections,collectionPosition,validate} from '../src/domain.js';
import {saleIntent,savedSaleIntent} from '../src/sale-save-recovery.js';

test('過去未収を残した購入者へ別注文回の販売を保存し、応答喪失後も二重登録しない',()=>{
 const before=initialState(),old=newRound(before,'2026-10-16',true),round=newRound(before,'2026-10-30',true);
 before.rounds.push(old,round);
 const stock={id:'test-stock',roundId:round.id,date:round.date,name:'パン',qty:5,price:450,cost:200,test:true};
 before.stocks.push(stock);round.stockIds.push(stock.id);
 const saved=structuredClone(before);
 addSale(saved,saved.stocks[0],{qty:2,date:round.date,buyerId:'hori',destinationType:'buyer',paymentStatus:'later',chargeRoundId:round.id});
 addSale(saved,saved.stocks[0],{qty:1,date:round.date,buyerId:'hori',destinationType:'buyer',paymentStatus:'later',chargeRoundId:round.id});
 validate(saved);
 const intent=saleIntent(before,saved);
 assert.equal(savedSaleIntent(saved,intent),true);
 assert.equal(savedSaleIntent(before,intent),false);
 const loaded=structuredClone(saved);
 assert.equal(collections(loaded,'','',round.id,true).find(b=>b.id==='hori').onsite,1350);
 assert.equal(collections(loaded,'','',old.id,true).find(b=>b.id==='hori')?.onsite||0,0);
 assert.equal(collectionPosition(loaded,round.id,'hori').current,1350);
 assert.equal(loaded.sales.length,2);
 assert.throws(()=>addSale(loaded,stock,{qty:1,date:round.date,buyerId:'hori',destinationType:'buyer',paymentStatus:'later'}),/注文回/);
});
