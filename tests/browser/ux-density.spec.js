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
