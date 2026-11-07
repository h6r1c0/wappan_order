import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,collectionDueItems,collectionPosition} from '../src/domain.js';
import {currentRoundDue,roundCompletionIssues,closeRoundWithCarry} from '../src/round-progress.js';
import {receiveDueItem,recordCollectionAllocation} from '../src/collection-workflow.js';

function rounds(){
 const s=initialState(),sep=newRound(s,'2026-09-11',true),oct=newRound(s,'2026-10-16',true);
 s.rounds.push(sep,oct);
 for(const r of [sep,oct]){r.status='納品済み';r.shortageConfirmation='none';r.invoice=100;r.products=[{id:'bread',name:'白パン',price:790,cost:200}];}
 return {s,sep,oct};
}
test('旧形式の9月全額受取は10月の請求が増えても9月へ一度だけ充当',()=>{
 const {s,sep,oct}=rounds();
 for(const [id,price] of [['asano',790],['abe',7280],['urabe',1060]]){
  if(!s.buyers.some(b=>b.id===id))s.buyers.push({id,name:id,test:true});
  sep.orders[id]={name:id,quantities:{bread:1}};
  sep.products.push({id, name:id,price,cost:100});sep.orders[id].quantities={ [id]:1 };
  oct.orders[id]={name:id,quantities:{bread:1}};
  s.collectionEntries.push({id:`receipt-${id}`,roundId:sep.id,buyerId:id,date:'2026-10-23',received:price,adjustment:0,reason:'全額受取'});
 }
 const before=structuredClone(s.collectionEntries);
 assert.equal(currentRoundDue(s,sep).total,0);
 for(const id of ['asano','abe','urabe']){
  assert.equal(collectionPosition(s,oct.id,id).carry,0);
  assert.equal(collectionDueItems(s,oct.id,id).unallocated,0);
  assert.equal(collectionDueItems(s,oct.id,id).items.find(x=>x.roundId===oct.id).balance,790);
 }
 assert.deepEqual(s.collectionEntries,before);
 const reload=JSON.parse(JSON.stringify(s));
 assert.equal(currentRoundDue(reload,sep).total,0);
 assert.deepEqual(reload.collectionEntries,before);
});
test('別請求を含む旧受取でも確定分のみ控除し、真の未収を残す',()=>{
 const {s,sep,oct}=rounds();
 sep.orders.hori={name:'堀',quantities:{bread:1}};sep.products[0].price=2510;
 s.collectionEntries.push({id:'hori-cash',roundId:sep.id,buyerId:'hori',date:'2026-10-23',received:2130,adjustment:0,itemId:`round:${sep.id}:hori`});
 oct.orders.hori={name:'堀',quantities:{bread:1}};
 assert.equal(currentRoundDue(s,sep).total,380);
 assert.equal(collectionPosition(s,oct.id,'hori').carry,380);
 receiveDueItem(s,oct.id,'hori',`round:${oct.id}:hori`);
 assert.equal(collectionPosition(s,oct.id,'hori').carry,380);
 assert.equal(s.collectionEntries.length,2);
});
test('同じ注文回に複数の候補が本当に残るときは推測充当せず終了を止める',()=>{
 const {s,sep,oct}=rounds();sep.orders.a={name:'A',quantities:{bread:1}};
 s.receivableItems.push({id:'extra',kind:'additional',buyerId:'a',roundId:sep.id,date:sep.date,amount:100,reason:'商品請求漏れ',note:'追加'});
 s.collectionEntries.push({id:'unclear',roundId:sep.id,buyerId:'a',date:'2026-10-23',received:300,adjustment:0});
 assert.equal(collectionDueItems(s,oct.id,'a').unallocated,300);
 assert.ok(roundCompletionIssues(s,sep).some(x=>x.target==='cash'));
 assert.throws(()=>closeRoundWithCarry(s,sep.id),/充当先/);
 recordCollectionAllocation(s,'unclear',[{itemId:`round:${sep.id}:a`,amount:300}]);
 assert.equal(collectionDueItems(s,oct.id,'a').unallocated,0);
 assert.equal(collectionDueItems(s,oct.id,'a').items.find(x=>x.id==='extra').balance,100);
});
