import {test,expect} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
import fs from 'node:fs/promises';
import {initialState,newRound,addSale} from '../../src/domain.js';
import {setSalesOrderQuantities} from '../../src/commerce.js';
import {installPreviewProbe,openPdf,pdfBytes} from './print-preview-helpers.js';

test.use({browserName:'webkit'});
async function setup(page,context){
  const state=initialState();
  const round=newRound(state,'2026-09-11');state.rounds.push(round);
  const next=newRound(state,'2026-10-16');state.rounds.push(next);
  setSalesOrderQuantities(state,round.id,{milk:1});
  const stock=state.stocks.find(s=>s.roundId===round.id);
  addSale(state,stock,{qty:1,destinationType:'external',paymentStatus:'paid'});
  round.orders.hori={name:'ホリ',quantities:{milk:1}};
  let writes=0;
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
    if(url.pathname.includes('/rpc/'))writes++;
    return json({});
  });
  await page.goto('/');
  await page.getByLabel('メールアドレス',{exact:true}).fill('staff@example.test');
  await page.getByLabel('パスワード',{exact:true}).fill('test-password-123');
  await page.getByRole('button',{name:'ログイン',exact:true}).click();
  await page.locator('.round-list-item').filter({hasText:'2026/09/11'}).click();
  await page.locator('.stage-3 > .stage-trigger').click();
  return ()=>writes;
}

test('WebKit: 同じ入口で販売→再印刷→仕分け→再印刷→販売、旧プレビューを保持',async({page,context})=>{
  const writes=await setup(page,context);await installPreviewProbe(page);
  for(const width of [320,375,430]){
    await page.setViewportSize({width,height:812});
    await expect(page.getByRole('button',{name:'販売記録表を印刷'})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/print-webkit-entry-${width}.png`});
  }
  // Same code path for Safari and Brave UAs. No scripted print/dialog is used.
  await page.evaluate(()=>Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=>
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.7 Mobile/15E148 Safari/604.1'}));
  const first=await openPdf(page,'販売記録表を印刷');
  const bytes=await pdfBytes(page,first);
  expect((await PDFDocument.load(bytes)).getTitle()).toBe('販売記録表 2026-09-11');
  await fs.writeFile('test-results/webkit-sales-a4.pdf',bytes);
  const second=await openPdf(page,'販売記録表を印刷');expect(second).not.toBe(first);
  const sorting=await pdfBytes(page,await openPdf(page,'個人仕分け表を印刷'));
  expect((await PDFDocument.load(sorting)).getPageCount()).toBe(1);
  await fs.writeFile('test-results/webkit-sorting-a4.pdf',sorting);
  await page.evaluate(()=>{window.__previewWindows.at(-1).closed=true;}); // canceled/closed preview
  await openPdf(page,'個人仕分け表を印刷');
  await page.evaluate(()=>Object.defineProperty(navigator,'userAgent',{configurable:true,get:()=>
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.7 Brave/1 Mobile/15E148 Safari/604.1'}));
  await openPdf(page,'販売記録表を印刷');
  expect((await pdfBytes(page,first)).length).toBe(bytes.length);
  expect(await page.evaluate(()=>[window.__prints,window.__dialogs,window.__previewUrls.length])).toEqual([0,0,5]);
  await expect(page.getByText('Safariの共有から',{exact:false})).toHaveCount(0);
  await page.getByRole('button',{name:'‹ 注文一覧へ'}).click();
  await page.locator('.round-list-item').filter({hasText:'2026/10/16'}).click();
  await page.locator('.stage-3 > .stage-trigger').click();
  await installPreviewProbe(page);
  const other=await pdfBytes(page,await openPdf(page,'販売記録表を印刷'));
  expect((await PDFDocument.load(other)).getTitle()).toBe('販売記録表 2026-10-16');
  expect(writes()).toBe(0);
});

test('WebKit: 連打・通信失敗から再試行・ポップアップ拒否の代替リンク',async({page,context})=>{
  const writes=await setup(page,context);await installPreviewProbe(page);
  await page.route('**/NotoSansJP-Regular.ttf',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.getByRole('button',{name:'販売記録表を印刷'}).evaluate(el=>{el.click();el.click();});
  await expect(page.getByRole('alert')).toContainText('帳票を作成できませんでした');
  expect(await page.evaluate(()=>window.__previewWindows.length)).toBe(1);
  await page.unroute('**/NotoSansJP-Regular.ttf');
  await page.evaluate(()=>{window.open=()=>null;});
  await page.getByRole('button',{name:'販売記録表を印刷'}).click();
  const link=page.getByRole('link',{name:'PDFを開く'});await expect(link).toBeVisible();
  expect((await PDFDocument.load(await pdfBytes(page,await link.getAttribute('href')))).getPageCount()).toBe(1);
  await page.evaluate(()=>{window.open=window.__nativeOpen;});
  const downloads=[];context.on('page',p=>p.on('download',d=>downloads.push(d)));
  const popupPromise=page.waitForEvent('popup');
  await page.getByRole('button',{name:'販売記録表を印刷'}).click();
  const popup=await popupPromise;
  await expect.poll(()=>popup.url().startsWith('blob:')||downloads.length>0).toBe(true);
  await popup.close();
  await expect(page.getByRole('button',{name:'販売記録表を印刷'})).toBeEnabled();
  expect(writes()).toBe(0);
});
