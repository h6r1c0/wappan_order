import {test,expect} from '@playwright/test';
import {initialState,newRound,addSale} from '../../src/domain.js';
import {setSalesOrderQuantities} from '../../src/commerce.js';

test.use({browserName:'webkit'});

test('WebKit相当: 販売済みの帳票、連打防止、再印刷と仕分け1ページ',async({page,context})=>{
  const state=initialState();
  const round=newRound(state,'2026-09-11');state.rounds.push(round);
  setSalesOrderQuantities(state,round.id,{milk:1});
  const stock=state.stocks.find(s=>s.roundId===round.id);
  addSale(state,stock,{qty:1,destinationType:'external',paymentStatus:'paid'});
  round.orders.hori={name:'ホリ',quantities:{milk:1}};
  await context.route('https://test.supabase.co/**',async route=>{
    const url=new URL(route.request().url());
    const json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*'}});
    if(route.request().method()==='OPTIONS')return json({});
    if(url.pathname.includes('/auth/v1/token'))return json({
      access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjo0MDAwMDAwMDAwfQ.fake',
      refresh_token:'fake-refresh',expires_in:3600,token_type:'bearer',
      user:{id:'00000000-0000-0000-0000-000000000001',email:'staff@example.test',aud:'authenticated',role:'authenticated'},
    });
    if(url.pathname.includes('/rest/v1/wappan_workspace'))return json({data:state,revision:0,updated_at:new Date().toISOString()});
    return json({});
  });
  await page.goto('/');
  await page.getByLabel('メールアドレス',{exact:true}).fill('staff@example.test');
  await page.getByLabel('パスワード',{exact:true}).fill('test-password-123');
  await page.getByRole('button',{name:'ログイン',exact:true}).click();
  await page.locator('.round-list-item').click();
  await page.locator('.stage-3 > .stage-trigger').click();
  await page.evaluate(()=>{window.__prints=0;window.__alerts=0;window.print=()=>{window.__prints++};window.alert=window.confirm=()=>{window.__alerts++};});
  for(const width of [320,375,430]){
    await page.setViewportSize({width,height:812});
    await expect(page.getByRole('button',{name:'販売記録表を印刷'})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('button',{name:'販売記録表を印刷'}).click();
  await page.getByRole('button',{name:'販売記録表を印刷'}).click();
  expect(await page.evaluate(()=>window.__prints)).toBe(1);
  await page.emulateMedia({media:'print'});
  await expect(page.locator('.sales-print-row')).toHaveCount(1);
  await expect(page.locator('.sales-print-blank')).toHaveCount(1);
  await page.setViewportSize({width:900,height:1200});
  await page.screenshot({path:'test-results/print-webkit-sales.png'});
  await page.emulateMedia({media:'screen'});
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  await page.waitForTimeout(1550);
  await page.getByRole('button',{name:'個人仕分け表を印刷'}).click();
  expect(await page.evaluate(()=>window.__prints)).toBe(2);
  await page.emulateMedia({media:'print'});
  await expect(page.locator('.sorting-print-page')).toHaveCount(1);
  await expect(page.locator('.sorting-print-person')).toHaveCount(1);
  await page.screenshot({path:'test-results/print-webkit-sorting.png'});
  expect(await page.evaluate(()=>window.__alerts)).toBe(0);
  const extent=await page.locator('.sorting-print-page').evaluate(el=>el.getBoundingClientRect().height);
  expect(extent).toBeLessThan(960);
  await page.emulateMedia({media:'screen'});
  await page.waitForTimeout(1550);
  await page.getByRole('button',{name:'販売記録表を印刷'}).click();
  expect(await page.evaluate(()=>window.__prints)).toBe(3);
  expect(await page.evaluate(()=>window.__alerts)).toBe(0);
  await page.evaluate(()=>Object.defineProperty(navigator,'userAgent',{configurable:true,
    get:()=> 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'}));
  await page.waitForTimeout(1550);
  await page.getByRole('button',{name:'個人仕分け表を印刷'}).click();
  expect(await page.evaluate(()=>window.__prints)).toBe(4);
  await page.waitForTimeout(1550);
  await page.getByRole('button',{name:'販売記録表を印刷'}).click();
  expect(await page.evaluate(()=>window.__prints)).toBe(4);
  await expect(page.getByRole('status')).toContainText('Safariの共有から「プリント」');
  await page.emulateMedia({media:'print'});
  await expect(page.locator('.sales-print-row')).toHaveCount(1);
});
