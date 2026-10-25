import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,validate,collectionDueItems} from '../src/domain.js';
import {receiveDueItem} from '../src/collection-workflow.js';
import {roundProgress,closeRoundWithCarry} from '../src/round-progress.js';

function fixture(){
 const s=initialState(),r=newRound(s,'2026-09-11');s.rounds.push(r);
 r.status='納品済み';r.shortageConfirmation='none';r.invoice=100;
 r.products=[{id:'brown',name:'黒糖ブレッド',price:430,cost:null}];
 r.orders.hori={name:'堀',quantities:{brown:1}};
 return {s,r};
}
test('精算と集金を分離し、今回分を全額受け取ると過去未収を残して自動完了',()=>{
 const {s,r}=fixture();
 s.receivableItems.push({id:'prior',kind:'opening',buyerId:'hori',date:'2026-07-24',amount:50,reason:'未払い / 未受取',note:''});
 assert.equal(roundProgress(s,r).status,'集金中');
 const item=`round:${r.id}:hori`;
 receiveDueItem(s,r.id,'hori',item);
 assert.equal(collectionDueItems(s,r.id,'hori').items.find(x=>x.id==='prior').balance,50);
 assert.deepEqual([roundProgress(s,r).status,roundProgress(s,r).carry],['完了',false]);
 assert.equal(s.collectionEntries.length,1);
});
test('繰越は請求と現金を変更せず、後日回収で黄色表示だけ消す',()=>{
 const {s,r}=fixture();const old=structuredClone(s);
 const close=closeRoundWithCarry(s,r.id);
 assert.ok(close.id);assert.equal(roundProgress(s,r).status,'完了');assert.equal(roundProgress(s,r).carry,true);
 assert.equal(s.collectionEntries.length,old.collectionEntries.length);
 assert.deepEqual(s.receivableItems,old.receivableItems);
 assert.throws(()=>closeRoundWithCarry(s,r.id),/記録済み/);
 validate(s);
 const next=newRound(s,'2026-10-16');s.rounds.push(next);
 receiveDueItem(s,next.id,'hori',`round:${r.id}:hori`);
 assert.equal(roundProgress(s,r).status,'完了');assert.equal(roundProgress(s,r).carry,false);
 assert.equal(s.collectionEntries.length,1);
});
test('請求訂正により繰越時より未収が増えると自動完了せず再確認する',()=>{
 const {s,r}=fixture();closeRoundWithCarry(s,r.id);
 r.products[0].price=500;
 const progress=roundProgress(s,r);
 assert.equal(progress.status,'集金中');assert.equal(progress.increased,true);
});
test('納品や利益未確定を未収繰越で飛ばせない',()=>{
 const {s,r}=fixture();r.invoice=null;
 assert.equal(roundProgress(s,r).status,'納品済み');
 assert.match(roundProgress(s,r).issues[0].message,/納品書/);
 assert.throws(()=>closeRoundWithCarry(s,r.id),/納品書/);
});
