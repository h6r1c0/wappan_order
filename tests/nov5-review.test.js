import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,eventClaim,transfer,report,validate,stockRemaining,addSale} from '../src/domain.js';
import {saveSnackSection,confirmSnackPlan,snackQuantityRows,savedFiscalAmount,suggestedGroupPrice} from '../src/snack-billing.js';
import {snackOrderQuantities,setSnackOrderQuantities} from '../src/commerce.js';
import {transferStockToSnack} from '../src/snack-transfer.js';
import {confirmSourceStockCost,correctSourceStockCost} from '../src/stock-cost.js';

function scenario(){
 const s=initialState(),r=newRound(s,'2026-10-16');s.rounds.push(r);
 s.buyers.push({id:'household-test',name:'隔離家庭',kana:'かてい',active:true,fixed:[]});
 const e={id:'snack-test',roundId:r.id,date:r.date,name:'おやつ用',entryMode:'round',test:r.test,lines:[
  {id:'bean',name:'こしあんぱん',qty:26,used:0,cost:130},
  {id:'apple',name:'りんごデニッシュ',qty:19,used:0,cost:151},
  {id:'white',name:'白パン',qty:16,used:0,cost:95},
 ]};s.events.push(e);r.eventIds.push(e.id);return {s,r,e};
}

test('実使用は財政請求ではない。26/22/4、19/16/3、16/11/5を4区分で保存して再読込する',()=>{
 const {s,r,e}=scenario();
 e.lines[0].used=4;e.lines[1].used=4; // 旧画面の記録を監査原本として保持
 assert.equal(eventClaim(e),null);
 saveSnackSection(s,e.id,'fiscal',[{lineId:'bean',qty:4},{lineId:'apple',qty:4}]);
 assert.equal(eventClaim(e),null);
 assert.equal(savedFiscalAmount(e),1124);
 for(const [id,qty] of [['bean',4],['apple',3],['white',5]])transfer(s,e,e.lines.find(l=>l.id===id),qty,200,r.date);
 saveSnackSection(s,e.id,'direct',[
  {buyerId:'household-test',lineId:'bean',qty:2,unitPrice:150},
  {buyerId:'household-test',lineId:'apple',qty:2,unitPrice:150},
  {buyerId:'household-test',lineId:'white',qty:11,unitPrice:150},
 ]);
 const group={id:'common-test',label:'共通単価',lineIds:['bean','apple'],quantities:{bean:16,apple:10},unitPrice:150};
 saveSnackSection(s,e.id,'common',{groups:[group],household:[{buyerId:'household-test',groupId:group.id,lineId:null,qty:26,unitPrice:150}]});
 const saved=structuredClone(s);const fresh=saved.events[0];
 assert.deepEqual(snackQuantityRows(saved,fresh).map(x=>[x.ordered,x.used,x.retail,x.unassigned,x.unused]),[[26,22,4,0,0],[19,16,3,0,0],[16,11,5,0,0]]);
 assert.equal(fresh.snackDraft.household.length,4);
 assert.equal(eventClaim(fresh),null);
 confirmSnackPlan(saved,fresh.id);
 assert.equal(eventClaim(fresh),1124);
 assert.deepEqual(fresh.lines.map(x=>x.used),[4,4,0]);
 assert.equal(report(saved,r.date,r.date,2026,{includeTest:true}).rows.find(x=>x.id==='snack:snack-test').revenue,6150);
 assert.equal(validate(saved),saved);
});

test('用途指定と販売振替が実入荷を超えたら請求だけ拒否し、保存済み区分・余剰振替を保持する',()=>{
 const {s,r,e}=scenario();
 transfer(s,e,e.lines[0],4,200,r.date);
 saveSnackSection(s,e.id,'fiscal',[{lineId:'bean',qty:4}]);
 saveSnackSection(s,e.id,'direct',[{buyerId:'household-test',lineId:'bean',qty:19,unitPrice:150}]);
 const copy=structuredClone(s);
 assert.throws(()=>confirmSnackPlan(s,e.id),/残数を1個超え/);
 assert.deepEqual(s,copy);
 assert.equal(s.stocks.find(st=>st.eventLineId==='bean').qty,4);
 assert.equal(e.snackDraft.household[0].qty,19);
});

