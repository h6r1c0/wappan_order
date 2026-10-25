import {PDFDocument} from 'pdf-lib';
import {installPreviewProbe,openPdf,pdfBytes} from './print-preview-helpers.js';
import { test, expect } from "@playwright/test";
import { addSale, collections, initialState, newRound, report, stockRemaining, validate } from "../../src/domain.js";
import { setSalesOrderQuantities, upgrade } from "../../src/commerce.js";
import * as XLSX from "xlsx";
import fs from "node:fs/promises";
async function qaFont(page) {
  if (process.env.QA_FONT_DIR) {
    await page.route('https://qa-fonts.test/**', async route => {
      const name=new URL(route.request().url()).pathname.split('/').pop();
      await route.fulfill({contentType:'font/woff2',body:await fs.readFile(process.env.QA_FONT_DIR+'/files/'+name),headers:{'access-control-allow-origin':'*'}});
    });
    const css=(await Promise.all([400,500,600,700].map(weight =>
      fs.readFile(process.env.QA_FONT_DIR+`/${weight}.css`,'utf8'))))
      .join('\n').replaceAll('./files/','https://qa-fonts.test/files/');
    await page.addStyleTag({content:css+"\n* { font-family: 'Noto Sans JP', sans-serif !important; }"});
    await page.evaluate(()=>document.fonts.ready);
  }
  if (process.env.QA_FONT_CSS) {
    await page.addStyleTag({
      content: await fs.readFile(process.env.QA_FONT_CSS, "utf8"),
    });
    await page.evaluate(() => document.fonts.ready);
  }
}
async function backend(context, shared) {
  await context.route("https://test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url()),
      method = route.request().method();
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
        headers: { "access-control-allow-origin": "*" },
      });
    if (method === "OPTIONS") return json({});
    if (url.pathname.includes("/auth/v1/token")) {
      shared.authBody = route.request().postData();
      return json({
        access_token:
          "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjo0MDAwMDAwMDAwfQ.fake",
        refresh_token: "fake-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: "00000000-0000-0000-0000-000000000001",
          email: "staff@example.test",
          aud: "authenticated",
          role: "authenticated",
        },
      });
    }
    if (url.pathname.includes("/auth/v1/logout")) return json({});
    if (url.pathname.includes("/rest/v1/wappan_workspace"))
      return json({
        data: shared.state,
        revision: shared.revision,
        updated_at: new Date().toISOString(),
      });
    if (url.pathname.includes("/rest/v1/rpc/wappan_save")) {
      const b = route.request().postDataJSON();
      if (b.expected_revision !== shared.revision)
        return json({ code: "40001", message: "CONFLICT" }, 409);
      try {
        validate(b.payload);
        shared.state = b.payload;
        shared.revision++;
        return json(shared.revision);
      } catch (e) {
        return json({ message: e.message }, 400);
      }
    }
    if(url.pathname.includes('/rest/v1/rpc/wappan_round_activity'))
      return json(shared.activity||[]);
    if (url.pathname.includes('/rest/v1/rpc/wappan_admin_list'))
      return shared.staff?.[0]?.role==='admin' ? json(shared.staff) : json({code:'42501',message:'FORBIDDEN'},403);
    if (url.pathname.includes('/rest/v1/rpc/wappan_admin_change')) {
      if (!shared.staff) return json({code:'42501',message:'FORBIDDEN'},403);
      const {action_arg,target_arg}=route.request().postDataJSON();
      const target=shared.staff.find(x=>x.id===target_arg);
      if(action_arg==='disable' && target.role==='admin' && shared.staff.filter(x=>x.active&&x.role==='admin').length===1)
        return json({code:'P0001',message:'LAST_ADMIN'},400);
      if(action_arg==='transfer') { target.role='admin'; shared.staff[0].role='staff'; }
      if(action_arg==='disable')target.active=false;
      return json('ok');
    }
    if (url.pathname.includes('/functions/v1/staff-invite')) {
      if (!shared.staff) return json({error:'管理者のみ操作できます'},403);
      const email=route.request().postDataJSON().email;
      shared.staff.push({id:'00000000-0000-0000-0000-000000000002',email,role:'staff',active:true});
      return json({result:'added'});
    }
    return json({});
  });
}
async function login(page) {
  await page.clock.setFixedTime(new Date('2026-09-15T03:00:00Z'));
  await page.goto("/");
  await qaFont(page);
  await page
    .getByLabel("メールアドレス", { exact: true })
    .fill("staff@example.test");
  await page
    .getByLabel("パスワード", { exact: true })
    .fill("test-password-123");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(
    page.getByRole("button", { name: '注文回を作成' }),
  ).toBeVisible();
}
async function nav(page, name) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
async function closeToast(page) {
  const b = page.getByRole("button", { name: "お知らせを閉じる" });
  if (await b.count()) await b.click();
}

async function openRound(page, date = '2026-09-11') {
  await page.getByRole('button', {name:'注文回を作成'}).click();
  await page.getByLabel('納品予定日').fill(date);
  await page.getByRole('button', {name:'この納品日で注文を始める'}).click();
}
function preparedState() {
  const state=initialState();
  state.products.forEach(p=>{if(p.manual==null)p.gross=394;});
  state.productImports.push('2026-09');
  return state;
}
async function setQty(page, name, value) {
  if (!await page.getByLabel(`${name} 直接入力`,{exact:true}).count()) await page.getByRole('button', {name:new RegExp(`^${name} [0-9]+、直接入力する$`)}).click();
  await page.getByLabel(`${name} 直接入力`).fill(String(value));
}
async function openAfter(page, name) {
  await page.locator('.stage-3 > .stage-trigger').click();
  await page.getByRole('button',{name:'欠品なしを確認'}).click();
  await page.locator('.after-work').filter({has:page.locator('summary', {hasText:name})}).locator('summary').first().click();
}

