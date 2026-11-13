import {test,expect} from '@playwright/test';
import {initialState,newRound,collectionPosition} from '../../src/domain.js';
import {saveOtherSale} from '../../src/other-sales.js';
import {backend,login} from './workflow-helpers.js';

for(const width of [320,375,430]){
 test(`${width}px：集金・外部現金・仕入先振込を別々に保存して再開`,async({browser})=>{
  const context=await browser.newContext({viewport:{width,height:812}}),page=await context.newPage();
  const state=initialState(),old=newRound(state,'2026-10-16',true),round=newRound(state,'2026-10-30',true);
  state.rounds.push(old,round);round.orders.hori={name:'堀',quantities:{brown:1}};round.invoice=200;
  saveOtherSale(state,{name:'外部商品',date:round.date,qty:2,unitPrice:200,unitCost:0,paymentStatus:'paid',test:true});
  const shared={state,revision:0};
  try{
   await backend(context,shared);await login(page);
   await page.locator('.round-list-item').filter({hasText:'2026/10/30'}).click();
   await page.locator('.stage-4 > .stage-trigger').click();
   await expect(page.getByText('外部販売の現金引渡し')).toBeVisible();
   await page.locator('.cash-work-section').first().locator('summary').first().click();
   await page.getByLabel('今回受け取った現金').fill('150');
   await page.getByLabel('引渡し元・内容').fill('販売担当');
   await page.getByRole('button',{name:'引渡しを保存'}).click();
   await expect.poll(()=>shared.state.externalCashReceipts.length).toBe(1);
   await expect(page.locator('.cash-work-section').first()).toContainText('未回収 250円');
   const supplier=page.locator('.supplier-payment');await supplier.locator('summary').first().click();
   await supplier.getByText('支払予定額・期限を設定／訂正').click();
   await page.getByLabel('仕入先への支払予定額').fill('300');
   await page.getByLabel('設定・訂正理由').fill('納品書を確認');
   await page.getByRole('button',{name:'予定を保存'}).click();
   await expect.poll(()=>shared.state.supplierPlans.length).toBe(1);
   await expect(supplier).toContainText('支払予定 300円');
   const before=collectionPosition(shared.state,round.id,'hori').balance;
   await page.reload();await page.locator('.round-list-item').filter({hasText:'2026/10/30'}).click();
   await page.locator('.stage-4 > .stage-trigger').click();
   await expect(page.locator('.cash-work-section').first()).toContainText('未回収 250円');
   await expect(page.locator('.supplier-payment')).toContainText('未振込');
   expect(collectionPosition(shared.state,round.id,'hori').balance).toBe(before);
   await page.screenshot({path:`test-results/cash-${browser.browserType().name()}-${width}.png`,fullPage:true});
  }finally{await context.close();}
 });
}
