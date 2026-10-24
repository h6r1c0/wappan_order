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
test('検証用年度集計はテスト回を含めても正式実績・保存区分を変えず、期間と目標の計算元を揃える',()=>{
 const {s,r}=setup();r.test=true;r.invoice=22971;r.status='納品済み';r.shortageConfirmation='none';
 r.products=[{id:'bread',name:'注文商品',price:22490,cost:null}];r.orders.hori={name:'堀',quantities:{bread:1}};
 const stock={id:'stock-test',roundId:r.id,name:'販売用',productId:'bread',qty:1,price:2560,cost:null,date:r.date,test:true};
 s.stocks.push(stock);r.stockIds.push(stock.id);
 s.sales.push({id:'sale-test',stockId:stock.id,date:r.date,qty:1,price:5810,cost:null,destinationType:'external',paymentStatus:'paid'});
 const before=structuredClone(s),official=d.report(s,'2026-04-01','2027-03-31',2026);
 const trial=d.report(s,'2026-04-01','2027-03-31',2026,{includeTest:true});
 assert.equal(official.profit,0);assert.equal(trial.profit,5329);
 assert.equal(trial.rows.filter(x=>x.id===r.id).length,1);assert.equal(trial.rows.filter(x=>x.id==='sale-test').length,0);
 assert.equal(trial.rows.find(x=>x.id===r.id).test,true);
 assert.equal(trial.provisional,false);assert.equal(d.roundSettlementStatus(s,r),'精算済み');
 assert.equal(d.report(s,'2026-10-01','2026-10-31',2026,{includeTest:true}).profit,0);
 assert.deepEqual(s,before);
});
test('精算の自動判定は納品・仕入・利益を要求し、現金集金と独立する',()=>{
 const {s,r}=setup();r.status='納品済み';r.shortageConfirmation='none';r.invoice=100;
 r.orders.hori={name:'堀',quantities:{brown:1}};
 assert.equal(d.roundSettlementStatus(s,r),'精算済み');
 assert.equal(s.collectionEntries.length,0);
 r.invoice=null;assert.equal(d.roundSettlementStatus(s,r),'納品済み');
 r.invoice=100;r.shortageConfirmation=null;assert.equal(d.roundSettlementStatus(s,r),'納品済み');
 r.shortageConfirmation='none';r.products.find(p=>p.id==='brown').price=null;
 assert.equal(d.roundSettlementStatus(s,r),'納品済み');
});
test('納品書総額を販売済みの原価プールに使い、個人請求・園内現金と売上を重複させない',()=>{
  const {s,r}=setup();r.invoice=22971;r.status='納品済み';r.test=true;
  r.products=[{id:'bread',name:'注文商品',price:22490,cost:null}];
  r.orders.hori={name:'堀',quantities:{bread:1}};
  const stock={id:'stock',roundId:r.id,name:'販売用',productId:'bread',qty:2,price:0,cost:null,date:r.date,test:true};
  s.stocks.push(stock);r.stockIds.push(stock.id);
  s.sales.push({id:'buyer-sale',stockId:stock.id,date:r.date,qty:1,price:3250,cost:null,buyerId:'hori',destinationType:'buyer',paymentStatus:'later'},
    {id:'onsite-sale',stockId:stock.id,date:r.date,qty:1,price:2560,cost:null,destinationType:'external',destinationName:'園内販売',paymentStatus:'paid'});
  assert.equal(d.roundCost(s,r),null);
  const {personal,onsite,revenue,cost,profit,method}=d.roundAccounting(s,r);
  assert.deepEqual({personal,onsite,revenue,cost,profit,method},{personal:22490,onsite:5810,revenue:28300,cost:22971,profit:5329,method:'invoice'});
  assert.equal(d.report(s,r.date,r.date,2026).revenue,0); // 試験回は年度集計外
  r.status='精算済み';assert.equal(d.validate(s),s);
  r.test=false;stock.test=false;
  const annual=d.report(s,r.date,r.date,2026);
  assert.equal(annual.revenue,28300);assert.equal(annual.cost,22971);assert.equal(annual.profit,5329);
  assert.equal(annual.rows.filter(x=>x.id==='onsite-sale').length,0);
  stock.qty=3; // 未販売の1個は原価不明。全体利益は確定しない。
  assert.equal(d.roundAccounting(s,r).profit,null);
  stock.cost=200;
  assert.equal(d.roundAccounting(s,r).profit,5529); // 納品書には未販売分も含む
});
test('納品書総額を用途別原価より先に保存し、精算完了は原価確定後だけ許す', () => {
  const { s, r } = setup();
  const stock = { id: d.uid(), roundId: r.id, productId: 'milk', name: 'ミルクスティックパン',
    category: 'パン', qty: 2, price: 280, cost: null, date: r.date, test: false };
  s.stocks.push(stock); r.stockIds.push(stock.id); r.invoice = 1000;
  assert.equal(d.validate(s), s);
  assert.equal(d.roundCost(s, r), null);
  r.status = '精算済み';
  assert.throws(() => d.validate(s), /用途別の仕入単価/);
  stock.cost = 100;
  assert.equal(d.roundCost(s, r), 800);
  assert.equal(d.validate(s), s);
});
test('未使用のおやつ行と入荷0の販売用は原価未入力でも利益を妨げず、実入荷の原価は必要',()=>{
  const {s,r}=setup();r.invoice=1200;r.status='納品済み';
  const event={id:d.uid(),roundId:r.id,date:r.date,name:'おやつ用',test:false,lines:[{id:d.uid(),name:'注文なし',productId:'milk',qty:0,used:0,cost:null}]};
  s.events.push(event);r.eventIds.push(event.id);
  const stock={id:d.uid(),roundId:r.id,productId:'milk',name:'販売用',category:'パン',qty:2,receivedQty:0,cost:null,price:280,date:r.date,test:false};
  s.stocks.push(stock);r.stockIds.push(stock.id);
  assert.equal(d.eventCost(event),0);assert.equal(d.eventClaim(event),0);
  assert.equal(d.roundCost(s,r),1200);
  stock.receivedQty=1;assert.equal(d.roundCost(s,r),null);
  stock.cost=0;assert.equal(d.roundCost(s,r),1200);
  stock.cost=130;assert.equal(d.roundCost(s,r),1070);
  assert.equal(d.validate(s),s);
});
test('集金の過不足・繰越・返金を販売利益とは別に記録する', () => {
  const { s, r } = setup();
  r.orders.hori = { name: 'ホリ', quantities: { brown: 1 } };
  const next = d.newRound(s, '2026-10-16');
  next.orders.hori = { name: 'ホリ', quantities: { brown: 1 } };
  s.rounds.push(next);
  const profitBefore = d.report(s, '2026-04-01', '2027-03-31', 2026).profit;
  s.collectionEntries.push({ id: d.uid(), roundId: r.id, buyerId: 'hori', date: r.date,
    received: 530, adjustment: 0, note: '受取' });
  assert.equal(d.collectionPosition(s, next.id, 'hori').carry, -100);
  s.collectionEntries.push({ id: d.uid(), roundId: next.id, buyerId: 'hori', date: next.date,
    received: -100, adjustment: 0, note: '過払いを返金' });
  assert.equal(d.collectionPosition(s, next.id, 'hori').balance, 430);
  assert.equal(d.report(s, '2026-04-01', '2027-03-31', 2026).profit, profitBefore);
  assert.equal(d.validate(s), s);
});
test("価格切捨て・個別指定・過去の価格スナップショット", () => {
  assert.deepEqual(
    [538, 367, 394, 475].map((gross) => d.price({ gross, mode: "auto" })),
    [530, 360, 390, 470],
  );
  const { s, r } = setup();
  assert.equal(r.products.find((p) => p.id === "brown").price, 430);
  const oldName = r.products.find((p) => p.id === "brown").name;
  s.products.find((p) => p.id === "brown").manual = 500;
  s.products.find((p) => p.id === "brown").name = "変更後の商品名";
  s.products.find((p) => p.id === "brown").cost = 250;
  assert.equal(r.products.find((p) => p.id === "brown").price, 430);
  assert.equal(r.products.find((p) => p.id === "brown").name, oldName);
  assert.equal(r.products.find((p) => p.id === "brown").cost, null);
  assert.equal(d.newRound(s, "2026-10-16").products.find((p) => p.id === "brown").cost, 250);
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

test('食パンのカット加算は注文回スナップショットに固定し集金内訳へ反映する', () => {
  const {s,r}=setup();
  const bread=r.products.find(p=>p.id==='bread');
  bread.cutFee=15;
  r.orders.hori={name:'ホリ',quantities:{bread:2},cutQuantities:{bread:2}};
  assert.equal(d.orderAmount(r,r.orders.hori),bread.price*2+30);
  assert.equal(d.collections(s,'','',r.id,true).find(row=>row.id==='hori').normal,bread.price*2+30);
  s.products.find(p=>p.id==='bread').cutFee=25;
  assert.equal(d.orderAmount(r,r.orders.hori),bread.price*2+30);
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
    [538, 394, 367, 475],
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
