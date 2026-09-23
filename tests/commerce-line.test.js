import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,addSale,assignSalesToBuyer,collections,report,stockRemaining,transfer,updateSaleDestination,validate} from '../src/domain.js';
import {delivery,upgrade,moveStock,sellBundle,marketTotals,deliveryTotals,salesOrderQuantities,setSalesOrderQuantities,snackOrderQuantities,setSnackOrderQuantities} from '../src/commerce.js';
import {destinationCandidate,looksLikePersonalName,parseLineOrder} from '../src/line-import.js';

function setup(){
 const s=initialState();s.products.forEach(p=>{if(p.gross==null&&p.manual==null)p.gross=394});
 const r=newRound(s,'2026-09-11',false);s.rounds.push(r);upgrade(s);return {s,r};
}

test('1納品回に個人・販売用・おやつ用を統合し、販売場所の変更は追加仕入にしない',()=>{
 const {s,r}=setup();r.orders.hori={name:'ホリ',quantities:{milk:1}};
 const onsite={id:'on',productId:'galette',name:'ガレット',category:'焼き菓子',qty:3,price:390,cost:250,date:r.date,test:false,roundId:r.id,channel:'onsite',depth:0,eventId:null,eventLineId:null};s.stocks.push(onsite);
 const e={id:'event',name:'行事',date:r.date,test:false,roundId:r.id,lines:[{id:'line',productId:'walnut',name:'くるみパン',category:'パン',qty:20,used:18,cost:138}]};s.events.push(e);
 const market={id:'market',name:'秋マルシェ',date:r.date,place:'園庭',expense:null,expenseMode:'reference',roundId:r.id};s.markets.push(market);
 const ext=moveStock(s,onsite,2,market.id,420);upgrade(s);
 const totals=deliveryTotals(s,r);
 assert.equal(totals.find(x=>x.name==='ガレット').qty,3);
 assert.deepEqual(totals.find(x=>x.name==='ガレット'),{id:'galette',name:'ガレット',personal:0,sales:3,snack:0,onsite:3,event:0,external:0,qty:3});
 assert.equal(totals.find(x=>x.name==='くるみパン').snack,20);
 assert.equal(stockRemaining(s,onsite),1);assert.equal(stockRemaining(s,ext),2);validate(s);
});

test('3区分の共通数量入力を同じ納品回へ保存し、発注数を一度だけ合算する',()=>{
 const {s,r}=setup();
 r.orders.hori={name:'ホリ',quantities:{walnut:8}};
 setSalesOrderQuantities(s,r.id,{walnut:10,galette:3});
 setSnackOrderQuantities(s,r.id,{walnut:20,bean:20});
 assert.deepEqual(salesOrderQuantities(s,r.id),{walnut:10,galette:3});
 assert.deepEqual(snackOrderQuantities(s,r.id),{walnut:20,bean:20});
 const walnut=deliveryTotals(s,r).find(x=>x.id==='walnut');
 assert.deepEqual({personal:walnut.personal,sales:walnut.sales,snack:walnut.snack,qty:walnut.qty},{personal:8,sales:10,snack:20,qty:38});
 assert.equal(s.events[0].lines.find(x=>x.productId==='walnut').cost,138);
 assert.equal(s.stocks.find(x=>x.productId==='galette').price,390);
 setSalesOrderQuantities(s,r.id,{walnut:0,galette:0});
 setSnackOrderQuantities(s,r.id,{walnut:0,bean:0});
 assert.equal(deliveryTotals(s,r).find(x=>x.id==='walnut').qty,8);
 validate(s);
});

test('共通数量の再編集は販売済み・使用済み・振替済みの数量を壊さない',()=>{
 const {s,r}=setup();
 setSalesOrderQuantities(s,r.id,{galette:3});
 const stock=s.stocks.find(x=>x.productId==='galette');
 addSale(s,stock,{date:r.date,qty:2,destinationType:'external',destinationName:'園内',paymentStatus:'paid'});
 assert.throws(()=>setSalesOrderQuantities(s,r.id,{galette:1}),/2個を販売・セット使用済み/);
 setSalesOrderQuantities(s,r.id,{galette:2});
 assert.equal(stockRemaining(s,stock),0);
 setSnackOrderQuantities(s,r.id,{walnut:20});
 const event=s.events[0],line=event.lines[0];line.used=18;
 transfer(s,event,line,2,200,r.date);upgrade(s);
 assert.throws(()=>setSnackOrderQuantities(s,r.id,{walnut:19}),/20個未満/);
 setSnackOrderQuantities(s,r.id,{walnut:20});
 assert.equal(deliveryTotals(s,r).find(x=>x.id==='walnut').snack,20);
 validate(s);
});

test('販売場所・外部名称・支払状態・任意単価と個人追加請求を分離する',()=>{
 const {s,r}=setup(),m={id:'m',name:'秋マルシェ',date:r.date,place:'',expense:null,expenseMode:'reference',roundId:r.id};s.markets.push(m);
 const st={id:'s',name:'パンのカリカリ',category:'焼き菓子',qty:4,price:390,cost:260,date:r.date,test:false,roundId:r.id,channel:'external',marketId:m.id,depth:0,eventId:null,eventLineId:null};s.stocks.push(st);upgrade(s);
 addSale(s,st,{date:r.date,qty:1,price:420,salePlace:'手話タイム',marketId:m.id,destinationType:'external',destinationName:'手話タイム',paymentStatus:'unconfirmed'});
 addSale(s,st,{date:r.date,qty:1,price:410,destinationType:'buyer',buyerId:'hori',paymentStatus:'later',chargeRoundId:r.id});
 addSale(s,st,{date:r.date,qty:1,price:400,destinationType:'unknown',paymentStatus:'unconfirmed'});
 assert.equal(s.externalDestinations.includes('手話タイム'),true);assert.equal(stockRemaining(s,st),1);
 assert.equal(s.sales[0].salePlace,'手話タイム');
 assert.equal(collections(s,'','',r.id)[0].total,410);
 assert.deepEqual(marketTotals(s,m),{revenue:1230,cost:780,baseProfit:450,profit:450,expenseUnknown:true,expenseApplied:false});
 validate(s);
});

