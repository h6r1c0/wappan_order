import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,addSale,updateSaleDestination,collections,report,productAvailable} from '../src/domain.js';
import {marketUsage,removeUnusedMarket} from '../src/commerce.js';
import {productDisplayName,productImportIdentity} from '../src/product-names.js';

test('商品名は規格を保ち、仕入先名と注文履歴を変更しない',()=>{
  const names=[['塩パン 1個','塩パン'],['くるみパン 1個入り','くるみパン 1個'],
    ['くるみパン 2個入り','くるみパン 2個'],['ツイストドーナツ 2個入り','ツイストドーナツ 2個'],
    ['ハイジの白パン 3個入り','ハイジの白パン 3個'],['ハイジの白パン 1個入り','ハイジの白パン 1個']];
  for(const [source,label] of names)assert.equal(productDisplayName(source),label);
  assert.notEqual(productImportIdentity(names[1][0]),productImportIdentity(names[2][0]));
  const state=initialState();const before=structuredClone(state);
  productDisplayName(state.products[3].name);
  assert.deepEqual(state,before);
});

test('重複商品の候補だけを隠し、過去の注文スナップショットは保持する',()=>{
  const state=initialState();const round=newRound(state,'2026-09-11');
  const legacy=state.products.find(p=>p.id==='bread');
  legacy.retiredDuplicate='canonical';legacy.active=false;
  assert.equal(productAvailable(legacy,round.date),false);
  assert.equal(round.products.some(p=>p.id==='bread'),true);
  const next=newRound(state,'2026-10-16');
  assert.equal(next.products.some(p=>p.id==='bread'),false);
  assert.equal(state.products.some(p=>p.id==='bread'),true);
});

test('販売場所の削除は参照と経費を確認し、未使用だけ削除する',()=>{
  const state=initialState();const m={id:'place',roundId:'r',name:'催し',date:'2026-10-16',expense:0,expenseMode:'reference'};
  state.markets.push(m);
  assert.deepEqual(marketUsage(state,m.id),{stock:false,sales:false,sets:false,expense:false});
  state.bundles.push({id:'set',marketId:m.id});
  assert.throws(()=>removeUnusedMarket(state,m.id),/削除できません/);
  assert.equal(state.markets.length,1);
  state.bundles=[];m.expense=100;
  assert.throws(()=>removeUnusedMarket(state,m.id),/削除できません/);
  m.expense=0;removeUnusedMarket(state,m.id);
  assert.equal(state.markets.length,0);
});

test('名称のない支払い済み販売は一度だけ売上へ入り、個人請求には入らない',()=>{
  const state=initialState();state.buyers.push({id:'buyer',name:'購入者',active:true,fixed:[]});
  const r=newRound(state,'2026-10-16');state.rounds.push(r);
  const stock={id:'stock',roundId:r.id,productId:'milk',name:'ミルクスティックパン',date:r.date,qty:2,price:280,cost:225,test:false};
  state.stocks.push(stock);r.stockIds.push(stock.id);
  addSale(state,stock,{date:r.date,qty:1,price:280,destinationType:'external',paymentStatus:'paid',destinationName:''});
  assert.equal(state.sales[0].paid,true);
  assert.equal(collections(state,'2026-10-16','2026-10-16').some(x=>x.id==='buyer'),false);
  assert.equal(state.sales.length,1);
  const first=report(state,r.date,r.date,2026).rows.find(x=>x.id===state.sales[0].id);
  updateSaleDestination(state,state.sales[0].id,{destinationType:'buyer',buyerId:'buyer',chargeRoundId:r.id,salePlace:'催し',marketId:null});
  assert.equal(state.sales.length,1);
  assert.equal(state.sales[0].salePlace,'催し');
  assert.equal(collections(state,r.date,r.date,r.id).find(x=>x.id==='buyer').onsite,280);
  const after=report(state,r.date,r.date,2026).rows.find(x=>x.id===state.sales[0].id);
  assert.equal(after.revenue,first.revenue);
});
