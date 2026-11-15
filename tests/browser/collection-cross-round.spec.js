import {test,expect} from '@playwright/test';
import {initialState,newRound,validate} from '../../src/domain.js';
import {backend,login} from './workflow-helpers.js';

for(const width of [320,375,430])test(`${width}px：取消済み現金と後日の預かりを旧請求の受取済みにしない`,async({page,context,browserName})=>{
 await page.setViewportSize({width,height:812});
 const state=initialState(),old=newRound(state,'2026-10-16',true),later=newRound(state,'2026-10-30',true);
 state.rounds.push(old,later);
 old.status='納品済み';old.shortageConfirmation='none';old.invoice=100;
 later.status='納品済み';later.shortageConfirmation='none';later.invoice=0;
 old.orders.hori={name:'堀',quantities:{brown:1}};
 old.products=[{id:'brown',name:'黒糖ブレッド',price:100,cost:50}];
 state.collectionEntries.push({id:'old-void',roundId:later.id,buyerId:'hori',date:later.date,received:100,adjustment:0,reason:'未収受取',note:'対象を指定した旧受取（取消済み）',itemId:`round:${old.id}:hori`});
 state.collectionCorrections=[{id:'void',kind:'collectionEntries',targetId:'old-void',roundId:later.id,buyerId:'hori',reason:'取消'}];
 state.collectionEntries.push({id:'held',roundId:later.id,buyerId:'hori',date:later.date,received:1150,adjustment:0,reason:'多く受け取ったので次回へ預かる',note:'実際の受取1150円'});
 validate(state);const shared={state,revision:0};
 {
  await backend(context,shared);await login(page);
  await page.locator('.round-list-item').filter({hasText:'2026/10/16'}).click();
  await page.locator('.stage-4 > .stage-trigger').click();
  const row=page.locator('.collection-entry[data-buyer="hori"]');
  await expect(row.getByRole('button',{name:'全額受取',exact:true})).toHaveCount(0);
  await row.locator('.collection-open').click();
  await row.getByRole('button',{name:'この現金を請求へ充当・残額を指定'}).click();
  await row.getByLabel(/2026-10-16の請求へ充当/).fill('100');
  await row.getByRole('button',{name:'充当と残額を保存'}).click();
  await expect(page.getByRole('alert').filter({hasText:'1,050円を返金待ち'})).toBeVisible();
  await page.reload();
  await page.locator('.round-list-item').filter({hasText:'2026/10/16'}).click();
  await page.locator('.stage-4 > .stage-trigger').click();
  await page.getByText(/受取済み・過去分の登録/).click();
  await row.locator('.collection-open').click();
  await expect(row.locator('.cash-totals')).toContainText('1,150円');
  await expect(row.locator('.cash-totals')).toContainText('1,050円');
  expect(shared.state.collectionEntries).toHaveLength(2);
  expect(shared.state.collectionAllocations[0].held).toBe(1050);
  await page.screenshot({path:`test-results/cross-round-${browserName}-${width}.png`,fullPage:true});
  if(width===375){
   await row.getByRole('button',{name:'実際に返した分を記録'}).click();
   await expect(row.getByRole('button',{name:'実施済みの返金を保存'})).toBeDisabled();
   expect(shared.state.collectionEntries).toHaveLength(2);
   await row.getByRole('button',{name:'請求・過去の履歴を調べる ›'}).click();
   await row.locator('.collection-history').filter({hasText:'1,150円'}).getByRole('button',{name:'この記録を確認・訂正 ›'}).click();
   await row.getByLabel('履歴の訂正理由').selectOption('操作ミス（現金の受取なし）');
   await expect(row.getByLabel('訂正後の実際受取額')).toHaveValue('0');
   await expect(row.getByText('取消のみで、新たな受取・返金は作りません。',{exact:false})).toBeVisible();
   await row.getByRole('button',{name:'対象記録の訂正を保存'}).click();
   await expect.poll(()=>shared.state.collectionCorrections.length).toBe(2);
   expect(shared.state.collectionEntries).toHaveLength(2);
  }
 }
});