test('マルシェセットは構成商品の残数と原価を引き継ぎ、経費は明示時だけ差し引く',()=>{
 const {s,r}=setup(),m={id:'m',name:'販売会',date:r.date,place:'',expense:null,expenseMode:'reference',roundId:r.id};s.markets.push(m);
 for(const [id,name,cost] of [['a','パンA',200],['b','焼き菓子',150]])s.stocks.push({id,name,qty:10,price:390,cost,date:r.date,test:false,roundId:r.id,channel:'external',marketId:m.id,depth:0,eventId:null,eventLineId:null});
 const b={id:'set',marketId:m.id,name:'お楽しみセット',price:1000,components:[{stockId:'a',qty:1},{stockId:'b',qty:1}]};s.bundles.push(b);upgrade(s);
 sellBundle(s,b,3,r.date,{destinationType:'external',destinationName:'手話タイム',paymentStatus:'paid'});
 assert.equal(stockRemaining(s,s.stocks[0]),7);assert.equal(marketTotals(s,m).revenue,3000);assert.equal(marketTotals(s,m).cost,1050);assert.equal(marketTotals(s,m).profit,1950);
 m.expense=500;assert.equal(marketTotals(s,m).profit,1950);m.expenseMode='apply';assert.equal(marketTotals(s,m).profit,1450);
 assert.equal(report(s,'2026-04-01','2027-03-31',2026).profit,1450);validate(s);
});

test('手話タイムは個人へ推測せず外部候補、LINE注文は販売済みにしない',()=>{
 const {s,r}=setup();
 assert.deepEqual(destinationCandidate('手話タイム',s),{type:'external',label:'手話タイム',confidence:'candidate'});
 const parsed=parseLineOrder('手話タイム\nカリカリ1',s,{...r,products:[{id:'p',name:'パンのカリカリ',price:390}]});
 assert.equal(parsed.unread[0].destinationCandidate.type,'external');assert.equal(parsed.products[0].qty,1);assert.equal(s.sales.length,0);
});

test('行事余剰を販売へ移しても財政請求と仕入原価を二重計上しない',()=>{
 const {s,r}=setup(),e={id:'e',name:'行事',date:r.date,test:false,roundId:r.id,lines:[{id:'l',name:'くるみパン',category:'パン',qty:20,used:18,cost:138}]};s.events.push(e);upgrade(s);
 transfer(s,e,e.lines[0],2,200,r.date);upgrade(s);const st=s.stocks.at(-1);
 addSale(s,st,{date:r.date,qty:2,destinationType:'external',destinationName:'手話タイム',paymentStatus:'paid'});
 assert.equal(18*138,2484);assert.equal(report(s,'2026-04-01','2027-03-31',2026).profit,124);validate(s);
});


test('LINE個人注文は未登録の氏名だけを追加候補にし、団体名は購入者にしない',()=>{
 const {s,r}=setup();
 const personal=parseLineOrder('山田　花子\nカリカリ1\n黒糖1',s,r);
 assert.equal(personal.suggestedBuyerName,'山田 花子');
 assert.equal(personal.products.length,2);
 assert.equal(looksLikePersonalName('山田花子'),true);
 const external=parseLineOrder('手話タイム\nカリカリ1',s,r);
 assert.equal(external.suggestedBuyerName,'');
 assert.equal(looksLikePersonalName('手話タイム'),false);
});

test('未確認販売の一括割り当ては在庫・売上・原価を変えず個人請求だけを更新する',()=>{
 const {s,r}=setup();
 const st={id:'pending-stock',productId:'galette',name:'ガレット',category:'焼き菓子',qty:3,price:390,cost:250,date:r.date,test:false,roundId:r.id,channel:'sales',depth:0,eventId:null,eventLineId:null};
 s.stocks.push(st);
 addSale(s,st,{date:r.date,qty:1,destinationType:'unknown',paymentStatus:'unconfirmed'});
 addSale(s,st,{date:r.date,qty:1,destinationType:'unknown',paymentStatus:'unconfirmed'});
 const saleIds=s.sales.map(x=>x.id),beforeReport=report(s,'2026-04-01','2027-03-31',2026),beforeRemaining=stockRemaining(s,st);
 assignSalesToBuyer(s,saleIds,'hori',r.id);
 assert.equal(s.sales.length,2);
 assert.equal(stockRemaining(s,st),beforeRemaining);
 assert.deepEqual(report(s,'2026-04-01','2027-03-31',2026),beforeReport);
 assert.equal(collections(s,'','',r.id).find(x=>x.id==='hori').onsite,780);
 assert.ok(s.sales.every(x=>x.destinationType==='buyer'&&!x.pending&&x.paymentStatus==='later'));
 updateSaleDestination(s,saleIds[0],{destinationType:'external',destinationName:'手話タイム',paymentStatus:'unconfirmed'});
 assert.equal(collections(s,'','',r.id).find(x=>x.id==='hori').onsite,390);
 assert.equal(stockRemaining(s,st),beforeRemaining);
 validate(s);
});