test('ログインの主従と入力欄をスマホ幅で確認する', async ({page,context}) => {
  await backend(context,{state:preparedState(),revision:0});
  await page.goto('/'); await qaFont(page);
  await expect(page.getByRole('img',{name:'わっぱん'})).toBeVisible();
  await expect(page.getByRole('button',{name:'ログイン',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'パスワードを忘れた方'})).toHaveClass(/login-reset/);
  for (const width of [320,375,430]) {
    await page.setViewportSize({width,height:812});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/login-${width}.png`});
  }
});

test('ログアウト後、画面に入力された認証情報で再ログインできる', async ({page,context}) => {
  const shared={state:preparedState(),revision:0};
  await backend(context,shared); page.on('dialog',d=>d.accept());
  await login(page);
  await page.getByRole('button',{name:'ログアウト'}).click();
  await expect(page.getByRole('img',{name:'わっぱん'})).toBeVisible();
  await expect(page.getByLabel('メールアドレス',{exact:true})).toBeVisible();
  // ブラウザの自動入力が React の change を送らない場合を模擬する。
  await page.evaluate(() => {
    document.querySelector('input[name="email"]').value='staff@example.test';
    document.querySelector('input[name="password"]').value='reused-password';
  });
  await page.getByRole('button',{name:'ログイン',exact:true}).click();
  await expect(page.getByRole('button',{name:'注文回を作成'})).toBeVisible();
  expect(shared.authBody).toContain('reused-password');
});

test('設定の係招待と管理者引継ぎ、最後の管理者保護',async({page,context})=>{
  const shared={state:preparedState(),revision:0,staff:[{id:'00000000-0000-0000-0000-000000000001',email:'staff@example.test',role:'admin',active:true}]};
  await backend(context,shared);page.on('dialog',d=>d.accept());await login(page);
  for(const width of [320,375,430]){
    await page.setViewportSize({width,height:812});
    await nav(page,'設定');
    await page.getByRole('tab',{name:'係・権限',exact:true}).click();
    await expect(page.getByText('staff@example.test')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/settings-${width}.png`});
  }
  await page.getByLabel('係をメールで招待').fill('next@example.test');
  await page.getByRole('button',{name:'招待',exact:true}).click();
  await expect(page.getByText('next@example.test')).toBeVisible();
  await page.getByRole('button',{name:/管理者を引き継ぐ/}).click();
  await expect(page.locator('.staff-settings')).toHaveCount(0);
  expect(shared.staff.find(x=>x.email==='next@example.test').role).toBe('admin');
});

test('業務順: 注文開始、個人・販売・おやつ、発注数とスマホ幅', async ({page,context}) => {
  const shared={state:preparedState(),revision:0};
  await backend(context,shared); page.on('dialog',d=>d.accept()); await login(page);
  await expect(page.getByRole('button',{name:'注文回を作成'})).toBeVisible();
  await openRound(page);
  await expect(page.locator('.stage-trigger')).toHaveCount(4);
  await expect(page.locator('.stage-number')).toHaveText(['01','02','03','04']);
  await expect(page.locator('.stage-1 .purpose')).toHaveCount(3);
  await expect(page.locator('.stage-2 .stage-content')).toHaveCount(0);
  await page.locator('.stage-1 > .stage-trigger').click();
  await expect(page.locator('.stage-1 .stage-content')).toHaveCount(0);
  await page.locator('.stage-1 > .stage-trigger').click();
  for(const width of [320,375,430]) {
    await page.setViewportSize({width,height:812});
    await page.evaluate(()=>scrollTo(0,0));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/order-start-${width}.png`});
  }
  await page.setViewportSize({width:375,height:812});
  await page.locator('.buyer-index').getByRole('button',{name:'すべて',exact:true}).click();
  await page.getByRole('button',{name:'ホリ',exact:true}).click();
  await expect(page.getByRole('button',{name:/ガレット 数量 2、直接入力する/})).toBeVisible();
  await page.locator('.order-editor .product-add > summary').click();
  await expect(page.getByRole('button',{name:/ガレット 数量 2、直接入力する/})).toBeVisible();
  await page.locator('.order-editor').getByLabel('商品名を検索').fill('黒糖');
  await expect(page.getByRole('button',{name:/黒糖ブレッド 数量 0、直接入力する/})).toBeVisible();
  await page.getByRole('button',{name:'黒糖ブレッド 数量を増やす'}).click();
  await page.getByRole('button',{name:'保存して次の購入者へ'}).click();
  await expect(page.locator('.personal-saved[open]')).toContainText('黒糖ブレッド');
  await expect(page.locator('.personal-saved[open]')).not.toContainText('くるみパン');
  await page.getByRole('button',{name:'販売用',exact:true}).click();
  await page.locator('.stage-1 .order-editor .product-add > summary').click();
  await page.locator('.stage-1 .order-editor').getByRole('button',{name:/^パン/}).click();
  await page.getByRole('button',{name:'くるみパン 数量を増やす'}).click();
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('region',{name:'今回の販売用注文'})).toContainText('くるみパン');
  await expect(page.getByRole('region',{name:'今回の販売用注文'})).toContainText('合計 1個');
  await expect(page.getByRole('region',{name:'今回の販売用注文'})).not.toContainText('黒糖ブレッド');
  await expect(page.locator('.stage-1 .order-editor .product-row')).toHaveCount(0);
  await page.getByRole('button',{name:'おやつ用',exact:true}).click();
  await page.locator('.stage-1 .order-editor .product-add > summary').click();
  await page.locator('.stage-1 .order-editor').getByRole('button',{name:/^パン/}).click();
  await page.getByRole('button',{name:'くるみパン 数量を増やす'}).click();
  await page.locator('.stage-1 .order-editor').getByRole('button',{name:'保存',exact:true}).click();
  await page.locator('.stage-2 > .stage-trigger').click();
  await expect(page.locator('.stage-2 > .stage-content')).toBeVisible();
  await expect(page.locator('.stage-1 .purpose')).toHaveCount(0);
  await expect(page.locator('.delivery-total-row').filter({hasText:'くるみパン'})).toContainText('2個');
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:'test-results/fax-list.png'});
  await expect(page.locator('.copyable')).toHaveCount(0);
  await page.getByRole('button',{name:'注文確定にする'}).click();
  await page.getByRole('button',{name:'‹ 注文一覧へ'}).click();
  await expect(page.locator('.round-list-item')).toContainText('注文確定');
  for(const width of [320,375,430]) {
    await page.setViewportSize({width,height:812});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/home-${width}.png`});
  }
  expect(shared.state.rounds[0].orders.hori.quantities.brown).toBe(1);
  expect(shared.state.stocks.some(s=>s.productId==='walnut'&&s.qty===1)).toBe(true);
  expect(shared.state.events[0].lines.some(l=>l.productId==='walnut'&&l.qty===1)).toBe(true);
});

