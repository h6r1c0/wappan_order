import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newRound,validate,collections,collectionPosition,eventClaim,report,transfer} from '../src/domain.js';
import {replaceSnackBilling,snackBillingPreview,suggestedSnackPrice} from '../src/snack-billing.js';

const setup=()=>{
  const s=initialState();
  s.buyers.push({id:'sato',name:'佐藤',kana:'さとう',active:true,fixed:[]});
  const r=newRound(s,'2026-10-16');s.rounds.push(r);
  const e={id:'event',roundId:r.id,date:r.date,name:'おやつ用',test:false,entryMode:'round',lines:[
    {id:'beanline',productId:'bean',name:'こしあんぱん',qty:6,used:0,cost:130},
    {id:'appleline',productId:'apple',name:'りんごデニッシュ',qty:6,used:0,cost:151},
  ]};s.events.push(e);r.eventIds.push(e.id);return {s,r,e};
};

test('非表示の旧商品が正本と同名でも佐藤を登録でき、佐々木を同一と誤判定しない',()=>{
  const {s}=setup();
  s.products.push({...s.products[6],id:'retired-bean',active:false,retiredDuplicate:'bean'});
  s.buyers.push({id:'sasaki',name:'佐々木',kana:'ささき',active:true,fixed:[]});
  assert.doesNotThrow(()=>validate(s));
  s.buyers.push({id:'same',name:'佐藤',kana:'さとう',active:true,fixed:[]});
  assert.throws(()=>validate(s),/同じ名前/);
  s.buyers.at(-1).sameNameConfirmed=true;
  assert.doesNotThrow(()=>validate(s));
});

test('正本の黒糖ブレッドを固定注文へ残し、非表示IDの過去スナップショットを維持',()=>{
  const {s}=setup();const old={...s.products.find(p=>p.id==='brown'),id:'old-brown',active:false,retiredDuplicate:'brown',name:'黒糖ブレッド 1個'};
  s.products.push(old);s.buyers[0].fixed=[{productId:'brown',qty:1}];
  const next=newRound(s,'2026-11-13');
  assert(next.products.some(p=>p.id==='brown'));assert(!next.products.some(p=>p.id==='old-brown'));
  assert(s.products.some(p=>p.id==='old-brown'));
});

test('商品別家庭請求は個人集金へ一度だけ入り、職員分は原価・家庭差額は利益',()=>{
  const {s,r,e}=setup();e.lines[0].used=3;e.lines[0].usedConfirmed=true;e.lines[1].used=2;e.lines[1].usedConfirmed=true;
  replaceSnackBilling(s,e.id,{label:'運動会リハのおやつ',fiscal:[{lineId:'beanline',qty:2}],household:[
    {buyerId:'sato',lineId:'beanline',qty:1,unitPrice:140},
    {buyerId:'sato',lineId:'appleline',qty:2,unitPrice:160},
  ]});
  assert.equal(eventClaim(e),260);
  assert.equal(collections(s,'','',r.id).find(x=>x.id==='sato').snack,460);
  assert.equal(collectionPosition(s,r.id,'sato').current,460);
  assert.equal(report(s,r.date,r.date,2026).rows.find(x=>x.id==='snack:event').profit,28);
  replaceSnackBilling(s,e.id,{...e.billing,household:[{buyerId:'sato',lineId:'beanline',qty:1,unitPrice:150},{buyerId:'sato',lineId:'appleline',qty:2,unitPrice:160}]},'請求単価を訂正');
  assert.equal(collectionPosition(s,r.id,'sato').current,470);
  assert.equal(e.billingHistory.length,1);
  replaceSnackBilling(s,e.id,null,'請求取消');
  assert.equal(collectionPosition(s,r.id,'sato').current,0);
  assert.equal(e.billingHistory.length,2);
});

