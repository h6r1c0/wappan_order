import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,report,collections,collectionPosition,validate,stockRemaining} from '../src/domain.js';
import {saveOtherSale,replaceOtherAllocations,otherAllocationNeedsReason} from '../src/other-sales.js';
import {saveSnackSection,confirmSnackPlan,snackBillingPreview} from '../src/snack-billing.js';
import {transferStockToSnack} from '../src/snack-transfer.js';
import {confirmSourceStockCost} from '../src/stock-cost.js';

function fixture(){
 const s=initialState(),r=newRound(s,'2026-10-16',true);s.rounds.push(r);
 for(let i=0;i<5;i++)s.buyers.push({id:'qa-'+i,name:'検証家庭'+i,active:true,testOnly:false,fixed:[]});
 return {s,r};
}
test('レモン8個を1個から7個追加・一括8個の両経路で保存し、訂正だけ理由を求める',()=>{
 for(const split of [true,false]){
  const {s,r}=fixture(),item=saveOtherSale(s,{name:'隔離レモン',date:r.date,qty:8,unitPrice:120,unitCost:0,paymentStatus:'unpaid',test:true});
  const before=report(s,r.date,r.date,2026,{includeTest:true});
  if(split)replaceOtherAllocations(s,item.id,[{buyerId:'qa-0',qty:1}],'新しい購入者への追加割当');
  const rows=[{buyerId:'qa-0',qty:1},{buyerId:'qa-1',qty:2},{buyerId:'qa-2',qty:3},{buyerId:'qa-3',qty:2}];
  assert.equal(otherAllocationNeedsReason(item,rows),false);
  replaceOtherAllocations(s,item.id,rows,'新しい購入者への追加割当');
  const saved=structuredClone(s);
  assert.equal(saved.otherSales[0].allocations.reduce((n,x)=>n+x.qty,0),8);
  assert.deepEqual(saved.otherSales[0].allocations.map(x=>x.qty),[1,2,3,2]);
  assert.equal(report(s,r.date,r.date,2026,{includeTest:true}).revenue,before.revenue);
  assert.equal(collectionPosition(s,r.id,'qa-2').current,360);
  assert.equal(collections(s,'','',r.id,true).find(x=>x.id==='qa-3').onsite,240);
  assert.throws(()=>replaceOtherAllocations(s,item.id,[{buyerId:'qa-0',qty:2},{buyerId:'qa-1',qty:2},{buyerId:'qa-2',qty:2},{buyerId:'qa-3',qty:2}]),/変更・取消する理由/);
  assert.deepEqual(s.otherSales[0].allocations,saved.otherSales[0].allocations);
  replaceOtherAllocations(s,item.id,[{buyerId:'qa-0',qty:2},{buyerId:'qa-1',qty:2},{buyerId:'qa-2',qty:2},{buyerId:'qa-3',qty:2}],'本人確認による訂正');
  assert.equal(item.history.at(-1).reason,'本人確認による訂正');
  validate(s);
 }
});
test('白パンを複数家庭へ1・2個で途中保存し、他の区分と確定請求を保持する',()=>{
 const {s,r}=fixture();const e={id:'qa-snack',roundId:r.id,date:r.date,name:'隔離おやつ',test:true,lines:[{id:'bread',name:'白パン',qty:8,used:0,cost:90,usedConfirmed:true}]};s.events.push(e);r.eventIds.push(e.id);
 saveSnackSection(s,e.id,'fiscal',[{lineId:'bread',qty:1}]);
 saveSnackSection(s,e.id,'direct',[{lineId:'bread',buyerId:'qa-0',qty:1,unitPrice:120},{lineId:'bread',buyerId:'qa-1',qty:2,unitPrice:120},{lineId:'bread',buyerId:'qa-2',qty:1,unitPrice:120}]);
 assert.equal(e.billing,undefined);assert.equal(collectionPosition(s,r.id,'qa-1').current,0);
 const reloaded=structuredClone(s);assert.equal(reloaded.events[0].snackDraft.household.reduce((n,x)=>n+x.qty,0),4);
 assert.equal(reloaded.events[0].snackDraft.fiscal[0].qty,1);
 e.lines[0].used=5; // 本人が用途指定と別に実使用を確認した場合
 confirmSnackPlan(s,e.id);assert.equal(snackBillingPreview(s,e).fiscal,90);
 assert.equal(collectionPosition(s,r.id,'qa-1').current,240);validate(s);
});
test('振替済みゼリーの未確定原価だけ元商品から確定し、財政・年度へ連動する',()=>{
 const {s,r}=fixture();r.orders['qa-0']={name:'検証家庭0',quantities:{}};r.invoice=300;const e={id:'qa-snack',roundId:r.id,date:r.date,name:'隔離おやつ',test:true,lines:[]};s.events.push(e);r.eventIds.push(e.id);
 const stock={id:'qa-jelly',roundId:r.id,date:r.date,name:'隔離ゼリー',qty:2,price:200,cost:null,test:true};s.stocks.push(stock);r.stockIds.push(stock.id);
 const line=transferStockToSnack(s,stock.id,e.id,1);saveSnackSection(s,e.id,'fiscal',[{lineId:line.id,qty:1}]);
 assert.throws(()=>confirmSnackPlan(s,e.id),/仕入単価/);
 const priorHistory=structuredClone(e.stockTransferHistory),remaining=stockRemaining(s,stock);
 confirmSourceStockCost(s,stock.id,75);
 assert.equal(line.cost,75);assert.equal(stockRemaining(s,stock),remaining);assert.deepEqual(e.stockTransferHistory,priorHistory);
 confirmSnackPlan(s,e.id);assert.equal(snackBillingPreview(s,e).fiscal,75);
 assert.equal(report(s,r.date,r.date,2026,{includeTest:true}).cost>=75,true);
 assert.equal(stock.costHistory.at(-1).updated,75);validate(s);
});
