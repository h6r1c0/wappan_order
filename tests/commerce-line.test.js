import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,addSale,assignSalesToBuyer,assignUnknownSale,collections,report,stockRemaining,stockAllocation,transfer,updateSaleDestination,validate} from '../src/domain.js';
import {delivery,upgrade,moveStock,sellBundle,marketTotals,deliveryTotals,salesOrderQuantities,setSalesOrderQuantities,snackOrderQuantities,setSnackOrderQuantities} from '../src/commerce.js';
import {destinationCandidate,looksLikePersonalName,parseLineOrder} from '../src/line-import.js';

function setup(){
 const s=initialState();s.products.forEach(p=>{if(p.gross==null&&p.manual==null)p.gross=394});
 const r=newRound(s,'2026-09-11',false);s.rounds.push(r);upgrade(s);return {s,r};
}

test('新規注文回の仕入単価を固定し、後のマスター変更で販売・おやつ原価を変えない',()=>{
 const {s,r}=setup();
 const walnut=s.products.find(p=>p.id==='walnut');
 assert.equal(r.products.find(p=>p.id==='walnut').cost,138);
 walnut.cost=999;
 setSalesOrderQuantities(s,r.id,{walnut:1});
 setSnackOrderQuantities(s,r.id,{walnut:1});
 assert.equal(s.stocks.find(st=>st.productId==='walnut').cost,138);
 assert.equal(s.events[0].lines.find(line=>line.productId==='walnut').cost,138);
 const next=newRound(s,'2026-10-16');
 assert.equal(next.products.find(p=>p.id==='walnut').cost,999);
 validate(s);
});

test('旧注文回に仕入単価記録がない場合、現在のマスター単価を過去へ推定適用しない',()=>{
 const {s,r}=setup();
 delete r.products.find(p=>p.id==='walnut').cost;
 s.products.find(p=>p.id==='walnut').cost=999;
 setSalesOrderQuantities(s,r.id,{walnut:1});
 assert.equal(s.stocks.find(st=>st.productId==='walnut').cost,null);
 validate(s);
});

test('商品名の「1個」と注文数量を混同せず、割当・未確認・振替・在庫が注文数に一致する',()=>{
 const {s,r}=setup();
 const stock={id:'pkg',productId:'walnut',name:'ライ麦くるみレーズン 1個',category:'パン',qty:2,price:300,cost:200,date:r.date,test:false,roundId:r.id};
 s.stocks.push(stock);
 addSale(s,stock,{date:r.date,qty:2,price:300,destinationType:'unknown',paymentStatus:'unconfirmed'});
 let a=stockAllocation(s,stock);
 assert.deepEqual(a,{ordered:2,assigned:0,unconfirmed:2,remaining:0,moved:0});
 assignUnknownSale(s,s.sales[0].id,1,{destinationType:'external',paymentStatus:'paid',destinationName:''});
 a=stockAllocation(s,stock);
 assert.deepEqual(a,{ordered:2,assigned:1,unconfirmed:1,remaining:0,moved:0});
 assert.equal(a.ordered,a.assigned+a.unconfirmed+a.remaining+a.moved);
 validate(s);
});

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
 const personal=parseLineOrder('山田　花子\nくるみパン\n黒糖ブレッド2',s,r);
 assert.equal(personal.suggestedBuyerName,'山田 花子');
 assert.equal(personal.products.length,2);
 assert.deepEqual(personal.products.map(product=>product.qty),[1,2]);
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

test('未確認2個から1個だけ割り当て、残りを別の購入者へ割り当てても会計を変えない',()=>{
 const {s,r}=setup();
 const st={id:'split-stock',productId:'galette',name:'ガレット',category:'焼き菓子',qty:2,price:390,cost:250,date:r.date,test:false,roundId:r.id,channel:'sales',depth:0,eventId:null,eventLineId:null};
 s.stocks.push(st);addSale(s,st,{date:r.date,qty:2,destinationType:'unknown',paymentStatus:'unconfirmed'});
 const unknownId=s.sales[0].id,beforeReport=report(s,'2026-04-01','2027-03-31',2026),beforeRemaining=stockRemaining(s,st);
 assignSalesToBuyer(s,[{saleId:unknownId,qty:1}],'hori',r.id);
 assert.equal(s.sales.reduce((sum,sale)=>sum+sale.qty,0),2);
 assert.equal(s.sales.find(sale=>sale.id===unknownId).qty,1);
 assert.equal(s.sales.find(sale=>sale.buyerId==='hori').qty,1);
 assert.equal(stockRemaining(s,st),beforeRemaining);
 const afterReport=report(s,'2026-04-01','2027-03-31',2026);
 for(const key of ['revenue','cost','salesProfit','profit'])assert.equal(afterReport[key],beforeReport[key]);
 assignSalesToBuyer(s,[{saleId:unknownId,qty:1}],'asano',r.id);
 assert.equal(s.sales.filter(sale=>sale.destinationType==='unknown').length,0);
 assert.equal(s.sales.find(sale=>sale.buyerId==='hori').qty,1);
 assert.equal(s.sales.find(sale=>sale.buyerId==='asano').qty,1);
 validate(s);
});

