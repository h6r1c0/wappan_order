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
    page.getByRole("button", { name: /新しい注文を始める/ }),
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
  await page.getByRole('button', {name:/新しい注文を始める/}).click();
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
  await page.getByRole('button',{name:'なし',exact:true}).click();
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
  // ブラウザの自動入力が React の change を送らない場合を模擬する。
  await page.evaluate(() => {
    document.querySelector('input[name="email"]').value='staff@example.test';
    document.querySelector('input[name="password"]').value='reused-password';
  });
  await page.getByRole('button',{name:'ログイン',exact:true}).click();
  await expect(page.getByRole('button',{name:/新しい注文を始める/})).toBeVisible();
  expect(shared.authBody).toContain('reused-password');
});

test('業務順: 注文開始、個人・販売・おやつ、発注数とスマホ幅', async ({page,context}) => {
  const shared={state:preparedState(),revision:0};
  await backend(context,shared); page.on('dialog',d=>d.accept()); await login(page);
  await expect(page.getByRole('button',{name:/新しい注文を始める/})).toBeVisible();
  await openRound(page);
  await expect(page.locator('.stage-trigger')).toHaveCount(4);
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
  await expect(page.getByRole('button',{name:/ガレット 数量 2、直接入力する/})).toHaveCount(0);
  await page.locator('.order-editor').getByRole('button',{name:'焼き菓子',exact:true}).click();
  await expect(page.getByRole('button',{name:/ガレット 数量 2、直接入力する/})).toBeVisible();
  await page.locator('.order-editor').getByLabel('商品名で探す').fill('黒糖');
  await expect(page.getByRole('button',{name:/黒糖ブレッド 数量 0、直接入力する/})).toBeVisible();
  await page.getByRole('button',{name:'黒糖ブレッド 数量を増やす'}).click();
  await page.getByRole('button',{name:'保存して次の購入者へ'}).click();
  await expect(page.locator('.personal-saved[open]')).toContainText('黒糖ブレッド');
  await expect(page.locator('.personal-saved[open]')).not.toContainText('くるみパン');
  await page.getByRole('button',{name:'販売用',exact:true}).click();
  await expect(page.locator('.order-editor').getByRole('button',{name:'パン',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'くるみパン 数量を増やす'}).click();
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('region',{name:'今回の販売用注文'})).toContainText('くるみパン');
  await expect(page.getByRole('region',{name:'今回の販売用注文'})).toContainText('合計 1個');
  await expect(page.getByRole('region',{name:'今回の販売用注文'})).not.toContainText('黒糖ブレッド');
  await expect(page.locator('.stage-1 .order-editor .product-row')).toHaveCount(0);
  await page.getByRole('button',{name:'おやつ用',exact:true}).click();
  await page.getByRole('button',{name:'くるみパン 数量を増やす'}).click();
  await page.getByRole('button',{name:'おやつ用を保存'}).click();
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
  await page.getByRole('button',{name:/売れた商品の販売先を割り当てる/}).click();
  await page.getByRole('button',{name:'商品から入力'}).click();
  await page.getByRole('button',{name:/くるみパン.*未割当 2/}).click();
  await setQty(page,'くるみパン 割当数量',1);
  await page.locator('.buyer-index').getByRole('button',{name:'すべて',exact:true}).click();
  await page.getByRole('button',{name:'ホリ',exact:true}).click();
  await page.getByRole('button',{name:/この1個を購入者として確定/}).click();
  await expect(page.getByLabel('くるみパンの割当状況')).toContainText('ホリ 1');
  await expect(page.getByLabel('くるみパンの割当状況')).toContainText('未割当 1');
  await setQty(page,'くるみパン 割当数量',1);
  await page.getByRole('button',{name:'外部購入者'}).click();
  await expect(page.getByLabel('外部販売先（任意）')).toHaveValue('');
  await page.getByRole('button',{name:'入金済み'}).click();
  await page.getByRole('button',{name:'この1個を外部販売として確定'}).click();
  await expect(page.getByLabel('くるみパンの割当状況')).toContainText('外部 1');
  await expect(page.getByLabel('くるみパンの割当状況')).toContainText('未割当 0');
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
  await expect(page.getByRole('group',{name:'欠品確認'})).toBeVisible();
  await page.getByRole('button',{name:'あり',exact:true}).click();
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
  await expect(page.locator('.collection-entry')).toHaveCount(1);
  for(const width of [320,375,430]) {
    await page.setViewportSize({width,height:812});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/collection-${width}.png`});
  }
  await page.getByRole('button',{name:'全額受取'}).click();
  await expect(page.locator('.collection-state')).toHaveText('受取済');
  await page.getByRole('button',{name:/編集・内訳/}).click();
  await page.getByLabel('ホリ 実際受取額（返金はマイナス）').fill('-10');
  await page.getByLabel('理由・メモ').fill('返金');
  await page.getByRole('button',{name:'受取額を保存'}).click();
  expect(shared.state.collectionEntries).toHaveLength(2);
  expect(shared.state.collectionEntries[1].received).toBe(-10);
  expect(shared.state.rounds[0].invoice).toBe(100);
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
  await page.getByRole('button',{name:'注文を貼り付け'}).click();
  await page.getByLabel('注文文章').fill('ホリ\n黒糖');
  await page.getByRole('button',{name:'注文候補を読み取る'}).click();
  await expect(page.getByRole('dialog').getByRole('button',{name:'ホリ',exact:true})).toHaveClass(/selected/);
  await page.getByRole('button',{name:'この内容で注文へ反映'}).click();
  await page.getByRole('button',{name:'‹ 注文一覧へ'}).click();
  await openRound(page,'2026-10-30');
  await expect(page.getByText('商品情報を更新')).toBeVisible();
  await expect(page.getByRole('button',{name:'10月のExcel注文表を取り込む'})).toHaveCount(0);
  await nav(page,'商品・購入者');
  await page.getByRole('button',{name:'購入者',exact:true}).click();
  await page.getByRole('button',{name:/ホリ.*固定注文/}).click();
  await expect(page.getByRole('dialog').locator('.product-row')).toHaveCount(2);
  await page.getByText('＋ 固定注文を追加').click();
  await page.getByLabel('商品名で探す').fill('黒糖');
  await page.getByRole('dialog').getByRole('button',{name:/黒糖ブレッド/}).click();
  await expect(page.getByRole('dialog').locator('.product-row')).toHaveCount(3);
  await page.getByRole('button',{name:'購入者・固定注文を保存'}).click();
  expect(shared.state.buyers.find(b=>b.id==='hori').fixed).toHaveLength(3);
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
  await page.getByRole('button',{name:/売れた商品の販売先を割り当てる/}).click();
  await page.getByRole('button',{name:'商品から入力'}).click();
  await page.getByRole('button',{name:/くるみパン.*未割当 10/}).click();
  await setQty(page,'くるみパン 割当数量',6);
  await page.getByRole('button',{name:'外部購入者'}).click();
  await page.getByRole('button',{name:'入金済み'}).click();
  await page.getByRole('button',{name:'この6個を外部販売として確定'}).click();
  await expect(page.getByLabel('くるみパンの割当状況')).toContainText('未割当 4');
  await page.getByRole('button',{name:'購入者から入力'}).click();
  await page.locator('.buyer-index').getByRole('button',{name:'すべて',exact:true}).click();
  await page.getByRole('button',{name:'ホリ',exact:true}).click();
  await page.getByRole('button',{name:'商品を選ぶ'}).click();
  await setQty(page,'くるみパン 割当数量',4);
  await setQty(page,'黒糖ブレッド 割当数量',2);
  await page.getByRole('button',{name:'この2商品の割当を確定'}).click();
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
    await b.getByRole('button',{name:/新しい注文を始める/}).click();
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

test('個人注文のカット加算と販売用の個人注文数参照', async ({page,context}) => {
  const shared={state:preparedState(),revision:0};
  await backend(context,shared); await login(page); await openRound(page);
  await page.locator('.buyer-index').getByRole('button',{name:'すべて',exact:true}).click();
  await page.getByRole('button',{name:'ホリ',exact:true}).click();
  await page.locator('.order-editor').getByRole('button',{name:'パン',exact:true}).click();
  await page.getByRole('button',{name:'湯種食パン 数量を増やす'}).click();
  await page.getByLabel('カット',{exact:true}).check();
  await page.getByLabel('カット加算額').fill('15');
  await page.getByRole('button',{name:'保存して次の購入者へ'}).click();
  await expect.poll(()=>shared.state.rounds[0].orders.hori.cutQuantities.bread).toBe(1);
  expect(shared.state.products.find(p=>p.id==='bread').cutFee).toBe(15);
  await page.getByRole('button',{name:'販売用',exact:true}).click();
  await page.getByLabel('個人注文数を表示').check();
  await expect(page.locator('.product-row').filter({hasText:'湯種食パン'})).toContainText('個人注文 1個');
  await page.getByRole('button',{name:'湯種食パン 数量を増やす'}).click();
  await page.getByLabel('カット',{exact:true}).check();
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('region',{name:'今回の販売用注文'})).toContainText('カット 1個');
  expect(shared.state.stocks.find(stock=>stock.productId==='bread'&&stock.cut).price).toBe(
    shared.state.rounds[0].products.find(product=>product.id==='bread').price+15);
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
  await expect(page.getByText('販売額',{exact:true})).toBeVisible();
  await expect(page.getByText('仕入額',{exact:true})).toBeVisible();
  await nav(page,'商品・購入者');
  await page.getByRole('button',{name:'焼き菓子',exact:true}).click();
  await page.getByLabel('商品を探す').fill('黒糖');
  await expect(page.locator('.master-row').filter({hasText:'黒糖ブレッド'})).toBeVisible();
  for(const width of [320,375,430]){
    await page.setViewportSize({width,height:812});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
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
  await expect(page.getByRole('button',{name:'なし',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'あり',exact:true}).click();
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
  const row=page.locator('.collection-entry').first();const left=await row.locator('.collection-person').boundingBox(),right=await row.locator('.collection-right').boundingBox();
  expect(right.x).toBeGreaterThanOrEqual(left.x+left.width-1);
  await page.locator('.stage-4 > .stage-trigger').click();await expect(page.locator('.stage-4 .stage-content')).toHaveCount(0);
});
test('場所なしセット、既知のおやつ単価・使用数、税込合計の同じ行保存',async({page,context})=>{
  const shared={state:preparedState(),revision:0};const r=newRound(shared.state,'2026-09-11',true);shared.state.rounds.push(r);
  setSalesOrderQuantities(shared.state,r.id,{walnut:3});
  const {setSnackOrderQuantities}=await import('../../src/commerce.js');setSnackOrderQuantities(shared.state,r.id,{walnut:3});r.status='注文確定';
  await backend(context,shared);await login(page);await page.locator('.round-list-item').click();await page.locator('.stage-3 > .stage-trigger').click();
  await page.getByRole('button',{name:'なし',exact:true}).click();
  await expect(page.getByRole('group',{name:'セット販売',exact:true}).getByRole('button',{name:'なし'})).toHaveClass(/selected/);
  await page.getByRole('group',{name:'セット販売',exact:true}).getByRole('button',{name:'あり'}).click();
  await page.getByRole('button',{name:'＋ セットを作る'}).click();await page.getByLabel('セット名').fill('おためしセット');await page.getByLabel('1セットの販売価格').fill('300');
  await setQty(page,'くるみパン セット必要数',1);await page.getByRole('button',{name:'セットを保存',exact:true}).click();
  expect(shared.state.markets).toHaveLength(0);expect(shared.state.bundles[0].roundId).toBe(r.id);
  await page.getByRole('button',{name:'販売を記録',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'入金済み'}).click();await page.getByRole('button',{name:'この内容で販売を記録'}).click();
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
  await page.getByRole('button',{name:'くるみパン 販売用の最終調整を増やす'}).click();
  expect(shared.state.stocks[0].qty).toBe(1);await expect(page.locator('.delivery-total-row').filter({hasText:'くるみパン'})).toContainText('3個');
  await mobileShots(page,'fax-adjust');
  await page.locator('.stage-3 > .stage-trigger').click();await expect(page.locator('.stage-3 > .stage-content').getByRole('heading',{name:'納品・精算',exact:true})).toBeVisible();
  await expect.poll(async()=>page.locator('.stage-3 > .stage-trigger').evaluate(e=>e.getBoundingClientRect().top)).toBeLessThan(650);
  await page.locator('.stage-3 > .stage-trigger').click();await expect(page.locator('.stage-3 .stage-content')).toHaveCount(0);
});
