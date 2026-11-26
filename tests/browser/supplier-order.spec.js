import {test,expect} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
import {initialState,newRound} from '../../src/domain.js';

async function setup(page,context){
  const s=initialState();const r=newRound(s,'2026-11-27',true);s.rounds.push(r);
  r.orders.hori={name:'ホリ',quantities:{walnut:2}};
  r.products.push({id:'walnut',name:'くるみパン 2個',category:'パン',price:240,cost:180});
  const pdf=await PDFDocument.create(),sheet=pdf.addPage([841.89,595.28]);
  sheet.drawText('supplier test sheet',{x:40,y:550});
  s.supplierTemplates=[{id:'template',name:'11月注文書.pdf',kind:'bread',month:'2026-11',pdf:Buffer.from(await pdf.save()).toString('base64'),rows:[{id:'walnut-row',name:'くるみパン 2個',y:383,qtyX:315,kind:'bread-left'}]}];
  const shared={state:s,revision:1};
  await context.route('https://test.supabase.co/**',async route=>{
    const url=new URL(route.request().url());const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
    if(route.request().method()==='OPTIONS')return json({});
    if(url.pathname.includes('/auth/v1/token'))return json({access_token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjo0MDAwMDAwMDAwfQ.fake',refresh_token:'fake',expires_in:3600,token_type:'bearer',user:{id:'00000000-0000-0000-0000-000000000001',email:'staff@example.test',aud:'authenticated',role:'authenticated'}});
    if(url.pathname.includes('/rest/v1/wappan_workspace'))return json({data:shared.state,revision:shared.revision,updated_at:new Date().toISOString()});
    if(url.pathname.includes('/rest/v1/rpc/wappan_save')){const body=route.request().postDataJSON();if(body.expected_revision!==shared.revision)return json({code:'40001',message:'CONFLICT'},409);shared.state=body.payload;shared.revision++;return json(shared.revision);}
    return json({});
  });
  await page.goto('/');await page.getByLabel('メールアドレス',{exact:true}).fill('staff@example.test');await page.getByLabel('パスワード',{exact:true}).fill('password123');await page.getByRole('button',{name:'ログイン',exact:true}).click();
  await page.locator('.round-list-item').first().click();return shared;
}
for(const width of [320,375,430])test(`${width}px：案内文と発注書・ラベル設定を省スペースで操作`,async({page,context})=>{
  await page.setViewportSize({width,height:812});const shared=await setup(page,context);
  await page.locator('.stage-1 > .stage-trigger').click();
  await page.getByText('注文募集の案内文を作る').click();
  await expect(page.getByLabel('LINEへ送る文章')).toHaveValue(/11\/27（金）[\s\S]*11\/11（水）/);
  await expect(page.getByLabel('LINEへ送る文章')).toHaveValue(/花房母/);
  await expect(page.getByLabel('注文の連絡先')).toHaveCount(0);
  await page.getByRole('button',{name:'定型文・基本設定を変更'}).click();
  await page.getByLabel('注文の連絡先',{exact:true}).fill('変更した連絡先');
  await page.getByRole('button',{name:'基本設定を保存'}).click();
  await expect(page.getByLabel('LINEへ送る文章')).toHaveValue(/変更した連絡先/);
  await page.locator('.stage-2 > .stage-trigger').click();
  await expect(page.getByText('今回必要：')).toContainText('1商品');
  await page.getByRole('button',{name:'発注書PDFを作成して確認'}).click();
  await expect(page.getByText('発注済みにはまだ記録していません')).toBeVisible();
  expect(shared.state.supplierDispatches).toHaveLength(0);
  await expect(page.locator('.supplier-preview-result a').first()).toHaveAttribute('href',/^blob:/);
  await page.locator('.stage-4 > .stage-trigger').click();
  await expect(page.getByText('担当者名：未設定')).toBeVisible();
  await expect(page.getByLabel('集金袋ラベルの担当者名')).toHaveCount(0);
  await page.locator('.envelope-staff-compact').getByRole('button',{name:'変更'}).click();
  await page.getByLabel('集金袋ラベルの担当者名').fill('検証担当');
  await page.locator('.envelope-staff-editor').getByRole('button',{name:'保存'}).click();
  await expect(page.getByText('担当者名：検証担当')).toBeVisible();
  expect(shared.state.supplierOrderSettings.contact).toBe('変更した連絡先');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/supplier-order-${width}.png`,fullPage:true});
});
