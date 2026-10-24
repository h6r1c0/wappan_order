import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {initialState,newRound,collectionPosition} from '../../src/domain.js';
import {saveCollectionCase} from '../../src/collection-workflow.js';
import {backend,login} from './workflow-helpers.js';

test('集金一覧は通常の12人を少ないスクロールで探せ、受取後は完了側へ移る',async({page,context})=>{
 const s=initialState(),r=newRound(s,'2026-10-16',true);
 s.rounds.push(r);r.status='納品済み';r.products=[{id:'bread',name:'定番のパン',category:'パン',price:190,cost:130}];
 s.buyers=Array.from({length:12},(_,i)=>({id:`buyer-${i}`,name:i===11?'とても長いお名前の購入者さん':`購入者${i+1}`,kana:`こうにゅうしゃ${String(i+1).padStart(2,'0')}`,active:true,fixed:[]}));
 for(const b of s.buyers)r.orders[b.id]={name:b.name,quantities:{bread:1}};
 const shared={state:s,revision:0};await backend(context,shared);await login(page);
 await page.locator('.round-list-item').click();await page.locator('.stage-4 > .stage-trigger').click();
 expect(await page.locator('.stage-2').evaluate(x=>getComputedStyle(x).getPropertyValue('--work-accent').trim())).toBe('#285f96');
 const rows=page.locator('.collection-list > .collection-entry');await expect(rows).toHaveCount(12);
 const output=[];
 for(const width of [320,375,430,1280]){
  await page.setViewportSize({width,height:812});await rows.first().scrollIntoViewIfNeeded();
  const measurements=await page.evaluate(()=>{
   const list=document.querySelector('.collection-list'),rows=[...list.querySelectorAll(':scope > .collection-entry')];
   return {heights:rows.map(x=>Math.round(x.getBoundingClientRect().height)),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  expect(measurements.overflow).toBe(false);
  if(!process.env.UX_CAPTURE_BEFORE)expect(Math.max(...measurements.heights.slice(0,11))).toBeLessThanOrEqual(70);
  output.push({width,...measurements});
  if(process.env.UX_CAPTURE_DIR){await fs.mkdir(process.env.UX_CAPTURE_DIR,{recursive:true});await page.screenshot({path:`${process.env.UX_CAPTURE_DIR}/collection-${width}.png`});}
 }
 if(process.env.UX_CAPTURE_DIR)await fs.writeFile(`${process.env.UX_CAPTURE_DIR}/measurements.json`,JSON.stringify(output,null,2));
 const first=rows.first();await first.getByRole('button',{name:'全額受取'}).click();
 expect(collectionPosition(shared.state,r.id,'buyer-0').balance).toBe(0);
 await expect(page.locator('.collection-list > .collection-entry')).toHaveCount(11);
 await expect(page.locator('.collection-list > .collection-entry').first().locator('.collection-open')).toHaveAttribute('aria-expanded','false');
 await page.locator('.collection-completed summary').click();await expect(page.locator('.collection-completed [data-buyer="buyer-0"]')).toBeVisible();
 for(let i=1;i<12;i++)await rows.first().getByRole('button',{name:'全額受取'}).click();
 await expect(rows).toHaveCount(0);await expect(page.locator('.collection-completed summary')).toContainText('12人');
 await page.reload();await page.locator('.round-list-item').click();await page.locator('.stage-4 > .stage-trigger').click();
 await expect(page.locator('[data-buyer="buyer-0"] button:has-text("全額受取")')).toHaveCount(0);
});

test('4工程は閉じたとき落ち着いた灰色、開いた工程だけ原本PNGの筆跡で点灯する',async({page,context})=>{
 const s=initialState(),r=newRound(s,'2026-10-16',true);s.rounds.push(r);
 const shared={state:s,revision:0};await backend(context,shared);await login(page);
 await page.locator('.round-list-item').click();
 for(const width of [320,375,430,1280]){
  await page.setViewportSize({width,height:812});
   const closed=await page.locator('.stage-1 > .stage-trigger').evaluate(el=>({image:getComputedStyle(el).backgroundImage,color:getComputedStyle(el).color}));
   expect(closed.color).toBe('rgb(96, 107, 102)');expect(closed.image).toBe('none');
  for(let n=1;n<=4;n++){
   await page.locator(`.stage-${n} > .stage-trigger`).click();
   const style=await page.locator(`.stage-${n} > .stage-trigger`).evaluate(el=>({image:getComputedStyle(el).backgroundImage,color:getComputedStyle(el).color}));
   expect(style.image).toContain(`${['green','blue','orange','red'][n-1]}-light`);
    expect(style.color).not.toBe(closed.color);
    await page.locator(`.stage-${n} > .stage-trigger`).click();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width!==1280)await page.screenshot({path:`test-results/pencil-stages-${width}.png`});
 }
 expect(shared.revision).toBe(0);
});

test('変更のない注文編集を開いても画面移動に未保存警告を出さない',async({page,context})=>{
 const s=initialState(),r=newRound(s,'2026-10-16',true);s.rounds.push(r);
 const shared={state:s,revision:0};await backend(context,shared);await login(page);
 await page.locator('.round-list-item').click();await page.locator('.stage-1 > .stage-trigger').click();
 await page.getByRole('button',{name:'個人注文',exact:true}).click();
 await page.locator('.buyer-grid .buyer').first().click();
 await expect(page.locator('.order-editor')).toHaveAttribute('data-unsaved','false');
 const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
 await page.getByRole('button',{name:'集計',exact:true}).click();
 expect(dialogs).toHaveLength(0);
 expect(shared.revision).toBe(0);
});

test('未確定・保留・一部受取・0円・高額と長い名前を誤って完了扱いにしない',async({page,context})=>{
 const s=initialState(),r=newRound(s,'2026-10-16',true);s.rounds.push(r);r.status='納品済み';
 r.products=[{id:'bread',name:'定番のパン',category:'パン',price:190,cost:130},{id:'unknown',name:'価格未確定の長い商品名',category:'焼き菓子',price:null,cost:null},{id:'expensive',name:'高額なセット',category:'パン',price:12345670,cost:10000000},{id:'free',name:'0円の商品',category:'パン',price:0,cost:0}];
 const names=['通常','長い名前の購入者とても長い名前','高額','単価不明','受取済み','0円','一部受取','保留','注文のない保留'];
 s.buyers=names.map((name,i)=>({id:`b${i}`,name,kana:`あ${i}`,active:true,fixed:[]}));
 names.forEach((name,i)=>{if(i!==8)r.orders[`b${i}`]={name,quantities:{[i===2?'expensive':i===3?'unknown':i===5?'free':'bread']:i===6?2:1}};});
 s.collectionEntries=[{id:'paid',roundId:r.id,buyerId:'b4',date:r.date,received:190,note:'全額受取',requestId:'paid'},{id:'partial',roundId:r.id,buyerId:'b6',date:r.date,received:190,note:'一部受取',requestId:'partial'}];
 saveCollectionCase(s,{roundId:r.id,buyerId:'b7',received:90,reason:'原因が分からないので調べたい'});
 saveCollectionCase(s,{roundId:r.id,buyerId:'b8',received:0,reason:'原因が分からないので調べたい'});
 const shared={state:s,revision:0};await backend(context,shared);await login(page);await page.locator('.round-list-item').click();await page.locator('.stage-4 > .stage-trigger').click();
 const active=page.locator('.collection-list > .collection-entry');await expect(active).toHaveCount(7);
 await expect(page.locator('[data-buyer="b3"].collection-entry')).toContainText('金額未確定');await expect(page.locator('[data-buyer="b3"] .collection-pay')).toHaveCount(0);
 await expect(page.locator('[data-buyer="b7"]')).toContainText('差額を確認中');await expect(page.locator('[data-buyer="b7"] .collection-pay')).toHaveCount(0);
 await expect(page.locator('[data-buyer="b8"]')).toContainText('差額を確認中');
 await expect(page.locator('[data-buyer="b6"]')).toContainText('一部受取 190円');await expect(page.locator('[data-buyer="b6"] .collection-pay')).toHaveCount(0);
 await expect(page.locator('.collection-completed summary')).toContainText('2人');
 for(const width of [320,375,430,1280]){await page.setViewportSize({width,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.locator('[data-buyer="b3"] .collection-open').click();await expect(page.locator('[data-buyer="b3"]')).toContainText('請求単価が未確定');
 await page.locator('.collection-completed summary').click();await expect(page.locator('.collection-completed [data-buyer="b5"]')).toContainText('集金不要0円');
 expect(shared.revision).toBe(0);
});

test('集金は工程色と行密度を保ち、既存受取の充当先を分けて確認できる',async({page,context})=>{
 const s=initialState(),r=newRound(s,'2026-09-11',true);s.rounds.push(r);r.status='納品済み';r.collectionLive=true;
 r.products=[{id:'p',name:'パン',price:1650,cost:1200}];r.orders.hori={name:'堀',quantities:{p:1}};
 s.receivableItems=[{id:'july',kind:'opening',buyerId:'hori',date:'2026-07-24',amount:1670,reason:'未受取',note:'7月24日分'}];
 s.collectionEntries=[{id:'cash',roundId:r.id,buyerId:'hori',date:r.date,received:1650,adjustment:0,note:'現金受取',requestId:'cash'}];
 const shared={state:s,revision:0};await backend(context,shared);await login(page);
 await page.locator('.round-list-item').click();await page.locator('.stage-4 > .stage-trigger').click();
 for(const width of [320,375,430]){
  await page.setViewportSize({width,height:812});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('[data-buyer="hori"] .collection-overview').evaluate(x=>x.getBoundingClientRect().height)).toBeLessThanOrEqual(50);
  expect(await page.locator('.collection-pay').count()).toBe(0);
 }
 await page.locator('[data-buyer="hori"] .collection-open').click();
 await page.getByRole('button',{name:/2026-09-11分への充当を確認/}).click();
 expect(shared.state.collectionEntries).toEqual(s.collectionEntries);
 expect(shared.state.collectionAllocations).toHaveLength(1);
 expect(collectionPosition(shared.state,r.id,'hori').due.map(x=>x.balance)).toEqual([1670]);
 await expect(page.locator('[data-buyer="hori"]')).toContainText('2026-09-11 1,650円');
});
