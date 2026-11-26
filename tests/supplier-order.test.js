import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../src/domain.js';
import {defaultDeadlines,deadlines,guideText,neededLines,planDispatch,recordDispatch,acceptDispatchCorrection} from '../src/supplier-order.js';
import {renderSupplierPdf,toBase64} from '../src/supplier-pdf.js';
import {PDFDocument} from 'pdf-lib';
import fs from 'node:fs/promises';

const state=()=>{
  const s=initialState();
  s.rounds=[{id:'nov',date:'2026-11-27',test:true,products:[
    {id:'walnut-1',name:'くるみパン 1個入り',category:'パン'},
    {id:'walnut-2',name:'くるみパン 2個入り',category:'パン'},
    {id:'cookie',name:'F.T.エスプレッソクッキー',category:'焼き菓子'},
  ],orders:{b:{quantities:{'walnut-1':3,'walnut-2':2,cookie:5}}},eventIds:[],stockIds:[]}];
  return s;
};
const template={id:'template',name:'11月注文書.pdf',month:'2026-11',kind:'bread',pdf:'a',rows:[{id:'walnut',name:'くるみパン 2個',y:100,qtyX:315},{id:'cookie',name:'F.T.エスプレッソクッキー 約60g',y:140,qtyX:720}]};
test('11月と12月の通常締切・例外・曜日を納品日から算出',()=>{
  assert.deepEqual(defaultDeadlines('2026-11-27'),{sweets:'2026-11-11',bread:'2026-11-18',exceptions:[],supplier:''});
  assert.equal(defaultDeadlines('2026-12-11').sweets,'2026-11-25');
  assert.equal(defaultDeadlines('2026-12-18').bread,'2026-12-09');
  const r={date:'2026-12-18',orderDeadlines:{bread:'2026-12-07',exceptions:[{label:'クリスマス商品',date:'2026-12-02'}]}};
  assert.match(guideText([{date:'2026-12-11',orderDeadlines:{exceptions:[{label:'クリスマス商品',date:'2026-12-02'}]}},r]),/クリスマス商品　12\/2（水）[\s\S]*パン　12\/7（月）/);
  assert.equal(deadlines(r).sweets,'2026-12-02');
  assert.equal(defaultDeadlines('2027-01-08').sweets,'2026-12-23');
  assert.equal(defaultDeadlines('2026-11-27',{sweetsDays:16,breadDays:9,supplierDays:3}).supplier,'2026-11-24');
});
test('セットとバラを混ぜても同じ注文欄へ二重に書かない',()=>{
  const s=state(),r=s.rounds[0];
  const plan=planDispatch(s,r,template,['walnut-1','walnut-2']);
  assert.deepEqual(plan.placements.map(x=>[x.productId,x.qty]),[['walnut-2',2]]);
  assert.match(plan.notes.join(''),/くるみパン 1個入り.*3注文単位/);
  assert.deepEqual(plan.issues,[]);
  const only=planDispatch(s,r,template,['walnut-1']);
  assert.deepEqual(only.placements.map(x=>x.packCorrection),['1個入り']);
});
test('送付前は発注済みにならず、送付原本・追加数量・減数了承を保持',()=>{
  const s=state(),r=s.rounds[0];
  const original=planDispatch(s,r,template,['cookie']);
  assert.equal(neededLines(s,r).find(x=>x.id==='cookie').qty,5);
  const sent={id:'sent1',roundId:r.id,templateId:template.id,templateName:template.name,sentAt:'2026-11-01T10:00:00Z',lines:original.lines.map(x=>({productId:x.id,name:x.name,qty:x.qty,orderedBefore:x.ordered})),pdf:'original',issues:[]};
  recordDispatch(s,sent);assert.throws(()=>recordDispatch(s,sent),/送付済み/);
  assert.throws(()=>recordDispatch(s,{...sent,id:'other-device'}),/別の発注書/);
  assert.equal(neededLines(s,r).find(x=>x.id==='cookie'),undefined);
  r.orders.b.quantities.cookie=7;
  const added=planDispatch(s,r,template,['cookie']);
  assert.equal(added.lines[0].qty,2);
  assert.match(added.notes.join(''),/先日注文.*5注文単位.*2注文単位.*合計7/);
  assert.equal(s.supplierDispatches[0].pdf,'original');
  r.orders.b.quantities.cookie=3;
  const less=planDispatch(s,r,template,['cookie']);
  assert.equal(less.lines[0].qty,-2);
  recordDispatch(s,{...sent,id:'less',lines:less.lines.map(x=>({productId:x.id,name:x.name,qty:x.qty,orderedBefore:x.ordered}))});
  assert.equal(neededLines(s,r).find(x=>x.id==='cookie').qty,-2);
  assert.match(planDispatch(s,r,template,['cookie']).issues.join(''),/回答を記録/);
  acceptDispatchCorrection(s,'less');
  assert.equal(neededLines(s,r).find(x=>x.id==='cookie'),undefined);
});
test('元のA4用紙を保持し、日本語と数量を含むPDFを小さく生成する',async()=>{
  const source=await PDFDocument.create();source.addPage([841.89,595.28]);
  const sheet={id:'synthetic',name:'隔離用紙.pdf',month:'2026-11',kind:'bread',pdf:toBase64(await source.save()),rows:[{id:'walnut',name:'くるみパン 2個',y:383,qtyX:315,kind:'bread-left',unitX:113,unitWidth:12,unitEnd:201}]};
  const s=state(),r=s.rounds[0],plan=planDispatch(s,r,sheet,['walnut-1']);
  const bytes=await renderSupplierPdf(sheet,plan,{customer:'おひさま保育園 父母の会',greeting:'いつもありがとうございます。'},r.date,{fontBytes:await fs.readFile('src/assets/fonts/NotoSansJP-Regular.ttf')});
  assert.ok(bytes.length<500000,`PDF ${bytes.length} bytes`);
  const result=await PDFDocument.load(bytes);assert.equal(result.getPageCount(),1);
  assert.equal(Math.round(result.getPages()[0].getWidth()),842);
});
