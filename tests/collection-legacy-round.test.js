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
test('後から発生した開始時未収を古い受取へ混ぜない',()=>{
 const {s,sep,oct}=rounds();
 sep.collectionLive=true;oct.collectionLive=true;
 sep.orders.asano={name:'浅野',quantities:{bread:1}};
 oct.orders.asano={name:'浅野',quantities:{bread:1}};
 s.receivableItems.push({id:'future-opening',kind:'opening',buyerId:'asano',date:'2026-10-01',amount:200,reason:'別の未収'});
 s.collectionEntries.push({id:'old-cash',roundId:sep.id,buyerId:'asano',date:'2026-10-23',received:790,adjustment:0});
 assert.equal(collectionDueItems(s,oct.id,'asano').unallocated,0);
 assert.equal(currentRoundDue(s,sep).total,0);
 assert.equal(collectionPosition(s,oct.id,'asano').carry,200);
});
test('10月30日に指定して受け取った10月16日分は元の回でも消し込まれ、別請求は残る',()=>{
 const {s,sep,oct}=rounds(),late=newRound(s,'2026-10-30',true);
 s.rounds.push(late);
 for(const r of [sep,oct,late]) {r.orders.hori={name:'堀',quantities:{bread:1}};r.products=[{id:'bread',name:'白パン',price:790,cost:200}];}
 const target=`round:${oct.id}:hori`;
 const receipt=receiveDueItem(s,late.id,'hori',target);
 assert.equal(receipt.roundId,late.id);
 assert.equal(receipt.itemId,target);
 assert.equal(collectionDueItems(s,oct.id,'hori').items.find(i=>i.id===target).balance,0);
 assert.equal(collectionPosition(s,oct.id,'hori').balance,790);
 assert.equal(collectionPosition(s,late.id,'hori').carry,790);
 assert.equal(currentRoundDue(s,oct).total,0);
 const loaded=JSON.parse(JSON.stringify(s));
 assert.equal(collectionPosition(loaded,oct.id,'hori').balance,790);
 assert.equal(loaded.collectionEntries.length,1);
});
test('後日回から全額受け取った元請求は再度受取できず、訂正時には復活する',()=>{
 const {s,sep,oct}=rounds(),late=newRound(s,'2026-10-30',true);s.rounds.push(late);
 oct.orders.hori={name:'堀',quantities:{bread:1}};
 const claim=`round:${oct.id}:hori`;
 receiveDueItem(s,late.id,'hori',claim);
 assert.equal(collectionPosition(s,oct.id,'hori').balance,0);
 assert.equal(collectionDueItems(s,oct.id,'hori').items.find(i=>i.id===claim).balance,0);
 assert.throws(()=>receiveDueItem(s,oct.id,'hori',claim),/未収/);
 s.collectionCorrections=[{id:'correction',kind:'collectionEntries',targetId:s.collectionEntries[0].id,roundId:late.id,buyerId:'hori',reason:'重複して登録した'}];
 assert.equal(collectionPosition(s,oct.id,'hori').balance,790);
});
test('取消された100円と後日回の預かり1150円を元請求へ推測充当しない',()=>{
 const {s,sep,oct}=rounds(),late=newRound(s,'2026-10-30',true);s.rounds.push(late);
 oct.products=[{id:'bread',name:'白パン',price:100,cost:50}];
 oct.orders.hori={name:'堀',quantities:{bread:1}};
 const claim=`round:${oct.id}:hori`;
 const mistaken=receiveDueItem(s,late.id,'hori',claim);
 (s.collectionCorrections??=[]).push({id:'void-100',kind:'collectionEntries',targetId:mistaken.id,roundId:late.id,buyerId:'hori',reason:'受取額を訂正'});
 // No new claim is inferred from the later screen's cash entry.
 s.collectionEntries.push({id:'held-1150',roundId:late.id,buyerId:'hori',date:late.date,received:1150,adjustment:0,reason:'多く受け取ったので次回へ預かる'});
 assert.equal(collectionDueItems(s,oct.id,'hori').items.find(i=>i.id===claim).balance,100);
 assert.equal(collectionPosition(s,oct.id,'hori').balance,100);
 const later=collectionDueItems(s,late.id,'hori');
 assert.equal(later.items.find(i=>i.id===claim).balance,100);
 assert.equal(later.held,1150);
 assert.equal(collectionPosition(s,late.id,'hori').balance,100);
 assert.equal(collectionPosition(s,late.id,'hori').availableCredit,1150);
 assert.equal(s.collectionEntries.length,2);
 const reloaded=JSON.parse(JSON.stringify(s));
 assert.equal(collectionDueItems(reloaded,late.id,'hori').items.find(i=>i.id===claim).balance,100);
});