test('内訳不明の共通150円と財政3+3は在庫の実使用と分け、確認後だけ利益確定',()=>{
  const {s,r,e}=setup();
  assert.equal(suggestedSnackPrice([130,151]),150);
  const billing={label:'運動会リハのおやつ',fiscal:[{lineId:'beanline',qty:3},{lineId:'appleline',qty:3}],
    household:[{buyerId:'sato',lineId:null,qty:2,unitPrice:150}]};
  replaceSnackBilling(s,e.id,billing);
  assert.equal(eventClaim(e),843);
  assert.equal(collectionPosition(s,r.id,'sato').current,300);
  assert.equal(snackBillingPreview(s,e).profit,null);
  assert.equal(e.lines[0].used,0);
  e.lines[0].used=4;e.lines[1].used=4;e.lines.forEach(l=>l.usedConfirmed=true);
  assert.equal(snackBillingPreview(s,e).cost,281);
  assert.equal(snackBillingPreview(s,e).profit,19);
  assert.equal(report(s,r.date,r.date,2026).profit,19);
  assert.throws(()=>replaceSnackBilling(s,e.id,{...billing,household:[...billing.household,{...billing.household[0]}]},'重複'),/重複/);
});

test('おやつから販売用への振替と直接販売用在庫を混同せず、同じ商品の過剰請求を防ぐ',()=>{
  const {s,r,e}=setup();
  transfer(s,e,e.lines[0],3,160,r.date);
  s.stocks.push({id:'direct',roundId:r.id,productId:'apple',name:'りんごデニッシュ',qty:2,cost:151,price:190,date:r.date});
  assert.throws(()=>replaceSnackBilling(s,e.id,{label:'運動会リハ',fiscal:[{lineId:'beanline',qty:4}],household:[]}),/振替後/);
  replaceSnackBilling(s,e.id,{label:'運動会リハ',fiscal:[{lineId:'beanline',qty:3}],household:[{buyerId:'sato',lineId:'appleline',qty:2,unitPrice:160}]});
  assert.equal(eventClaim(e),390);
  assert.equal(collectionPosition(s,r.id,'sato').current,320);
  assert.equal(s.stocks.find(x=>x.id==='direct').qty,2);
  assert.equal(s.stocks.find(x=>x.eventLineId==='beanline').qty,3);
});

test('受取後の請求訂正は旧金額を二重加算せず、差額を未収として追える',()=>{
  const {s,r,e}=setup();
  replaceSnackBilling(s,e.id,{label:'行事',fiscal:[],household:[{buyerId:'sato',lineId:'beanline',qty:2,unitPrice:140}]});
  s.collectionEntries.push({id:'receipt',roundId:r.id,buyerId:'sato',date:r.date,received:280,adjustment:0,note:'受取'});
  assert.equal(collectionPosition(s,r.id,'sato').balance,0);
  replaceSnackBilling(s,e.id,{...e.billing,household:[{...e.billing.household[0],unitPrice:150}]},'単価訂正');
  assert.equal(collectionPosition(s,r.id,'sato').current,300);
  assert.equal(collectionPosition(s,r.id,'sato').balance,20);
  const next=newRound(s,'2026-11-13');s.rounds.push(next);
  assert.equal(collectionPosition(s,next.id,'sato').carry,20);
});