test('納品後: 未確認2個を購入者と名称なし外部へ分割', async ({page,context}) => {
  const shared={state:preparedState(),revision:0};
  const r=newRound(shared.state,'2026-09-11',true); shared.state.rounds.push(r);
  setSalesOrderQuantities(shared.state,r.id,{walnut:2});
  const st=shared.state.stocks.find(s=>s.productId==='walnut');
  addSale(shared.state,st,{date:r.date,qty:2,price:st.price,destinationType:'unknown',paymentStatus:'unconfirmed'});
  await backend(context,shared); await login(page);
  await page.locator('.round-list-item').click();
  await openAfter(page,'販売先を割り当てる');
  const work=page.locator('.sales-workspace:visible');
  await work.getByLabel('くるみパンの割当状況').getByRole('button',{name:'販売先・数量を入力'}).click();
  await setQty(work,'くるみパン 割当数量',1);
  await work.locator('.buyer-index').getByRole('button',{name:'すべて',exact:true}).click();
  await work.getByRole('button',{name:'ホリ',exact:true}).click();
  await work.locator('.inline-assignment').getByRole('button',{name:'保存',exact:true}).click();
  await expect(work.getByLabel('くるみパンの割当状況')).toContainText('未割当 1個');
  await work.getByLabel('くるみパンの割当状況').getByRole('button',{name:'販売先・数量を入力'}).click();
  await work.getByRole('button',{name:'支払い済み',exact:true}).click();
  await expect(work.getByLabel('販売先・団体名（任意）')).toHaveValue('');
  await work.locator('.inline-assignment').getByRole('button',{name:'保存',exact:true}).click();
  await work.locator('.completed-stocks summary').click();
  await expect(work.getByLabel('くるみパンの割当状況')).toContainText('ホリ 1個');
  await expect(work.getByLabel('くるみパンの割当状況')).toContainText('割当済み');
  expect(shared.state.sales.reduce((n,s)=>n+s.qty,0)).toBe(2);
  expect(collections(shared.state,'','',r.id,true).find(x=>x.id==='hori').onsite).toBe(st.price);
  for(const width of [320,375,430]) {
    await page.setViewportSize({width,height:812});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/sale-${width}.png`});
  }
});

test('納品と集金: 欠品修正、納品書総額、通常受取、差額繰越', async ({page,context}) => {
  const shared={state:preparedState(),revision:0};
  const r=newRound(shared.state,'2026-09-11',true); r.orders.hori={name:'ホリ',quantities:{galette:2}};
  r.status='注文確定'; r.planned=structuredClone(r.orders); shared.state.rounds.push(r);
  await backend(context,shared); await login(page); await page.locator('.round-list-item').click();
  await page.locator('.stage-3 > .stage-trigger').click();
  await expect(page.getByRole('heading',{name:'欠品確認'})).toBeVisible();
  await page.getByRole('button',{name:'欠品がある場合 ›'}).click();
  expect(shared.state.rounds[0].shortageConfirmation).toBeFalsy();
  await page.getByRole('button',{name:'欠品ありとして明細へ進む'}).click();
  await page.getByLabel('欠品商品').selectOption('galette');
  await page.getByLabel('実入荷数').fill('1');
  await setQty(page,'ホリ 実渡し数',1);
  await page.getByRole('button',{name:'配分結果を確認',exact:true}).click();
  await page.getByRole('button',{name:'この配分で確定'}).click();
  expect(shared.state.rounds[0].orders.hori.quantities.galette).toBe(2);
  expect(shared.state.rounds[0].orders.hori.deliveredQuantities.galette).toBe(1);
  await page.getByRole('button',{name:'すべての欠品処理を確認'}).click();
  await page.getByLabel('税込合計').fill('100');
  await page.locator('.invoice-form').getByRole('button',{name:'保存',exact:true}).click();
  await expect.poll(()=>shared.state.rounds[0].invoice).toBe(100);
  await expect.poll(()=>shared.state.rounds[0].status).toBe('納品済み');
  await page.locator('.stage-4 > .stage-trigger').click();
  await expect(page.locator('.collection-list > .collection-entry')).toHaveCount(1);
  for(const width of [320,375,430]) {
    await page.setViewportSize({width,height:812});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/collection-${width}.png`});
  }
  const person=page.locator('.collection-entry[data-buyer="hori"]');
  await person.locator('.collection-open').click();
  const due=collections(shared.state,'','',r.id,true)[0].total;
  await person.getByLabel('実際受取額',{exact:true}).fill(String(due+10));
  await person.getByLabel('金額が違う理由').selectOption('多く受け取ったので次回へ預かる');
  await person.getByRole('button',{name:'受取額を保存'}).click();
  await expect(person.locator('.collection-amount')).toHaveText('預かり10円');
  await page.locator('.collection-completed summary').click();
  await person.locator('.collection-open').click();
  await person.getByLabel('実際受取額',{exact:true}).fill('10');
  await person.getByLabel('金額が違う理由').selectOption('返金がある');
  await person.getByLabel('返金額',{exact:true}).fill('10');
  await person.getByRole('button',{name:'返金を保存'}).click();
  expect(shared.state.collectionEntries).toHaveLength(2);
  expect(shared.state.collectionEntries[1].received).toBe(-10);
  expect(shared.state.rounds[0].invoice).toBe(100);
});

test('請求漏れ・過去未収を一度の内訳展開で確認し、対象別に受け取る',async({page,context})=>{
  const shared={state:preparedState(),revision:0};
  shared.state.buyers.push({id:'yogo',name:'余語',active:true,fixed:[]});
  const sep=newRound(shared.state,'2026-09-11');
  sep.orders.hori={name:'堀',quantities:{brown:1,donut:2}};
  sep.products.find(p=>p.id==='donut').price=190;
  shared.state.rounds.push(sep);
  shared.state.receivableItems=[
    {id:'added',kind:'additional',buyerId:'hori',roundId:sep.id,date:sep.date,amount:380,reason:'商品請求漏れ',note:'9/11 ツイストドーナツ 2個入り ×2 請求漏れ'},
    {id:'old',kind:'opening',buyerId:'yogo',date:'2026-07-24',amount:1670,reason:'未払い / 未受取',note:'7/24分 未受取'}
  ];
  const oct=newRound(shared.state,'2026-10-16');shared.state.rounds.push(oct);
  await backend(context,shared);await login(page);
  await page.locator('.round-list-item').filter({hasText:'2026/09/11'}).click();
  await page.locator('.stage-4 > .stage-trigger').click();
  const hori=page.locator('.collection-entry').filter({hasText:'ホリ'});
  await hori.locator('.collection-open').click();
  await expect(hori).toContainText('380円');
  await expect(hori.locator('.collection-totals')).toContainText('今回請求');
  await hori.locator('.collection-breakdown summary').click();
  await expect(hori.locator('.charge-line').nth(1)).toContainText('黒糖ブレッド');
  await expect(hori.locator('.charge-line').nth(2)).toContainText('380円');
  await expect(hori.locator('.charge-line').nth(2)).not.toContainText('2026-09-11');
  await page.getByRole('button',{name:'‹ 注文一覧へ'}).click();
  await page.locator('.round-list-item').filter({hasText:'2026/10/16'}).click();
  await page.locator('.stage-4 > .stage-trigger').click();
  await expect(page.locator('.collection-entry').filter({hasText:'余語'}).locator('.collection-amount')).toHaveText('1,670円');
  for(const width of [320,375,430]){
    await page.setViewportSize({width,height:812});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  const yogo=page.locator('.collection-entry').filter({hasText:'余語'});
  await yogo.getByRole('button',{name:'未収分受取'}).click();
  expect(collections(shared.state,'','',oct.id).length).toBe(0);
  await expect.poll(()=>shared.state.collectionEntries.at(-1)?.received).toBe(1670);
});

test('10月初回のExcel準備と同月再利用、LINE候補、固定注文追加',async({page,context})=>{
  const shared={state:initialState(),revision:0}; await backend(context,shared); await login(page);
  await openRound(page,'2026-10-16');
  await expect(page.getByRole('button',{name:'10月のExcel注文表を取り込む'})).toBeVisible();
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['商品名','税込価格'],['10月限定パン',324]]),'10月');
  await page.getByRole('button',{name:'10月のExcel注文表を取り込む'}).click();
  await page.getByLabel('Excelファイルを選ぶ').setInputFiles({name:'oct.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})});
  await page.getByRole('button',{name:'読み取って確認へ'}).click();
  await page.getByLabel('商品区分',{exact:true}).selectOption('once');
  await page.getByRole('button',{name:'確認した商品を登録'}).click();
  await expect(page.getByText('商品情報を更新')).toBeVisible();
  await page.getByRole('button',{name:'注文内容を貼り付け'}).click();
  await page.getByRole('textbox',{name:'注文内容',exact:true}).fill('ホリ\n黒糖ブレッド 1');
  await page.getByRole('button',{name:'取込内容を確認'}).click();
  await expect(page.getByRole('dialog').getByText('個人注文・ホリ')).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
  await page.getByRole('button',{name:'‹ 注文一覧へ'}).click();
  await openRound(page,'2026-10-30');
  await expect(page.getByText('商品情報を更新')).toBeVisible();
  await expect(page.getByRole('button',{name:'10月のExcel注文表を取り込む'})).toHaveCount(0);
  await nav(page,'設定');
  await page.getByRole('button',{name:'購入者',exact:true}).click();
  await page.getByRole('button',{name:/ホリ.*固定注文/}).click();
  await expect(page.getByRole('dialog').locator('.product-row')).toHaveCount(2);
  await page.getByText('＋ 固定注文を追加').click();
  await page.getByLabel('商品名を検索').fill('黒糖');
  await page.getByRole('dialog').getByRole('button',{name:/黒糖ブレッド/}).click();
  await expect(page.getByRole('dialog').locator('.product-row')).toHaveCount(3);
  await closeToast(page);
  await page.getByRole('button',{name:'購入者・固定注文を保存'}).click();
  expect(shared.state.buyers.find(b=>b.id==='hori').fixed).toHaveLength(3);
});

