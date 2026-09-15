import test from "node:test";
import assert from "node:assert/strict";
import * as d from "../src/domain.js";
import { detectColumns, extractRows, readExcel } from "../src/excel.js";
import * as XLSX from "xlsx";
function setup() {
  const s = d.initialState();
  s.products.forEach((p) => {
    if (d.price(p) == null) p.gross = 394;
  });
  const r = d.newRound(s, "2026-09-11");
  s.rounds.push(r);
  return { s, r };
}
test("価格切捨て・個別指定・過去の価格スナップショット", () => {
  assert.deepEqual(
    [538, 367, 394, 475].map((gross) => d.price({ gross, mode: "auto" })),
    [530, 360, 390, 470],
  );
  const { s, r } = setup();
  assert.equal(r.products.find((p) => p.id === "brown").price, 430);
  s.products.find((p) => p.id === "brown").manual = 500;
  assert.equal(r.products.find((p) => p.id === "brown").price, 430);
  assert.equal(
    d.price(d.initialState().products.find((p) => p.id === "bean")),
    null,
  );
});
test("固定注文→個人集金・商品集計→確定→本人同意の欠品修正→利益", () => {
  const { s, r } = setup();
  r.orders.hori = d.orderDraft(s, r, s.buyers[0]);
  r.orders.asano = d.orderDraft(s, r, s.buyers[1]);
  assert.equal(d.orderAmount(r, r.orders.hori), 1560);
  assert.equal(d.orderAmount(r, r.orders.asano), 820);
  assert.equal(d.productTotals(r).find((p) => p.id === "galette").qty, 2);
  r.status = "注文確定";
  r.planned = structuredClone(r.orders);
  r.orders.hori.quantities.galette = 1;
  r.invoice = 1500;
  r.status = "精算済み";
  d.validate(s);
  assert.equal(d.roundRevenue(r), 1990);
  assert.equal(d.roundRevenue(r) - d.roundCost(s, r), 490);
  assert.equal(r.planned.hori.quantities.galette, 2);
  assert.equal(d.orderDraft(s, r, s.buyers[0]).quantities.galette, 1);
  r.orders.hori.quantities.galette = 0;
  assert.equal(d.orderDraft(s, r, s.buyers[0]).quantities.galette, 0);
});
test("行事20→18使用→2振替→個人請求と即時入金、混在納品書の二重計上なし", () => {
  const { s, r } = setup();
  r.orders.hori = { name: "ホリ", quantities: { milk: 2 } };
  const e = {
    id: "event",
    name: "行事",
    date: "2026-09-11",
    test: false,
    lines: [
      {
        id: "line",
        productId: "walnut",
        name: "くるみパン",
        qty: 20,
        used: 18,
        cost: 138,
      },
    ],
  };
  s.events.push(e);
  d.transfer(s, e, e.lines[0], 2, 200, "2026-09-11");
  const stock = s.stocks[0];
  assert.equal(d.eventClaim(e), 2484);
  assert.equal(d.eventCost(e), 2760);
  assert.equal(stock.qty * stock.cost, 276);
  assert.equal(d.transferredQty(s, "line"), 2);
  r.eventIds = ["event"];
  r.invoice = 3160;
  r.status = "精算済み";
  assert.equal(d.roundCost(s, r), 400);
  d.addSale(s, stock, {
    date: "2026-09-11",
    qty: 1,
    paid: false,
    buyerId: "hori",
    chargeRoundId: r.id,
  });
  d.addSale(s, stock, { date: "2026-09-12", qty: 1, paid: true });
  assert.equal(d.stockRemaining(s, stock), 0);
  assert.equal(
    d.collections(s, "2026-04-01", "2027-03-31", r.id)[0].total,
    760,
  );
  const report = d.report(s, "2026-04-01", "2027-03-31", 2026);
  assert.equal(report.revenue, 960);
  assert.equal(report.cost, 676);
  assert.equal(report.profit, 284);
  d.validate(s);
  assert.throws(
    () => d.transfer(s, e, e.lines[0], 1, 200, "2026-09-11"),
    /余剰/,
  );
  assert.throws(() => d.addSale(s, stock, { qty: 1, paid: true }), /残数/);
  e.lines[0].used = 19;
  assert.throws(() => d.validate(s), /注文数/);
});
test("売れた分だけ園内販売の原価を計上し、取消で残数と個人請求を戻す", () => {
  const { s, r } = setup();
  const stock = {
    id: "stock",
    date: "2026-09-11",
    name: "菓子",
    qty: 10,
    cost: 100,
    price: 150,
    test: false,
  };
  s.stocks.push(stock);
  r.stockIds = ["stock"];
  r.invoice = 1000;
  r.status = "精算済み";
  d.addSale(s, stock, {
    date: "2026-09-11",
    qty: 2,
    buyerId: "hori",
    paid: false,
    chargeRoundId: r.id,
  });
  assert.equal(d.roundCost(s, r), 0);
  assert.equal(d.report(s, "2026-04-01", "2027-03-31", 2026).profit, 100);
  assert.equal(d.stockRemaining(s, stock), 8);
  s.sales[0].void = true;
  assert.equal(d.stockRemaining(s, stock), 10);
  assert.equal(d.collections(s, "2026-04-01", "2027-03-31").length, 0);
  assert.equal(d.report(s, "2026-04-01", "2027-03-31", 2026).profit, 0);
});
test("年度境界・不明の実績・過年度調整・目標超過・テスト除外", () => {
  const { s, r } = setup();
  r.orders.hori = { name: "ホリ", quantities: { milk: 1 } };
  r.invoice = 100;
  r.status = "精算済み";
  s.history.push({
    id: "past",
    date: "2026-04-30",
    revenue: null,
    cost: null,
    profit: 49000,
  });
  s.adjustments.push(
    { id: "adj", year: 2026, date: "", amount: 1000, name: "修正" },
    { id: "old", year: 2025, date: "", amount: 9999 },
  );
  const report = d.report(s, "2026-04-01", "2027-03-31", 2026);
  assert.equal(report.profit, 50180);
  assert.equal(report.revenue, 280);
  assert.equal(report.unknownRevenue, true);
  assert.equal(report.unknownCost, true);
  assert.equal(report.profit - s.goals[2026], 180);
  assert.equal(d.report(s, "2026-04-01", "2026-09-30", 2026).undated, 1);
  d.setTest(s, r, true);
  assert.equal(d.report(s, "2026-04-01", "2027-03-31", 2026).profit, 50000);
  assert.equal(d.fiscalYear("2027-03-31"), 2026);
  assert.equal(d.fiscalYear("2027-04-01"), 2027);
  d.validate(s);
});
test("未知の仕入額は利益未確定、重複納品書リンク・負数・端数・空欄を拒否", () => {
  const { s, r } = setup();
  r.orders.hori = { name: "ホリ", quantities: { milk: 1 } };
  assert.equal(d.report(s, "2026-04-01", "2027-03-31", 2026).pending, 1);
  assert.throws(() => d.integer(null));
  assert.throws(() => d.integer(-1));
  assert.throws(() => d.integer(0.5));
  r.orders.hori.quantities.milk = -1;
  assert.throws(() => d.validate(s));
});
test("Excel実ファイルの複数商品ブロック・税込列・先頭行を取得", async () => {
  const rows = [
    ["9月注文表"],
    ["商品名", "税抜価格", "税込価格", "", "品名", "税込価格"],
    ["パン", 499, 538, "", "クッキー", "367円"],
    ["ガレット", 300, 394, "", "スコーン", 475],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows),
    book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, "9月");
  const bytes = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
  const sheets = await readExcel(new Blob([bytes]));
  const map = detectColumns(sheets[0].rows);
  assert.equal(map.pairs.length, 2);
  assert.deepEqual(
    extractRows(sheets[0].rows, map.pairs, map.start).map((r) => r.gross),
    [538, 367, 394, 475],
  );
});

test("振替の誤入力を戻し、販売済みの場合は取消後だけ戻せる", () => {
  const s = d.initialState(),
    e = {
      id: "e",
      name: "行事",
      date: "2026-09-11",
      test: false,
      lines: [{ id: "l", name: "パン", qty: 20, used: 18, cost: 138 }],
    };
  s.events.push(e);
  d.transfer(s, e, e.lines[0], 2, 200, "2026-09-11");
  const st = s.stocks[0];
  d.addSale(s, st, { date: "2026-09-11", qty: 1, paid: true });
  assert.throws(() => d.undoTransfer(s, st.id), /販売済み/);
  s.sales[0].void = true;
  d.undoTransfer(s, st.id);
  assert.equal(d.transferredQty(s, "l"), 0);
  assert.equal(d.eventClaim(e), 2484);
  d.validate(s);
});