test('選んだ2商品だけを共通150円で22個まとめ、職員4+4と家庭10+12を分ける',()=>{
  const {s,r,e}=setup();
  e.lines[0].qty=14;e.lines[0].used=14;e.lines[0].usedConfirmed=true;
  e.lines[1].qty=16;e.lines[1].used=16;e.lines[1].usedConfirmed=true;
  const group={id:'adult',label:'大人用おやつ',lineIds:['beanline','appleline'],unitPrice:suggestedSnackPrice([130,151])};
  assert.equal(group.unitPrice,150);
  const household=Array.from({length:22},(_,i)=>{
    const id=`buyer${i}`;s.buyers.push({id,name:`家庭${i}`,active:true,fixed:[]});
    return {buyerId:id,groupId:'adult',lineId:null,qty:1,unitPrice:150};
  });
  const billing={label:'運動会リハ',fiscal:[{lineId:'beanline',qty:4},{lineId:'appleline',qty:4}],groups:[group],household};
  const preview=snackBillingPreview(s,e,billing);
  assert.deepEqual([preview.fiscal,preview.household,preview.cost,preview.profit,preview.complete],[1124,3300,3112,188,true]);
  assert.deepEqual([preview.groups[0].target,preview.groups[0].assigned,preview.groups[0].difference],[22,22,0]);
  replaceSnackBilling(s,e.id,billing);
  assert.equal(eventClaim(e),1124);
  assert.equal(collectionPosition(s,r.id,'buyer0').current,150);
  assert.match(collections(s,'','',r.id).find(x=>x.id==='buyer0').lines[0].description,/大人用おやつ 150円 ×1/);
  assert.equal(report(s,r.date,r.date,2026).rows.find(x=>x.type==='おやつ家庭請求').profit,188);
  assert.throws(()=>replaceSnackBilling(s,e.id,{...billing,household:household.slice(1)},'不足'),/割当数/);
  assert.throws(()=>replaceSnackBilling(s,e.id,{...billing,household:[...household,{buyerId:'sato',groupId:'adult',qty:1,unitPrice:150}]},'超過'),/超え|割当数/);
  replaceSnackBilling(s,e.id,{...billing,household:household.slice(1).map((x,i)=>i===0?{...x,qty:2}:x)},'家庭変更');
  assert.equal(e.billingHistory.length,1);
  assert.equal(collectionPosition(s,r.id,'buyer0').current,0);
  replaceSnackBilling(s,e.id,null,'取消');assert.equal(collectionPosition(s,r.id,'buyer1').current,0);
});

test('共通単価は対象商品のみで平均し、無関係な子ども用商品は含めない',()=>{
  const {s,e}=setup();e.lines.push({id:'child',name:'ハイジの白パン',qty:1,used:1,usedConfirmed:true,cost:220});
  e.lines[0].used=1;e.lines[0].usedConfirmed=true;e.lines[1].used=1;e.lines[1].usedConfirmed=true;
  assert.equal(suggestedSnackPrice(e.lines.filter(x=>['beanline','appleline'].includes(x.id)).map(x=>x.cost)),150);
  assert.equal(suggestedSnackPrice([220]),220);
  const billing={label:'行事',fiscal:[],groups:[{id:'adults',label:'大人',lineIds:['beanline','appleline'],unitPrice:150}],household:[
    {buyerId:'sato',groupId:'adults',lineId:null,qty:2,unitPrice:150},
    {buyerId:'sato',lineId:'child',qty:1,unitPrice:220},
  ]};
  replaceSnackBilling(s,e.id,billing);
  assert.equal(snackBillingPreview(s,e).profit,19);
  assert.equal(snackBillingPreview(s,e,{...billing,groups:[{...billing.groups[0],lineIds:['beanline','appleline','child']}]}).groups[0].target,2);
});


test('同じ家庭を異なる共通単価グループへ割当でき、単価不一致と商品別使用超過は確定しない',()=>{
  const {s,e}=setup();e.lines.forEach(l=>{l.used=2;l.usedConfirmed=true;});
  const billing={label:'行事',fiscal:[],groups:e.lines.map((l,i)=>({id:`g${i}`,label:l.name,lineIds:[l.id],unitPrice:150})),
    household:e.lines.map((l,i)=>({buyerId:'sato',groupId:`g${i}`,lineId:null,qty:2,unitPrice:150}))};
  replaceSnackBilling(s,e.id,billing);assert.equal(snackBillingPreview(s,e).household,600);
  const bad=structuredClone(billing);bad.household[0].unitPrice=160;
  assert.throws(()=>replaceSnackBilling(s,e.id,bad,'単価ずれ'),/単価/);
  const negative=structuredClone(billing);negative.groups=[{...billing.groups[0],lineIds:e.lines.map(l=>l.id)}];
  negative.fiscal=[{lineId:'beanline',qty:3}];negative.household=[{...billing.household[0],qty:1}];
  assert.throws(()=>replaceSnackBilling(s,e.id,negative,'実使用数超過'),/割当数/);
});
