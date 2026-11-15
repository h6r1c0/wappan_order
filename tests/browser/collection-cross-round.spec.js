import {test,expect} from '@playwright/test';
import {initialState,newRound} from '../../src/domain.js';
import {backend,login} from './workflow-helpers.js';

for(const width of [320,375,430])test(`${width}px：取消済み現金と後日の預かりを旧請求の受取済みにしない`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height:812}}),page=await context.newPage();
 const state=initialState(),old=newRound(state,'2026-10-16',true),later=newRound(state,'2026-10-30',true);
 state.rounds.push(old,later);
 old.status='納品済み';old.shortageConfirmation='none';old.invoice=100;
 later.status='納品済み';later.shortageConfirmation='none';later.invoice=0;
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
  const row=page.locator('.collection-entry[data-buyer="hori"]');
  await expect(row.getByRole('button',{name:'全額受取',exact:true})).toHaveCount(0);
  await row.locator('.collection-open').click();
  await row.getByRole('button',{name:'この現金を請求へ充当・残額を指定'}).click();
  await row.getByLabel(/2026-10-16の請求へ充当/).fill('100');
  await row.getByRole('button',{name:'充当と残額を保存'}).click();
  await expect(page.getByRole('status').filter({hasText:'1,050円を返金待ち'})).toBeVisible();
  await page.reload();
  await page.locator('.round-list-item').filter({hasText:'2026/10/16'}).click();
  await page.locator('.stage-4 > .stage-trigger').click();
  await page.getByText(/受取済み・過去分の登録/).click();
  await row.locator('.collection-open').click();
  await expect(row.locator('.cash-totals')).toContainText('1,150円');
  await expect(row.locator('.cash-totals')).toContainText('1,050円');
  expect(shared.state.collectionEntries).toHaveLength(2);
  expect(shared.state.collectionAllocations[0].held).toBe(1050);
  await page.screenshot({path:`test-results/cross-round-${browser.browserType().name()}-${width}.png`,fullPage:true});
 }finally{await context.close();}
});
