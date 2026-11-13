import {test,expect} from '@playwright/test';
import {initialState,newRound} from '../../src/domain.js';
import {backend,login} from './workflow-helpers.js';

for(const width of [320,375,430])test(`${width}px：取消済み現金と後日の預かりを旧請求の受取済みにしない`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height:812}}),page=await context.newPage();
 const state=initialState(),old=newRound(state,'2026-10-16',true),later=newRound(state,'2026-10-30',true);
 state.rounds.push(old,later);
 old.orders.hori={name:'堀',quantities:{brown:1}};
 old.products=[{id:'brown',name:'黒糖ブレッド',price:100,cost:50}];
 state.collectionEntries.push({id:'old-void',roundId:later.id,buyerId:'hori',date:later.date,received:100,adjustment:0,reason:'未収受取',itemId:`round:${old.id}:hori`});
 state.collectionCorrections=[{id:'void',kind:'collectionEntries',targetId:'old-void',roundId:later.id,buyerId:'hori',reason:'取消'}];
 state.collectionEntries.push({id:'held',roundId:later.id,buyerId:'hori',date:later.date,received:1150,adjustment:0,reason:'多く受け取ったので次回へ預かる'});
 const shared={state,revision:0};
 try{
  await backend(context,shared);await login(page);
  await page.locator('.round-list-item').filter({hasText:'2026/10/16'}).click();
  await page.locator('.stage-4 > .stage-trigger').click();
  const row=page.locator('.collection-entry').filter({hasText:'堀'});
  await expect(row.getByRole('button',{name:'全額受取'})).toBeVisible();
  await page.screenshot({path:`test-results/cross-round-${browser.browserType().name()}-${width}.png`,fullPage:true});
 }finally{await context.close();}
});
