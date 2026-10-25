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


export {backend,login,nav,closeToast,openRound,preparedState,setQty,openAfter};
