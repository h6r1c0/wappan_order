import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,addSale,collections,report,stockRemaining,transfer,validate} from '../src/domain.js';
import {delivery,upgrade,moveStock,sellBundle,marketTotals,deliveryTotals} from '../src/commerce.js';
import {destinationCandidate,parseLineOrder} from '../src/line-import.js';

function setup(){
 const s=initialState();s.products.forEach(p=>{if(p.gross==null&&p.manual==null)p.gross=394});
 const r=newRound(s,'2026-09-11',false);s.rounds.push(r);upgrade(s);return {s,r};
}

test('1納品回に個人・園内・行事・マルシェを統合し、振替は追加仕入にしない',()=>{
 const {s,r}=setup();r.orders.hori={name:'ホリ',quantities:{milk:1}};
 const onsite={id:'on',productId:'galette',name:'ガレット',category:'焼き菓子',qty:3,price:390,cost:250,date:r.date,test:false,roundId:r.id,channel:'onsite',depth:0,eventId:null,eventLineId:null};s.stocks.push(onsite);
 const e={id:'event',name:'行事',date:r.date,test:false,roundId:r.id,lines:[{id:'line',productId:'walnut',name:'くるみパン',category:'パン',qty:20,used:18,cost:138}]};s.events.push(e);
 const market={id:'market',name:'秋マルシェ',date:r.date,place:'園庭',expense:null,expenseMode:'reference',roundId:r.id};s.markets.push(market);
 const ext=moveStock(s,onsite,2,market.id,420);upgrade(s);
 const totals=deliveryTotals(s,r);
 assert.equal(totals.find(x=>x.name==='ガレット').qty,3);
 assert.deepEqual(totals.find(x=>x.name==='ガレット'),{id:'galette',name:'ガレット',personal:0,onsite:3,event:0,external:0,qty:3});
 assert.equal(totals.find(x=>x.name==='くるみパン').event,20);
 assert.equal(stockRemaining(s,onsite),1);assert.equal(stockRemaining(s,ext),2);validate(s);
});

test('外部名称・支払状態・任意単価と個人追加請求を分離する',()=>{
 const {s,r}=setup(),m={id:'m',name:'秋マルシェ',date:r.date,place:'',expense:null,expenseMode:'reference',roundId:r.id};s.markets.push(m);
 const st={id:'s',name:'パンのカリカリ',category:'焼き菓子',qty:4,price:390,cost:260,date:r.date,test:false,roundId:r.id,channel:'external',marketId:m.id,depth:0,eventId:null,eventLineId:null};s.stocks.push(st);upgrade(s);
 addSale(s,st,{date:r.date,qty:1,price:420,destinationType:'external',destinationName:'手話タイム',paymentStatus:'unconfirmed'});
 addSale(s,st,{date:r.date,qty:1,price:410,destinationType:'buyer',buyerId:'hori',paymentStatus:'later',chargeRoundId:r.id});
 addSale(s,st,{date:r.date,qty:1,price:400,destinationType:'unknown',paymentStatus:'unconfirmed'});
 assert.equal(s.externalDestinations.includes('手話タイム'),true);assert.equal(stockRemaining(s,st),1);
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
