import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,report,collections,validate} from '../src/domain.js';
import {saveOtherSale,voidOtherSale,replaceOtherDistribution} from '../src/other-sales.js';
import {upgrade} from '../src/commerce.js';

test('寄付レモンと原価ありの販売は年度利益に一度だけ入り、パンと個人集金には混ざらない',()=>{
  const s=initialState(),r=newRound(s,'2026-10-16');s.rounds.push(r);
  const before=structuredClone({products:s.products,rounds:s.rounds,stocks:s.stocks,sales:s.sales,adjustments:s.adjustments});
  const lemon=saveOtherSale(s,{name:'花房さん提供のレモン',date:r.date,qty:5,unitPrice:100,unitCost:0,paymentStatus:'paid',note:'寄付品',test:false});
  saveOtherSale(s,{name:'材料あり',date:r.date,qty:2,unitPrice:200,unitCost:80,paymentStatus:'unpaid',test:false});
  assert.equal(report(s,'2026-04-01','2027-03-31',2026).rows.filter(x=>x.type==='その他の販売').reduce((n,x)=>n+x.profit,0),740);
  assert.equal(report(s,'2026-04-01','2027-03-31',2026).rows.find(x=>x.name==='材料あり').provisional,true);
  assert.equal(collections(s,'','',r.id).length,0);
  assert.deepEqual({products:s.products,rounds:s.rounds,stocks:s.stocks,sales:s.sales,adjustments:s.adjustments},before);
  validate(s);
  saveOtherSale(s,{...lemon,qty:3,paymentStatus:'unpaid'},{id:lemon.id,reason:'販売数を訂正'});
  assert.equal(lemon.history.length,1);
  assert.equal(report(s,'2026-04-01','2027-03-31',2026).profit,540);
  voidOtherSale(s,lemon.id,'記録取消');assert.equal(report(s,'2026-04-01','2027-03-31',2026).profit,240);
  validate(s);
  assert.throws(()=>saveOtherSale(s,{name:'誤り',date:r.date,qty:1,unitPrice:100,unitCost:-1,paymentStatus:'paid'}),/原価/);
});

test('旧ワークスペースを読むだけで他販売配列を用意し、試験販売を年度から除く',()=>{
  const s=initialState();delete s.otherSales;upgrade(s);assert.deepEqual(s.otherSales,[]);
  saveOtherSale(s,{name:'試験',date:'2026-10-16',qty:1,unitPrice:100,unitCost:0,paymentStatus:'paid',test:true});
  assert.equal(report(s,'2026-04-01','2027-03-31',2026).profit,0);
});

test('レモン2個の個人請求1個と外部販売1個は一度だけ売上に入り、再読込でも区別する',()=>{
 const s=initialState(),r=newRound(s,'2026-10-30',true);s.rounds.push(r);
 const lemon=saveOtherSale(s,{name:'無農薬青レモン',date:r.date,qty:2,unitPrice:100,unitCost:0,paymentStatus:'unpaid',test:true});
 replaceOtherDistribution(s,lemon.id,[{buyerId:'hori',qty:1}],1,'小松さん相当の個人と外部販売');
 validate(s);
 const loaded=structuredClone(s),bill=collections(loaded,'','',r.id,true).find(x=>x.id==='hori');
 assert.equal(bill.onsite,100);
 const item=report(loaded,'2026-04-01','2027-03-31',2026,{includeTest:true}).rows.find(x=>x.id===lemon.id);
 assert.equal(item.revenue,200);assert.equal(item.profit,200);
 assert.throws(()=>replaceOtherDistribution(loaded,lemon.id,[{buyerId:'hori',qty:1}],0),/理由/);
 assert.equal(loaded.otherSales[0].paidExternalQty,1);
 assert.throws(()=>replaceOtherDistribution(loaded,lemon.id,[{buyerId:'hori',qty:2}],1,'過剰'),/数量/);
 assert.throws(()=>saveOtherSale(loaded,{...lemon,qty:1},{id:lemon.id,reason:'縮小'}),/割当/);
});