test('販売先名なしの外部入金済みへ割り当てても販売利益と個人請求を変えない',()=>{
 const {s,r}=setup();
 const st={id:'unnamed-external',productId:'galette',name:'ガレット',category:'焼き菓子',qty:1,price:390,cost:250,date:r.date,test:false,roundId:r.id,channel:'sales',depth:0,eventId:null,eventLineId:null};
 s.stocks.push(st);
 addSale(s,st,{date:r.date,qty:1,destinationType:'unknown',paymentStatus:'unconfirmed'});
 const before=report(s,'2026-04-01','2027-03-31',2026);
 assignUnknownSale(s,s.sales[0].id,1,{destinationType:'external',destinationName:'',paymentStatus:'paid'});
 assert.equal(s.sales[0].destinationName,'外部販売（名称未入力）');
 assert.equal(s.sales[0].paymentStatus,'paid');
 assert.equal(s.sales[0].chargeRoundId,null);
 assert.equal(s.externalDestinations.includes('外部販売（名称未入力）'),false);
 assert.deepEqual(report(s,'2026-04-01','2027-03-31',2026),before);
 assert.equal(collections(s,'','',r.id).find(row=>row.id==='hori')?.onsite || 0,0);
 validate(s);
});

test('未確認3個から同じ購入者へ2個を割り当て、1個を未確認に残す',()=>{
 const {s,r}=setup();
 const st={id:'three-stock',productId:'milk',name:'ミルクスティックパン',category:'パン',qty:3,price:280,cost:180,date:r.date,test:false,roundId:r.id,channel:'sales',depth:0,eventId:null,eventLineId:null};
 s.stocks.push(st);addSale(s,st,{date:r.date,qty:3,destinationType:'unknown',paymentStatus:'unconfirmed'});
 assignSalesToBuyer(s,[{saleId:s.sales[0].id,qty:2}],'hori',r.id);
 assert.equal(s.sales.find(sale=>sale.destinationType==='unknown').qty,1);
 assert.equal(s.sales.find(sale=>sale.buyerId==='hori').qty,2);
 assert.equal(stockRemaining(s,st),0);
 validate(s);
});

test('複数商品を同じ購入者へまとめて割り当て、後から1件だけ直しても他へ影響しない',()=>{
 const {s,r}=setup();
 const milk={id:'multi-milk',productId:'milk',name:'ミルクスティックパン',category:'パン',qty:1,price:280,cost:180,date:r.date,test:false,roundId:r.id,channel:'sales',depth:0,eventId:null,eventLineId:null};
 const sweet={id:'multi-sweet',productId:'galette',name:'ガレット',category:'焼き菓子',qty:1,price:390,cost:250,date:r.date,test:false,roundId:r.id,channel:'sales',depth:0,eventId:null,eventLineId:null};
 s.stocks.push(milk,sweet);addSale(s,milk,{date:r.date,qty:1,destinationType:'unknown',paymentStatus:'unconfirmed'});addSale(s,sweet,{date:r.date,qty:1,destinationType:'unknown',paymentStatus:'unconfirmed'});
 const ids=s.sales.map(sale=>sale.id);assignSalesToBuyer(s,ids.map(saleId=>({saleId,qty:1})),'hori',r.id);
 assert.equal(s.sales.filter(sale=>sale.buyerId==='hori').length,2);
 updateSaleDestination(s,ids[0],{destinationType:'buyer',buyerId:'asano',chargeRoundId:r.id});
 assert.equal(s.sales.find(sale=>sale.id===ids[0]).buyerId,'asano');
 assert.equal(s.sales.find(sale=>sale.id===ids[1]).buyerId,'hori');
 validate(s);
});