test('未登録の1個入りだけ保留し、再読込後に追加して注文へ反映',async({page,context})=>{
  const shared={state:initialState(),revision:0};await backend(context,shared);await login(page);
  await openRound(page,'2026-10-16');
  await page.getByRole('button',{name:'注文内容を貼り付け'}).click();
  await page.getByRole('textbox',{name:'注文内容',exact:true}).fill('ホリ\n黒糖ブレッド 1\n天然酵母ハイジの白パン・1個入り 16');
  await page.getByRole('button',{name:'取込内容を確認'}).click();
  await expect(page.getByText('保留',{exact:true})).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
  expect(shared.state.rounds[0].orders.hori.quantities.brown).toBe(1);
  expect(shared.state.rounds[0].pendingImports).toHaveLength(1);
  await page.reload();
  await page.locator('.round-list-item').filter({hasText:'2026/10/16'}).click();
  await page.getByRole('button',{name:'保留中の注文 1行を確認'}).click();
  await page.getByRole('button',{name:'保留行を確認'}).click();
  await page.getByRole('button',{name:/天然酵母ハイジの白パン.*編集/}).click();
  await page.getByRole('button',{name:'商品表にない販売単位を追加'}).click();
  await expect(page.getByLabel('今回の販売価格（分かる場合）')).toHaveValue('120');
  await page.getByRole('button',{name:'この注文回に商品を追加'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
  expect(shared.state.rounds[0].pendingImports).toHaveLength(0);
  const product=shared.state.products.find(p=>p.name==='天然酵母ハイジの白パン 1個');
  expect(product?.manual).toBe(120);
  expect(shared.state.rounds[0].orders.hori.quantities[product.id]).toBe(16);
});

test('販売先割当: 10個から外部6個、購入者から複数商品をまとめて確定', async ({page,context}) => {
  const shared={state:preparedState(),revision:0};
  const r=newRound(shared.state,'2026-09-11',true);shared.state.rounds.push(r);
  setSalesOrderQuantities(shared.state,r.id,{walnut:10,brown:2});
  const walnut=shared.state.stocks.find(s=>s.productId==='walnut');
  const brown=shared.state.stocks.find(s=>s.productId==='brown');
  addSale(shared.state,walnut,{date:r.date,qty:10,price:walnut.price,destinationType:'unknown',paymentStatus:'unconfirmed'});
  addSale(shared.state,brown,{date:r.date,qty:2,price:brown.price,destinationType:'unknown',paymentStatus:'unconfirmed'});
  await backend(context,shared);await login(page);await page.locator('.round-list-item').click();
  await openAfter(page,'販売先を割り当てる');
  let work=page.locator('.sales-workspace:visible');
  await work.getByLabel('くるみパンの割当状況').getByRole('button',{name:'販売先・数量を入力'}).click();
  await setQty(work,'くるみパン 割当数量',6);
  await work.getByRole('button',{name:'支払い済み',exact:true}).click();
  await work.locator('.inline-assignment').getByRole('button',{name:'保存',exact:true}).click();
  await expect(work.getByLabel('くるみパンの割当状況')).toContainText('未割当 4個');
  await page.getByRole('button',{name:'購入者から複数商品をまとめて入力 ›',exact:true}).click();
  work=page.locator('.sales-workspace:visible');
  await work.locator('.buyer-index').getByRole('button',{name:'すべて',exact:true}).click();
  await work.getByRole('button',{name:'ホリ',exact:true}).click();
  await setQty(work,'くるみパン 割当数量',4);await setQty(work,'黒糖ブレッド 割当数量',2);
  await work.getByRole('button',{name:'この2商品の割当を保存'}).click();
  expect(shared.state.sales.filter(x=>x.stockId===walnut.id&&x.destinationType==='unknown')).toHaveLength(0);
  expect(shared.state.sales.filter(x=>x.destinationType==='buyer').reduce((n,s)=>n+s.qty,0)).toBe(6);
});

test('複数端末: 古いrevisionの保存は拒否して最新データを守る', async ({browser}) => {
  const shared={state:initialState(),revision:0};
  const aContext=await browser.newContext(),bContext=await browser.newContext();
  try {
    await backend(aContext,shared);await backend(bContext,shared);
    const a=await aContext.newPage(),b=await bContext.newPage();
    b.on('dialog',d=>d.accept());
    await login(a);await login(b);
    await openRound(a,'2026-09-11');
    await b.getByRole('button',{name:'注文回を作成'}).click();
    await b.getByLabel('納品予定日').fill('2026-09-18');
    await b.getByRole('button',{name:'この納品日で注文を始める'}).click();
    await expect(b.getByRole('alert')).toContainText('別の係が先に保存しました');
    expect(shared.state.rounds.map(r=>r.date)).toEqual(['2026-09-11']);
    await b.getByRole('button',{name:'お知らせを閉じる'}).click();
    await b.getByRole('dialog').getByRole('button',{name:'閉じる'}).click();
    await b.getByRole('button',{name:'最新を読込'}).click();
    await expect(b.locator('.round-list-item')).toContainText('2026/09/11');
  } finally {await aContext.close();await bContext.close();}
});

test('スライスは独立商品で選び、販売用の個人注文数を参照する', async ({page,context}) => {
  const shared={state:preparedState(),revision:0};
  await backend(context,shared); await login(page); await openRound(page);
  await page.locator('.buyer-index').getByRole('button',{name:'すべて',exact:true}).click();
  await page.getByRole('button',{name:'ホリ',exact:true}).click();
  await page.locator('.order-editor .product-add > summary').click();
  await page.locator('.order-editor').getByRole('button',{name:/^パン/}).click();
  await page.getByRole('button',{name:'湯種食パン 数量を増やす'}).click();
  await expect(page.getByLabel('カット',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'保存して次の購入者へ'}).click();
  await expect.poll(()=>shared.state.rounds[0].orders.hori.quantities.bread).toBe(1);
  await page.getByRole('button',{name:'販売用',exact:true}).click();
  await page.getByLabel('個人注文数を表示').first().check();
  await expect(page.getByLabel('個人注文数を表示').last()).toBeChecked();
  await page.locator('.stage-1 .order-editor .product-add > summary').click();
  await page.locator('.stage-1 .order-editor').getByRole('button',{name:/^パン/}).click();
  await expect(page.locator('.product-row').filter({hasText:'湯種食パン'})).toContainText('個人注文 2個'); // 淺野の固定1個＋ホリの追加1個
  await page.getByRole('button',{name:'湯種食パン 数量を増やす'}).click();
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('region',{name:'今回の販売用注文'})).not.toContainText('カット');
  expect(shared.state.stocks.find(stock=>stock.productId==='bread'&&stock.cut)).toBeUndefined();
});

test('集計と商品管理: 年度利益はテストを除外、検索はカテゴリ横断', async ({page,context}) => {
  const shared={state:preparedState(),revision:0};
  const normal=newRound(shared.state,'2026-10-16',false);
  normal.orders.hori={name:'ホリ',quantities:{brown:1}};
  normal.invoice=100;normal.status='精算済み';shared.state.rounds.push(normal);
  const testRound=newRound(shared.state,'2026-09-11',true);
  testRound.orders.hori={name:'ホリ',quantities:{brown:10}};
  testRound.invoice=100;testRound.status='精算済み';shared.state.rounds.push(testRound);
  await backend(context,shared);await login(page);
  await nav(page,'集計');
  await page.getByLabel('対象年度（4月〜翌3月）').selectOption('2026');
  await expect(page.locator('.hero>strong')).toHaveText('330円');
  await page.getByRole('button',{name:'テストを含める'}).click();
  await expect(page.locator('.hero>strong')).toHaveText('4,530円');
  await expect(page.getByText('検証用の表示です。')).toBeVisible();
  expect(testRound.test).toBe(true);
  await page.getByRole('button',{name:'年度実績'}).click();
  await expect(page.locator('.hero>strong')).toHaveText('330円');
  await expect(page.getByText('販売額',{exact:true})).toBeVisible();
  await expect(page.getByText('仕入額',{exact:true})).toBeVisible();
  await nav(page,'設定');
  await page.getByRole('button',{name:'焼き菓子',exact:true}).click();
  await page.getByLabel('商品名を検索').fill('黒糖');
  await expect(page.locator('.master-row').filter({hasText:'黒糖ブレッド'})).toBeVisible();
  for(const width of [320,375,430]){
    await page.setViewportSize({width,height:812});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
test('精算は納品と利益から判定し、操作履歴は控えめに展開して共有する',async({page,context})=>{
 const shared={state:preparedState(),revision:7,activity:[{revision:7,updated_at:'2026-10-24T15:10:46Z',description:'納品・仕入額を保存',actor_account:'staff@example.test'}]};
 const r=newRound(shared.state,'2026-09-11',true);r.orders.hori={name:'ホリ',quantities:{brown:1}};
 r.status='納品済み';r.shortageConfirmation='none';r.invoice=100;shared.state.rounds.push(r);
 await backend(context,shared);await login(page);
 const row=page.locator('.round-list-item').filter({hasText:'2026/09/11'});
 await expect(row.locator('.tag-集金中')).toHaveText('集金中');
 await row.click();
 await expect(page.getByText('集金中',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'精算完了を確認'})).toHaveCount(0);
 await page.locator('.round-activity summary').click();
 await expect(page.getByText('納品・仕入額を保存')).toBeVisible();
 await expect(page.getByText(/ログイン：staff@example.test/)).toBeVisible();
 for(const width of [320,375,430,1024]){
   await page.setViewportSize({width,height:812});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 expect(shared.revision).toBe(7);
});

test('未収を残して今回分を終了しても元の請求と現金は変わらず、一覧・詳細で状態が一致する',async({page,context})=>{
 const shared={state:preparedState(),revision:2};
 const r=newRound(shared.state,'2026-09-11',true);r.collectionLive=true;
 r.status='納品済み';r.shortageConfirmation='none';r.invoice=100;
 r.orders.hori={name:'ホリ',quantities:{brown:1}};shared.state.rounds.push(r);
 await backend(context,shared);await login(page);
 const row=page.locator('.round-list-shell').filter({hasText:'2026/09/11'});
 await expect(row.locator('.tag-集金中')).toBeVisible();
 await row.locator('.round-list-menu summary').click();
 await row.getByRole('button',{name:'未収を残して今回分を終了'}).click();
 await expect(page.getByRole('dialog').getByText('今回分の未収：1人 ／ 430円')).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'未収を残して今回分を終了'}).click();
 await expect(row.locator('.tag-完了')).toBeVisible();
 await expect(row.locator('.tag-繰越')).toHaveText('未収繰越あり');
 await page.screenshot({path:'test-results/round-carry-375.png',fullPage:true});
 expect(shared.state.rounds[0].collectionClose).toBeTruthy();
 expect(shared.state.collectionEntries).toHaveLength(0);
 await page.reload();
 await expect(page.locator('.round-list-item').filter({hasText:'2026/09/11'}).locator('.tag-完了')).toBeVisible();
 await page.locator('.round-list-item').filter({hasText:'2026/09/11'}).click();
 await expect(page.locator('.delivery-heading + p .tag-繰越')).toBeVisible();
 for(const width of [320,375,430,1024]){
   await page.setViewportSize({width,height:812});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test('購入者の読みは表示名を変えず五十音索引と検索に使う', async ({page,context}) => {
  const shared={state:preparedState(),revision:0};
  shared.state.buyers.push({id:'special',name:'山﨑',kana:'やまざき',active:true,fixed:[]});
  await backend(context,shared);await login(page);await openRound(page);
  await page.locator('.buyer-index').getByRole('button',{name:'や',exact:true}).click();
  await expect(page.getByRole('button',{name:'山﨑',exact:true})).toBeVisible();
  await page.getByPlaceholder('名前を検索').fill('やまざき');
  await expect(page.getByRole('button',{name:'山﨑',exact:true})).toBeVisible();
  await nav(page,'設定');await page.getByRole('button',{name:'購入者',exact:true}).click();
  await page.getByPlaceholder('購入者名を検索').fill('やまざき');
  await expect(page.locator('.master-row').filter({hasText:'山﨑'})).toBeVisible();
  expect(shared.state.buyers.find(x=>x.id==='special').name).toBe('山﨑');
});

test('購入者検索からの追加は氏名を引き継ぎ、読みを修正して注文へ進める',async({page,context})=>{
  const shared={state:preparedState(),revision:0};
  await backend(context,shared);await login(page);await openRound(page);
  await page.getByPlaceholder('名前を検索').fill('満保');
  await page.getByRole('button',{name:'＋ 追加'}).click();
  await expect(page.getByLabel('新しい購入者名')).toHaveValue('満保');
  await page.getByLabel('よみがな').fill('まんぼ');
  await page.getByRole('button',{name:'追加して選ぶ'}).click();
  await expect(page.locator('.order-editor h2')).toContainText('満保');
  expect(shared.state.buyers.find(b=>b.name==='満保')?.kana).toBe('まんぼ');
  await mobileShots(page,'new-buyer');
});

test('佐藤の新規登録は別名や非表示重複商品で阻まれず、読みを保持する',async({page,context})=>{
  const shared={state:preparedState(),revision:0};
  shared.state.products.push({...shared.state.products.find(x=>x.id==='bean'),id:'old-bean',active:false,retiredDuplicate:'bean'});
  shared.state.buyers.push({id:'sasaki',name:'佐々木',kana:'ささき',active:true,fixed:[]});
  await backend(context,shared);await login(page);await openRound(page);
  await page.getByPlaceholder('名前を検索').fill('佐藤');
  await page.getByRole('button',{name:'＋ 追加'}).click();
  await expect(page.getByLabel('新しい購入者名')).toHaveValue('佐藤');
  await page.getByLabel('よみがな').fill('さとう');
  await page.getByRole('button',{name:'追加して選ぶ'}).click();
  await expect(page.locator('.order-editor h2')).toContainText('佐藤');
  expect(shared.state.buyers.find(b=>b.name==='佐藤')?.kana).toBe('さとう');
});

test('おやつの職員分と共通単価の家庭請求を確認後に保存し、集金内訳に分けて表示する',async({page,context})=>{
  const shared={state:preparedState(),revision:0};
  shared.state.buyers.push({id:'sato',name:'佐藤',kana:'さとう',active:true,fixed:[]});
  const r=newRound(shared.state,'2026-10-16',true);r.status='注文確定';shared.state.rounds.push(r);
  const e={id:'event-qa',roundId:r.id,date:r.date,name:'運動会リハ',test:true,entryMode:'round',lines:[
    {id:'bean-qa',productId:'bean',name:'こしあんぱん',qty:6,used:0,cost:130},
    {id:'apple-qa',productId:'apple',name:'りんごデニッシュ',qty:6,used:0,cost:151},
  ]};shared.state.events.push(e);r.eventIds.push(e.id);
  await backend(context,shared);await login(page);await page.locator('.round-list-item').click();
  await openAfter(page,'おやつ使用・財政請求');
  await page.locator('.snack-billing > summary').click();
  await page.getByLabel('行事・おやつ名').fill('運動会リハのおやつ');
  await setQty(page,'こしあんぱん 財政請求数',3);
  await setQty(page,'りんごデニッシュ 財政請求数',3);
  await page.getByRole('button',{name:'＋ 請求先'}).click();
  await page.locator('.snack-household').getByLabel('購入者').selectOption('sato');
  await page.locator('.snack-household').getByLabel('食べた商品').selectOption('');
  await setQty(page,'食数',2);
  await expect(page.getByLabel('請求単価')).toHaveValue('150');
  await mobileShots(page,'snack-billing');
  expect(shared.state.events[0].billing).toBeUndefined();
  await page.getByRole('button',{name:'確認した請求を保存'}).click();
  expect(shared.state.events[0].billing.household[0].unitPrice).toBe(150);
  expect(shared.state.events[0].lines.every(l=>l.used===0)).toBe(true);
  await page.locator('.stage-4 > .stage-trigger').click();
  const entry=page.locator('.collection-entry').filter({hasText:'佐藤'});
  await expect(entry).toContainText('300円');
  await entry.locator('.collection-open').click();
  await entry.locator('.collection-breakdown summary').click();
  await expect(entry.locator('.collection-source-totals')).toContainText('おやつ');
  await expect(entry.locator('.collection-source-totals')).toContainText('300円');
  await mobileShots(page,'snack-collection');
});

test('共通単価グループを複数家庭へ一括割当し、その他の販売を通常商品と分ける',async({page,context})=>{
  const shared={state:preparedState(),revision:0};
  shared.state.buyers.push(...['佐藤','鈴木'].map((name,i)=>({id:`family${i}`,name,kana:'さとう',active:true,fixed:[]})));
  const r=newRound(shared.state,'2026-10-16',true);r.status='注文確定';shared.state.rounds.push(r);
  const e={id:'group-event',roundId:r.id,date:r.date,name:'運動会リハ',test:true,entryMode:'round',lines:[
    {id:'bean-g',productId:'bean',name:'こしあんぱん',qty:5,used:3,usedConfirmed:true,cost:130},
    {id:'apple-g',productId:'apple',name:'りんごデニッシュ',qty:5,used:3,usedConfirmed:true,cost:151},
  ]};shared.state.events.push(e);r.eventIds.push(e.id);
  await backend(context,shared);await login(page);await page.locator('.round-list-item').click();
  await openAfter(page,'おやつ使用・財政請求');
  await page.locator('.snack-billing > summary').click();
  await page.getByLabel('行事・おやつ名').fill('運動会リハ');
  await setQty(page,'こしあんぱん 財政請求数',2);
  await setQty(page,'りんごデニッシュ 財政請求数',2);
  await page.getByRole('button',{name:'＋ グループ'}).click();
  const group=page.locator('.snack-group');
  await group.getByLabel(/こしあんぱん 3個/).check();
  await group.getByLabel(/りんごデニッシュ 3個/).check();
  await expect(group.getByLabel('共通請求単価')).toHaveValue('150');
  await group.locator('summary').click();
  await group.locator('.snack-group-buyers label').filter({hasText:'佐藤'}).locator('input[type=checkbox]').check();
  await group.locator('.snack-group-buyers label').filter({hasText:'鈴木'}).locator('input[type=checkbox]').check();
  await expect(group).toContainText('対象 2個 ／ 割当 2個 ／ 未割当 0個');
  await mobileShots(page,'group-snack');
  expect(shared.state.events[0].billing).toBeUndefined();
  await page.getByRole('button',{name:'確認した請求を保存'}).click();
  expect(shared.state.events[0].billing.groups[0].lineIds).toEqual(['bean-g','apple-g']);
  expect(collections(shared.state,'','',r.id,true).find(x=>x.id==='family0').snack).toBe(150);
  await page.locator('.after-work').filter({has:page.locator('summary',{hasText:'販売先を割り当てる'})}).locator('summary').first().click();
  await page.locator('.other-sales > summary').click();
  await page.getByRole('button',{name:'＋ 販売を記録'}).click();
  await page.getByLabel('商品名・内容').fill('花房さん提供のレモン');
  await page.getByLabel('販売単価').fill('100');
  await page.getByLabel('現金の受取状況').selectOption('paid');
  await page.locator('.other-sales-form').getByRole('button',{name:'保存',exact:true}).click();
  expect(shared.state.otherSales[0].unitCost).toBe(0);
  expect(shared.state.stocks).toHaveLength(0);
  await page.locator('.other-sales').scrollIntoViewIfNeeded();
  await mobileShots(page,'other-sales');
});

async function mobileShots(page,prefix) {
  await closeToast(page);
  for (const width of [320,375,430]) {
    await page.setViewportSize({width,height:812});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/${prefix}-${width}.png`});
  }
}
test('欠品抽選: 未選択ゲート、1人1個を優先、確認後に集金へ反映、連絡文を表示',async({page,context})=>{
  const shared={state:preparedState(),revision:0};
  shared.state.buyers=['渡辺','近藤','堀','浅野'].map((name,i)=>({id:'b'+i,name,kana:['わたなべ','こんどう','ほり','あさの'][i],active:true,fixed:[]}));
  const r=newRound(shared.state,'2026-09-11',true);r.status='注文確定';
  shared.state.buyers.forEach((b,i)=>r.orders[b.id]={name:b.name,quantities:{walnut:[3,2,1,1][i]}});
  r.planned=structuredClone(r.orders);shared.state.rounds.push(r);
  await backend(context,shared);await login(page);await page.locator('.round-list-item').click();
  await page.locator('.stage-3 > .stage-trigger').click();
  await expect(page.getByLabel('税込合計')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'欠品なしを確認'})).toBeEnabled();
  await page.getByRole('button',{name:'欠品がある場合 ›'}).click();
  await page.getByRole('button',{name:'欠品ありとして明細へ進む'}).click();
  await page.getByLabel('欠品商品').selectOption('walnut');await page.getByLabel('実入荷数').fill('5');
  await page.getByRole('button',{name:'公平抽選',exact:true}).click();
  await page.getByRole('button',{name:'抽選して結果を確認'}).click();
  await expect(page.getByRole('heading',{name:'配分結果を確認'})).toBeVisible();
  expect(shared.state.rounds[0].shortages).toBeUndefined();
  await mobileShots(page,'shortage-lottery');
  await page.getByRole('button',{name:'この配分で確定'}).click();
  const saved=shared.state.rounds[0];expect(saved.shortages[0].allocations.map(x=>x.delivered).reduce((n,q)=>n+q,0)).toBe(5);
  expect(saved.orders.b2.deliveredQuantities.walnut).toBe(1);expect(saved.orders.b3.deliveredQuantities.walnut).toBe(1);
  expect(saved.orders.b0.quantities.walnut).toBe(3);
  await page.getByText('欠品連絡文',{exact:true}).click();
  await expect(page.locator('.shortage-message textarea').first()).toContainText('集金額から差し引いています');
  await page.getByRole('button',{name:'すべての欠品処理を確認'}).click();
  await page.locator('.stage-4 > .stage-trigger').click();
  expect(collections(shared.state,'','',r.id,true).reduce((n,x)=>n+x.total,0)).toBe(r.products.find(p=>p.id==='walnut').price*5);
  await mobileShots(page,'shortage-collection');
  // 金額・主操作・名前は互いに重ならない。
  const row=page.locator('.collection-entry').first();const name=await row.locator('.collection-buyer-name').boundingBox(),amount=await row.locator('.collection-amount').boundingBox(),pay=await row.locator('.collection-pay').boundingBox();
  expect(name.x+name.width).toBeLessThanOrEqual(amount.x+1);expect(amount.x+amount.width).toBeLessThanOrEqual(pay.x+1);
  await page.locator('.stage-4 > .stage-trigger').click();await expect(page.locator('.stage-4 .stage-content')).toHaveCount(0);
});
test('場所なしセット、既知のおやつ単価・使用数、税込合計の同じ行保存',async({page,context})=>{
  const shared={state:preparedState(),revision:0};const r=newRound(shared.state,'2026-09-11',true);shared.state.rounds.push(r);
  setSalesOrderQuantities(shared.state,r.id,{walnut:3});
  const {setSnackOrderQuantities}=await import('../../src/commerce.js');setSnackOrderQuantities(shared.state,r.id,{walnut:3});r.status='注文確定';
  await backend(context,shared);await login(page);await page.locator('.round-list-item').click();await page.locator('.stage-3 > .stage-trigger').click();
  await page.getByRole('button',{name:'欠品なしを確認'}).click();
  expect(shared.state.rounds[0].shortageConfirmation).toBe('none');
  await page.locator('.set-preparation > summary').click();
  await page.getByRole('button',{name:'＋ セットを作る'}).click();await page.getByLabel('セット名').fill('おためしセット');await page.getByLabel('1セットの販売価格').fill('300');
  await setQty(page,'くるみパン セット必要数',1);await page.getByRole('button',{name:'セットを保存',exact:true}).click();
  expect(shared.state.markets).toHaveLength(0);expect(shared.state.bundles[0].roundId).toBe(r.id);
  await page.getByRole('button',{name:'販売を記録',exact:true}).click();await page.getByRole('button',{name:'この内容で販売を記録'}).click();
  expect(shared.state.bundleSales[0].marketId).toBe(null);expect(shared.state.bundleSales[0].qty).toBe(1);
  await page.getByLabel('税込合計').fill('1000');await page.locator('.invoice-input-row').getByRole('button',{name:'保存',exact:true}).click();expect(shared.state.rounds[0].invoice).toBe(1000);
  await mobileShots(page,'delivery');
  await page.locator('.after-work').filter({has:page.locator('summary',{hasText:'おやつ使用・財政請求'})}).locator('summary').first().click();
  await setQty(page,'くるみパン おやつ使用数',2);await page.locator('.snack-claim').getByRole('button',{name:'保存',exact:true}).click();
  expect(shared.state.events[0].lines[0].used).toBe(2);expect(shared.state.events[0].lines[0].cost).toBe(138);
  await mobileShots(page,'snack');
});
test('発注前の販売数を一覧上で調整し、工程移動で見出しへ自動スクロールする',async({page,context})=>{
  const shared={state:preparedState(),revision:0};const r=newRound(shared.state,'2026-09-11',true);r.orders.hori={name:'ホリ',quantities:{walnut:2}};shared.state.rounds.push(r);
  await backend(context,shared);await login(page);await page.locator('.round-list-item').click();await page.locator('.stage-2 > .stage-trigger').click();
  await page.getByRole('button',{name:/くるみパンの販売用数量を調整/}).click();
  await page.getByRole('button',{name:'くるみパン 販売用の最終調整を増やす'}).click();
  expect(shared.state.stocks.find(s=>s.productId==='walnut')).toBeUndefined();
  await page.locator('.fax-adjust').getByRole('button',{name:'保存',exact:true}).click();
  expect(shared.state.stocks.find(s=>s.productId==='walnut').qty).toBe(1);await expect(page.locator('.delivery-total-row').filter({hasText:'くるみパン'})).toContainText('3個');
  await mobileShots(page,'fax-adjust');
  await page.locator('.stage-3 > .stage-trigger').click();await expect(page.locator('.stage-3 > .stage-content').getByText('欠品確認',{exact:true})).toBeVisible();
  await expect.poll(async()=>page.locator('.stage-3 > .stage-trigger').evaluate(e=>e.getBoundingClientRect().top)).toBeLessThan(650);
  await page.locator('.stage-3 > .stage-trigger').click();await expect(page.locator('.stage-3 .stage-content')).toHaveCount(0);
});

test('納品前の販売記録表と個人仕分け表をA4で印刷し、注文データを変えない',async({page,context})=>{
  const shared={state:preparedState(),revision:0};
  const round=newRound(shared.state,'2026-09-11');shared.state.rounds.push(round);
  setSalesOrderQuantities(shared.state,round.id,{milk:1,brown:7});
  const brownStock=shared.state.stocks.find(x=>x.productId==='brown');
  brownStock.name='白うさぎと黒うさぎのチョコパン　2種×2個';
  // A historic delivery can be fully sold and still needs its original record sheet.
  for(const stock of shared.state.stocks.filter(x=>x.roundId===round.id))
    addSale(shared.state,stock,{qty:stock.qty,destinationType:'external',paymentStatus:'paid'});
  for(let i=0;i<25;i++)round.products.push({id:`extra-${i}`,name:i===0?'白うさぎと黒うさぎのチョコパン　2種×2個':`商品${i}`,category:'パン',price:200,faxOrder:100+i});
  shared.state.buyers=Array.from({length:16},(_,i)=>({id:`buyer-${i}`,name:`購入者${i+1}`,kana:`あ${String(i).padStart(2,'0')}`,active:true,fixed:[]}));
  for(let i=0;i<16;i++)round.orders[`buyer-${i}`]={name:`購入者${i+1}`,quantities:i===0?
    Object.fromEntries(round.products.filter(p=>p.id.startsWith('extra-')).map(p=>[p.id,1])):{milk:1}};
  const unchanged=structuredClone(shared.state);
  await backend(context,shared);await login(page);await page.locator('.round-list-item').click();
  await page.locator('.stage-3 > .stage-trigger').click();
  await expect(page.getByRole('button',{name:'販売記録表を印刷'})).toBeVisible();
  await expect(page.getByRole('button',{name:'個人仕分け表を印刷'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'欠品確認'})).toBeVisible();
  await installPreviewProbe(page);
  for(const width of [320,375,430,1280]){
    await page.setViewportSize({width,height:812});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/print-entry-${width}.png`});
  }
  const salesUrl=await openPdf(page,'販売記録表を印刷');
  const sales=await pdfBytes(page,salesUrl);
  const salesDoc=await PDFDocument.load(sales);
  expect(salesDoc.getPageCount()).toBe(1);
  expect(salesDoc.getTitle()).toBe('販売記録表 2026-09-11');
  await fs.writeFile('test-results/sales-print-a4.pdf',sales);
  // The active preview is not revoked while the next independent one opens.
  const repeat=await openPdf(page,'販売記録表を印刷');expect(repeat).not.toBe(salesUrl);
  expect((await pdfBytes(page,salesUrl)).length).toBe(sales.length);
  const sortingUrl=await openPdf(page,'個人仕分け表を印刷');
  const sorting=await pdfBytes(page,sortingUrl);
  const sortingDoc=await PDFDocument.load(sorting);
  expect(sortingDoc.getPageCount()).toBe(1);
  expect(sortingDoc.getTitle()).toBe('個人注文仕分け表 2026-09-11');
  await fs.writeFile('test-results/sorting-print-a4.pdf',sorting);
  expect(await page.evaluate(()=>[window.__prints,window.__dialogs])).toEqual([0,0]);
  await page.evaluate(()=>{window.open=window.__nativeOpen;});
  const downloads=[];context.on('page',p=>p.on('download',d=>downloads.push(d)));
  const popupPromise=page.waitForEvent('popup');
  await page.getByRole('button',{name:'販売記録表を印刷'}).click();
  const popup=await popupPromise;
  await expect.poll(()=>popup.url().startsWith('blob:')||downloads.length>0).toBe(true);
  await popup.close();
  await expect(page.getByRole('heading',{name:'欠品確認'})).toBeVisible();
  expect(shared.revision).toBe(0);expect(shared.state).toEqual(unchanged);
});

test('仕分けが2枚必要な場合は各ページへ均等に置き、空白の追加ページを作らない',async({page,context})=>{
  const shared={state:preparedState(),revision:0};
  const round=newRound(shared.state,'2026-10-16');shared.state.rounds.push(round);
  shared.state.buyers=Array.from({length:21},(_,i)=>({id:`b-${i}`,name:`購入者${i+1}`,kana:`あ${String(i).padStart(2,'0')}`,active:true,fixed:[]}));
  shared.state.buyers.forEach(b=>{round.orders[b.id]={name:b.name,quantities:{milk:1}};});
  await backend(context,shared);await login(page);await page.locator('.round-list-item').click();
  await page.locator('.stage-3 > .stage-trigger').click();
  await installPreviewProbe(page);
  const bytes=await pdfBytes(page,await openPdf(page,'個人仕分け表を印刷'));
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  await fs.writeFile('test-results/sorting-print-two-pages-a4.pdf',bytes);
  expect(shared.revision).toBe(0);
});
