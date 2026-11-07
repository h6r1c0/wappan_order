import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,transfer,correctSnackToSalesTransfer,addSale,stockRemaining,report,collections,validate,collectionPosition,collectionDueItems} from '../src/domain.js';
import {moveStock} from '../src/commerce.js';
import {saveSnackSection} from '../src/snack-billing.js';
import {canReceiveDueItem,receiveDueItem} from '../src/collection-workflow.js';

test('Work4: 販売・再振替の2個を守り、3→2訂正で原価・売上・請求・現金原本は変わらない',()=>{
 const s=initialState(),r=newRound(s,'2026-10-16');s.rounds.push(r);
 const e={id:'snack',roundId:r.id,date:r.date,name:'おやつ用',test:false,lines:[{id:'apple',productId:'apple',name:'りんごデニッシュ',qty:8,used:0,cost:151}]};s.events.push(e);r.eventIds.push(e.id);
 transfer(s,e,e.lines[0],3,190,r.date);const st=s.stocks.at(-1);st.roundId=r.id;
 addSale(s,st,{qty:1,date:r.date,destinationType:'external',paymentStatus:'paid'});
 moveStock(s,st,1);
 const group={id:'group',label:'手動単価',lineIds:['apple'],quantities:{apple:5},unitPrice:160,priceMode:'manual'};
 saveSnackSection(s,e.id,'common',{groups:[group],household:[{buyerId:'hori',groupId:'group',qty:5,unitPrice:160}]});
 const before=structuredClone(s),financial=report(s,r.date,r.date,2026);
 assert.throws(()=>correctSnackToSalesTransfer(s,st.id,1,'確認'),/販売済み・再振替済み/);
 assert.deepEqual(s,before);
 correctSnackToSalesTransfer(s,st.id,2,'紙の実績を確認');
 assert.equal(stockRemaining(s,st),0);assert.equal(st.cost,151);
 assert.deepEqual(e.snackDraft,before.events[0].snackDraft);
 assert.deepEqual(s.sales,before.sales);assert.deepEqual(s.collectionEntries,before.collectionEntries);
 assert.deepEqual(collections(s,'','',r.id,true),collections(before,'','',r.id,true));
 assert.deepEqual(report(s,r.date,r.date,2026),financial);
 const reload=JSON.parse(JSON.stringify(s));validate(reload);
 assert.equal(reload.stocks.find(x=>x.id===st.id).transferHistory[0].previous,3);
 correctSnackToSalesTransfer(s,st.id,3,'追加分を確認');
 assert.throws(()=>correctSnackToSalesTransfer(s,st.id,4,'超過'),/実入荷/);
});

test('Work4: 過去の未充当受取を動かさず今回分を一度だけ受取し、今回の未充当なら拒否する',()=>{
 const s=initialState(),old=newRound(s,'2026-09-11');s.rounds.push(old);
 old.orders.hori={name:'堀',quantities:{brown:2}};
 const current=newRound(s,'2026-10-16');s.rounds.push(current);current.orders.hori={name:'堀',quantities:{brown:1}};
 s.collectionEntries.push({id:'old-cash',roundId:old.id,buyerId:'hori',date:'2026-09-11',received:100,adjustment:0});
 const item=collectionDueItems(s,current.id,'hori').items.find(x=>x.roundId===current.id);
 assert.equal(collectionPosition(s,current.id,'hori').unallocated,100);
 assert.equal(canReceiveDueItem(s,current.id,'hori',item),true);
 const original=structuredClone(s.collectionEntries),amount=item.balance;
 const received=receiveDueItem(s,current.id,'hori',item.id);
 assert.equal(received.received,amount);assert.deepEqual(s.collectionEntries[0],original[0]);
 assert.equal(collectionPosition(s,current.id,'hori').unallocated,100);
 assert.throws(()=>receiveDueItem(s,current.id,'hori',item.id),/未収/);
 const other=structuredClone(s);other.collectionEntries=original;
 other.collectionEntries[0].roundId=current.id;
 assert.equal(canReceiveDueItem(other,current.id,'hori',item),false);
 assert.throws(()=>receiveDueItem(other,current.id,'hori',item.id),/充当先/);
});