test('用途別数量から実使用を導き、残り2個を勝手に共通単価へ割り当てない',()=>{
 const {s,r,e}=scenario();
 for(const [id,qty] of [['bean',4],['apple',3],['white',5]])transfer(s,e,e.lines.find(l=>l.id===id),qty,200,r.date);
 saveSnackSection(s,e.id,'fiscal',[{lineId:'bean',qty:4},{lineId:'apple',qty:4}]);
 saveSnackSection(s,e.id,'direct',[
  {buyerId:'household-test',lineId:'bean',qty:7,unitPrice:130},
  {buyerId:'household-test',lineId:'white',qty:9,unitPrice:95},
 ]);
 const group={id:'common',label:'共通',lineIds:['bean','apple'],quantities:{bean:11,apple:12},unitPrice:150,priceMode:'auto'};
 assert.equal(suggestedGroupPrice(e,group),150);
 assert.equal(11*130+12*151,3242);
 saveSnackSection(s,e.id,'common',{groups:[group],household:[{buyerId:'household-test',groupId:'common',qty:23,unitPrice:150}]});
 assert.deepEqual(snackQuantityRows(s,e).map(x=>[x.used,x.retail,x.unassigned]),[[22,4,0],[16,3,0],[9,5,2]]);
 assert.deepEqual(e.lines.map(x=>x.used),[0,0,0]);
 group.unitPrice=160;group.priceMode='manual';
 saveSnackSection(s,e.id,'common',{groups:[group],household:[{buyerId:'household-test',groupId:'common',qty:23,unitPrice:160}]});
 assert.equal(e.snackDraft.groups[0].unitPrice,160);
 assert.equal(snackQuantityRows(s,e)[2].unassigned,2);
});

test('注文時の用途に納品後の販売用からの振替を混ぜず、注文数量の編集で振替行を保護',()=>{
 const {s,r,e}=scenario();
 const productId=r.products[0].id;e.lines[0].productId=productId;
 const stock={id:'source',roundId:r.id,productId,name:'甘夏ゼリー',qty:2,price:220,cost:130,date:r.date,test:e.test};
 s.stocks.push(stock);r.stockIds.push(stock.id);
 const moved=transferStockToSnack(s,stock.id,e.id,1);
 assert.equal(moved.sourceStockId,stock.id);
 assert.equal(snackQuantityRows(s,e).find(x=>x.line.id===moved.id).ordered,0);
 assert.equal(snackOrderQuantities(s,r.id)[productId],26);
 const snapshot=structuredClone(moved);
 setSnackOrderQuantities(s,r.id,{[productId]:26});
 assert.deepEqual(e.lines.find(x=>x.id===moved.id),snapshot);
 assert.equal(snackOrderQuantities(s,r.id)[productId],26);
});

test('元の原価は未確定から一度だけ確認し、訂正理由と履歴を残して振替先・販売原価へ連動',()=>{
 const {s,r,e}=scenario();const st={id:'jelly',roundId:r.id,name:'甘夏ゼリー',qty:3,price:270,cost:null,date:r.date,test:r.test};
 s.stocks.push(st);r.stockIds.push(st.id);const line=transferStockToSnack(s,st.id,e.id,1);
 saveSnackSection(s,e.id,'fiscal',[{lineId:line.id,qty:1}]);
 assert.equal(savedFiscalAmount(e),null);assert.equal(eventClaim(e),null);
 const before=stockRemaining(s,st);
 confirmSourceStockCost(s,st.id,70);
 assert.equal(line.cost,70);assert.equal(savedFiscalAmount(e),70);assert.equal(stockRemaining(s,st),before);
 assert.throws(()=>confirmSourceStockCost(s,st.id,70),/未確定/);
 addSale(s,st,{qty:1,date:r.date,price:270,destinationType:'external',paymentStatus:'paid'});
 assert.throws(()=>correctSourceStockCost(s,st.id,80,''),/理由/);
 correctSourceStockCost(s,st.id,80,'仕入伝票を確認して訂正');
 assert.equal(st.costHistory.length,2);assert.equal(st.costHistory.at(-1).previous,70);
 assert.equal(s.sales.find(x=>x.stockId===st.id).cost,80);assert.equal(line.cost,80);
 assert.equal(savedFiscalAmount(e),80);assert.equal(stockRemaining(s,st),before-1);
 confirmSnackPlan(s,e.id);assert.equal(eventClaim(e),80);
 assert.equal(validate(s),s);
});
