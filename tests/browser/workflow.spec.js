import { test, expect } from "@playwright/test";
import { initialState, validate } from "../../src/domain.js";
import * as XLSX from "xlsx";
import fs from "node:fs/promises";
async function qaFont(page) {
  if (process.env.QA_FONT_DIR) {
    await page.route('https://qa-fonts.test/**', async route => {
      const name=new URL(route.request().url()).pathname.split('/').pop();
      await route.fulfill({contentType:'font/woff2',body:await fs.readFile(process.env.QA_FONT_DIR+'/files/'+name),headers:{'access-control-allow-origin':'*'}});
    });
    const css=(await fs.readFile(process.env.QA_FONT_DIR+'/400.css','utf8')).replaceAll('./files/','https://qa-fonts.test/files/');
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
    if (url.pathname.includes("/auth/v1/token"))
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
    page.getByRole("heading", { name: "納品日ごとの注文" }),
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
test("スマホ: Excel→固定注文→欠品→精算→おやつ余剰振替→後日請求・即時入金→年度・再読込", async ({
  page,
  context,
}) => {
  const shared = { state: initialState(), revision: 0 };
  await backend(context, shared);
  page.on("dialog", (d) => d.accept());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await nav(page, "商品・購入者");
  await page.getByRole("button", { name: "Excelから取り込む" }).click();
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["商品名", "税込価格"],
      ["ガレット", 394],
      ["ツイストドーナツ", 367],
      ["湯種食パン", 538],
      ["くるみパン", 205],
      ["黒糖ブレッド", 999],
    ]),
    "9月",
  );
  await page.getByLabel("Excel注文表").setInputFiles({
    name: "sample.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
  });
  await page.getByRole("button", { name: "読み取って確認へ" }).click();
  await expect(page.getByLabel("商品区分", {exact:true})).toHaveCount(5);
  for (const field of await page.getByLabel("商品区分", {exact: true}).all()) {
    if (await field.inputValue() === "") await field.selectOption("staple");
  }
  await expect(page.getByText("販売価格 430円")).toBeVisible();
  await page.getByRole("button", { name: "確認した商品を登録" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(shared.state.products.length).toBe(8);
  await nav(page, "注文");
  await page.getByRole("button", { name: "＋ 注文回を作る" }).click();
  await page.getByLabel("納品予定日").fill("2026-09-11");
  await page.getByRole("button", { name: "この納品日で注文を始める" }).click();
  await expect(page.locator('header img[src*="ohisama_header_logo"]')).toBeVisible();
  await expect(page.locator('header img[src*="wappan_title_logo_final"]')).toBeVisible();
  await expect(page.locator('.purpose img')).toHaveCount(3);
  await expect(page.locator('nav button')).toHaveCount(3);
  expect(await page.locator('body').evaluate(el=>getComputedStyle(el).fontFamily)).toContain('M PLUS Rounded 1c');
  await page.getByRole("button", { name: "ホリ", exact: true }).click();
  await expect(page.locator('.cat[src*="wappan_icon_category_bread_final"]')).toBeVisible();
  await expect(page.locator('.cat[src*="wappan_icon_category_gingerbread_final"]')).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".cat").evaluateAll((images) =>
        images.every((image) => image.complete && image.naturalWidth > 0),
      ),
    )
    .toBe(true);
  for(const icon of await page.locator('.cat').all()){
    const size=await icon.evaluate(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,fit:getComputedStyle(el).objectFit}));
    expect(size.w).toBe(size.h);expect(size.fit).toBe('contain');
  }
  await expect(page.getByLabel("ガレット 数量", { exact: true })).toHaveValue(
    "2",
  );
  await closeToast(page);
  await page.screenshot({
    path: "test-results/mobile-order.png",
    fullPage: true,
  });
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "保存して次の購入者へ" }).click();
  await page.getByRole("button", { name: "浅野", exact: true }).click();
  await expect(
    page.getByLabel("黒糖ブレッド 数量", { exact: true }),
  ).toHaveValue("1");
  await page.getByRole("button", { name: "保存して次の購入者へ" }).click();
  await page.getByRole("button", { name: "集金額", exact: true }).click();
  await expect(
    page.getByText("1,500円", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "発注数", exact: true }).click();
  await page.getByRole("button", { name: "注文確定にする" }).click();
  await page.getByRole("button", { name: "個人注文", exact: true }).click();
  await page.getByRole("button", { name: "ホリ", exact: true }).click();
  await page.getByLabel("ガレット 数量", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "保存して次の購入者へ" }).click();
  await page.getByRole("button", { name: "納品・精算", exact: true }).click();
  await page.getByLabel("実際に支払う仕入税込総額").fill("4260");
  await page.getByLabel("納品・精算の状態").selectOption("精算済み");
  await page.getByRole("button", { name: "仕入額・状態を保存" }).click();
  await page.getByRole("button", { name: "おやつ用", exact: true }).click();
  await page.getByRole("button", { name: "＋ おやつ予定を追加" }).click();
  await page.getByLabel("行事・おやつ名", { exact: true }).fill("検証用おやつ");
  await page.getByLabel("使用日", { exact: true }).fill("2026-09-11");
  await page.getByRole("button", { name: "＋ 商品行を追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("数量", { exact: true }).nth(0).selectOption("other");
  await dialog.getByLabel("数量 その他", { exact: true }).fill("20");
  await dialog.getByLabel("数量", { exact: true }).nth(1).selectOption("other");
  await dialog.getByLabel("数量 その他", { exact: true }).nth(1).fill("18");
  await page.getByRole("button", { name: "おやつ用の注文・使用数を保存" }).click();
  await expect(
    page.getByText("2,484円", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "余剰を販売用へ振替" }).click();
  await page.getByRole("button", { name: "振り替えて販売用に追加" }).click();
  await expect.poll(()=>shared.state.stocks[0]?.qty).toBe(2);
  await closeToast(page);
  await page.screenshot({
    path: "test-results/mobile-event.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "販売用", exact: true }).click();
  await page.getByRole("button", { name: "販売を記録", exact: true }).click();
  await page.getByRole("button", { name: "ホリ", exact: true }).click();
  await page.getByLabel("販売日", { exact: true }).fill("2026-09-11");
  await page
    .getByLabel("集金をまとめる注文回")
    .selectOption(shared.state.rounds[0].id);
  await page
    .getByRole("button", { name: "販売を記録して残数を減らす" })
    .click();
  await expect(page.getByText("残り 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "販売を記録", exact: true }).click();
  await page
    .getByRole("button", { name: "外部販売", exact: true })
    .click();
  await page.getByLabel("外部販売先・団体・マルシェ名").fill("その場販売");
  await page.getByRole("button", { name: "入金済み", exact: true }).click();
  await page.getByLabel("販売日", { exact: true }).fill("2026-09-11");
  await page
    .getByRole("button", { name: "販売を記録して残数を減らす" })
    .click();
  await expect.poll(()=>shared.state.sales.length).toBe(2);
  await nav(page, "集計");
  await page.getByLabel("対象年度").selectOption("2026");
  await expect(page.locator(".hero>strong")).toHaveText("694円");
  await page.getByRole("button", { name: "個人請求", exact: true }).click();
  await expect(
    page.getByText("1,310円", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await qaFont(page);
  await expect(
    page.getByRole("heading", { name: "納品日ごとの注文" }),
  ).toBeVisible();
  await nav(page, "集計");
  await expect(page.locator(".hero>strong")).toHaveText("694円");
  await closeToast(page);
  await page.screenshot({
    path: "test-results/mobile-report.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("スマホ: LINE貼付と共通販売用在庫・販売場所・任意価格・入金未確認",async({page,context})=>{
  const shared={state:initialState(),revision:0};
  shared.state.products.forEach(p=>{if(p.gross==null&&p.manual==null)p.gross=394});
  await backend(context,shared);page.on('dialog',d=>d.accept());await login(page);
  await page.getByRole('button',{name:'＋ 注文回を作る'}).click();
  await page.getByLabel('納品予定日').fill('2026-09-11');
  await page.getByRole('button',{name:'この納品日で注文を始める'}).click();
  await page.getByRole('button',{name:'LINE注文を貼り付け'}).click();
  await page.getByLabel('注文文章').fill('ホリ\n黒糖1');
  await page.getByRole('button',{name:'注文候補を読み取る'}).click();
  await page.getByRole('button',{name:'この内容で注文へ反映'}).click();
  expect(shared.state.rounds[0].orders.hori.quantities.brown).toBe(1);
  expect(shared.state.sales).toHaveLength(0);
  await page.getByRole('button',{name:'販売用',exact:true}).click();
  await page.getByRole('button',{name:'＋ 販売用商品を追加'}).click();
  await page.getByLabel('商品を選ぶ').selectOption('milk');
  await page.getByRole('dialog').getByLabel('数量',{exact:true}).selectOption('2');
  await page.getByLabel('仕入単価（不明なら空欄・利益は未確定）').fill('200');
  await page.getByRole('button',{name:'商品を保存'}).click();
  await page.getByRole('button',{name:'販売を記録',exact:true}).click();
  await page.getByLabel('1個の販売価格（この販売だけ）').fill('420');
  await page.getByLabel('販売場所（任意）').fill('手話タイム');
  await page.getByRole('button',{name:'外部販売',exact:true}).click();
  await page.getByLabel('外部販売先・団体・マルシェ名').fill('手話タイム');
  await page.getByRole('button',{name:'販売を記録して残数を減らす'}).click();
  expect(shared.state.sales[0].destinationName).toBe('手話タイム');
  expect(shared.state.sales[0].paymentStatus).toBe('unconfirmed');
  expect(shared.state.sales[0].price).toBe(420);
  expect(shared.state.sales[0].salePlace).toBe('手話タイム');
  expect(shared.state.externalDestinations).toContain('手話タイム');
  for(const width of [320,375,430]){await page.setViewportSize({width,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});

test("実Excelの自動読取・今回限りの次回除外・30人の購入者選択", async ({page,context}) => {
  test.skip(!process.env.WAPPAN_EXCEL_DIR, "実資料の保存場所を指定して実行");
  const shared={state:initialState(),revision:0};
  for(let i=0;i<28;i++) shared.state.buyers.push({id:`b${i}`,name:`確認用${i+1}`,active:true,fixed:[]});
  await backend(context,shared); await login(page);
  const files=(await fs.readdir(process.env.WAPPAN_EXCEL_DIR)).filter(f=>f.endsWith('(3).xlsx'));
  for(const file of files){
    await nav(page,'商品・購入者');
    await page.getByRole('button',{name:'Excelから取り込む'}).click();
    await page.getByLabel('Excel注文表').setInputFiles(process.env.WAPPAN_EXCEL_DIR+'/'+file);
    const sweets=file.includes('菓子');
    await expect(page.getByLabel('商品区分',{exact:true})).toHaveCount(sweets?14:47);
    await expect(page.getByLabel('商品名の列')).toHaveCount(0);
    await expect(page.getByText(sweets?'定番焼き菓子注文書として読み取りました。':'月次パン注文書として読み取りました。',{exact:true})).toBeVisible();
    if(!sweets){
      await page.getByLabel('商品を使う注文回').selectOption('new');
      await page.getByLabel('納品予定日').fill('2026-09-11');
      await page.getByLabel('テスト入力（年度実績へ含めない）').check();
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/import-${sweets?'sweets':'bread'}.png`,fullPage:false});
    await page.getByRole('button',{name:'確認した商品を登録'}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  expect(shared.state.products.filter(p=>p.lifecycle==='once').length).toBe(12);
  expect(shared.state.rounds[0].products.some(p=>p.name.includes('抹茶キャレ'))).toBe(true);
  await nav(page,'注文');
  await page.getByRole('button',{name:'＋ 注文回を作る'}).click();
  await page.getByLabel('納品予定日').fill('2026-10-09');
  await page.getByRole('button',{name:'この納品日で注文を始める'}).click();
  expect(shared.state.rounds[1].products.some(p=>p.name.includes('抹茶キャレ'))).toBe(false);
  expect(shared.state.rounds[1].products.some(p=>p.name==='パンのカリカリ')).toBe(true);
  await expect(page.getByLabel('購入者を絞り込む')).toBeVisible();
  await page.getByLabel('購入者を絞り込む').fill('確認用28');
  await page.getByRole('button',{name:'確認用28',exact:true}).click();
  await expect(page.getByRole('heading',{name:'確認用28さんの注文'})).toBeVisible();
  for(const width of [320,375,430]){
    await page.setViewportSize({width,height:812});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test("9月11日実資料：集金判明分・完売・年度除外・再読込",async({page,context})=>{
  test.skip(!process.env.WAPPAN_RECON,"私的な照合資料がある環境だけ実行");
  const {data,results}=await import('../../.reconciliation-data.mjs');
  const shared={state:data,revision:6};
  await backend(context,shared);await login(page);
  await page.getByText('11人 入力済み').click();
  await page.getByRole('button',{name:'集金額',exact:true}).click();
  await expect(page.getByText(results.normalKnown.toLocaleString('ja-JP')+'円',{exact:true}).first()).toBeVisible();
  expect(results.matchedProducts).toBe(29);
  expect(results.remaining).toBe(0);
  await nav(page,'注文');
  await page.getByText('11人 入力済み').click();
  await page.getByRole('button',{name:'販売用',exact:true}).click();
  await page.getByLabel('売り切れの商品も表示').check();
  await expect(page.getByText('残り 0',{exact:true})).toHaveCount(11);
  await page.getByRole('button',{name:'数量・記録を見る'}).first().click();
  await expect(page.getByText('販売先・支払方法未確認',{exact:true})).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'閉じる'}).click();
  await nav(page,'集計');
  await expect(page.locator('.hero>strong')).toHaveText('0円');
  await page.reload();await nav(page,'集計');
  await expect(page.locator('.hero>strong')).toHaveText('0円');
});
test("複数端末: 同じ共有データと同時編集の上書き拒否、最新読込で復旧", async ({
  browser,
}) => {
  const shared = { state: initialState(), revision: 0 };
  const c1 = await browser.newContext({
      viewport: { width: 375, height: 812 },
    }),
    c2 = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await backend(c1, shared);
  await backend(c2, shared);
  const a = await c1.newPage(),
    b = await c2.newPage();
  await login(a);
  await login(b);
  for (const p of [a, b]) {
    p.on("dialog", (d) => d.accept());
    await p.getByRole("button", { name: "＋ 注文回を作る" }).click();
  }
  await a.getByRole("button", { name: "この納品日で注文を始める" }).click();
  await b.getByRole("button", { name: "この納品日で注文を始める" }).click();
  await expect(b.getByRole("alert")).toContainText("別の係が先に保存しました");
  expect(shared.state.rounds.length).toBe(1);
  await b.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
  await b.getByRole("button", { name: "最新を読込" }).click();
  await expect(b.getByText("0人 入力済み")).toBeVisible();
  await c1.close();
  await c2.close();
});

test("購入者を入力中に追加、利益のみ過去実績・年度調整・目標・テスト除外", async ({
  page,
  context,
}) => {
  const shared = { state: initialState(), revision: 0 };
  await backend(context, shared);
  page.on("dialog", (d) => d.accept());
  await login(page);
  await page.getByRole("button", { name: "＋ 注文回を作る" }).click();
  await page.getByLabel("納品予定日").fill("2026-09-11");
  await page.getByLabel("テスト入力（年度実績へ含めない）").check();
  await page.getByRole("button", { name: "この納品日で注文を始める" }).click();
  await page.getByRole("button", { name: "＋ 購入者を追加" }).click();
  await page.getByLabel("新しい購入者名").fill("検証購入者");
  await page.getByRole("button", { name: "追加して選ぶ" }).click();
  await expect(
    page.getByRole("heading", { name: "検証購入者さんの注文" }),
  ).toBeVisible();
  await page
    .getByLabel("ミルクスティックパン 数量", { exact: true })
    .selectOption("2");
  await page.getByRole("button", { name: "保存して次の購入者へ" }).click();
  expect(shared.state.rounds[0].test).toBe(true);
  await nav(page, "集計");
  await page
    .getByRole("button", { name: "過去実績・調整", exact: true })
    .click();
  await page.getByRole("button", { name: "＋ 過去実績" }).click();
  await page.getByLabel("実績日").fill("2026-04-30");
  await page.getByLabel("利益のみ分かっている").check();
  await page.getByLabel("利益", { exact: true }).fill("49000");
  await page.getByRole("button", { name: "過去実績を保存" }).click();
  await page.getByRole("button", { name: "＋ 利益調整" }).click();
  await page.getByLabel("調整額").fill("1200");
  await page.getByRole("button", { name: "利益調整を保存" }).click();
  await expect(page.locator(".hero>strong")).toHaveText("50,200円");
  await expect(page.getByText(/目標達成 ＋200円/)).toBeVisible();
  await page.getByRole("button", { name: "利益", exact: true }).click();
  await expect(
    page.getByText("販売額（判明分）", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "目標額を変更" }).click();
  await page.getByLabel("目標額", { exact: true }).fill("60000");
  await page.getByRole("button", { name: "目標を保存" }).click();
  await expect(page.getByText(/目標まで あと9,800円/)).toBeVisible();
  expect(shared.state.history[0].revenue).toBeNull();
  expect(shared.state.history[0].cost).toBeNull();
});
