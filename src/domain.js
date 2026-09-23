import { permanentProduct } from "./excel.js";
import { bundleUsed, movedOut, bundleCost, validateCommerce } from "./commerce.js";
export const uid = () => crypto.randomUUID();
export const productAvailable = (p, date, roundId = "") => p.active && (permanentProduct(p.name) || p.lifecycle === "permanent" || (p.lifecycle !== "once" || (roundId && p.roundId === roundId)) && (!p.start || p.start <= date) && (!p.end || date <= p.end));
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
export const fiscalYear = (date) =>
  Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 4 ? 1 : 0);
export const yen = (n) =>
  n == null ? "未確定" : `${n.toLocaleString("ja-JP")}円`;
export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export function integer(v, label = "数値", signed = false) {
  if (
    v === "" ||
    v == null ||
    !Number.isSafeInteger(Number(v)) ||
    (!signed && Number(v) < 0) ||
    Math.abs(Number(v)) > 100000000
  )
    throw Error(`${label}は${signed ? "" : "0以上の"}整数で入力してください`);
  return Number(v);
}
export const price = (p) =>
  p.mode === "manual"
    ? p.manual
    : p.gross == null
      ? null
      : Math.floor(p.gross / 10) * 10;
export const normalize = (name) =>
  name
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .toLowerCase();
export function initialState() {
  const products = [
    ["milk", "ミルクスティックパン", 280, null, "パン"],
    ["brown", "黒糖ブレッド", 430, null, "パン"],
    ["galette", "ガレット", null, null, "焼き菓子"],
    ["donut", "ツイストドーナツ", null, null, "パン"],
    ["bread", "湯種食パン", null, null, "パン"],
    ["walnut", "くるみパン", null, 138, "パン"],
    ["bean", "こしあんぱん", null, null, "パン"],
    ["apple", "りんごデニッシュ", null, 151, "パン"],
  ].map(([id, name, manual, cost, category]) => ({
    id,
    name,
    manual,
    cost,
    category,
    mode: manual == null ? "auto" : "manual",
    gross: null,
    active: true,
    start: "",
    end: "",
  }));
  return {
    schema: 1,
    markets: [], bundles: [], bundleSales: [], externalDestinations: [], aliases: {products:{},buyers:{}},
    products,
    buyers: [
      {
        id: "hori",
        name: "ホリ",
        active: true,
        fixed: [
          { productId: "galette", qty: 2 },
          { productId: "donut", qty: 2 },
        ],
      },
      {
        id: "asano",
        name: "浅野",
        active: true,
        fixed: [
          { productId: "brown", qty: 1 },
          { productId: "bread", qty: 1 },
        ],
      },
    ],
    rounds: [],
    stocks: [],
    sales: [],
    events: [],
    history: [],
    adjustments: [],
    goals: { 2026: 50000 },
  };
}
export function snapshot(p) {
  const amount = price(p);
  if (amount == null) throw Error(`${p.name}の販売価格を設定してください`);
  return { id: p.id, name: p.name, category: p.category, price: amount };
}
export function newRound(state, date, test = false) {
  if (!date) throw Error("納品日を入力してください");
  if(state.rounds.some(r=>r.date===date&&r.test===test))throw Error("同じ納品日の注文回があります。既存の納品回を開いてください");
  return {
    id: uid(),
    date,
    test,
    status: "入力中",
    note: "",
    products: state.products
      .filter(
        (p) =>
          productAvailable(p, date) && price(p) != null,
      )
      .map(snapshot),
    orders: {},
    planned: null,
    invoice: null,
    eventIds: [],
    stockIds: [],
  };
}
export const orderAmount = (round, order) =>
  sum(round.products.map((p) => p.price * (order?.quantities[p.id] || 0)));
export const roundRevenue = (r) =>
  sum(Object.values(r.orders).map((o) => orderAmount(r, o)));
export const productTotals = (r, orders = r.orders) =>
  r.products
    .map((p) => ({
      ...p,
      qty: sum(Object.values(orders).map((o) => o.quantities[p.id] || 0)),
    }))
    .filter((p) => p.qty > 0);
export function orderDraft(state, round, buyer) {
  if (round.orders[buyer.id]) return structuredClone(round.orders[buyer.id]);
  return {
    name: buyer.name,
    quantities: Object.fromEntries(
      buyer.fixed
        .filter((f) => round.products.some((p) => p.id === f.productId))
        .map((f) => [f.productId, f.qty]),
    ),
  };
}
export const soldQty = (s, id) =>
  sum(s.sales.filter((x) => !x.void && x.stockId === id).map((x) => x.qty)) + bundleUsed(s,id);
export const stockRemaining = (s, stock) => stock.qty - soldQty(s, stock.id) - movedOut(s,stock.id);
export const transferredQty = (s, lineId) =>
  sum(s.stocks.filter((x) => x.eventLineId === lineId).map((x) => x.qty));
export const eventCost = (e) =>
  e.lines.some((l) => l.cost == null)
    ? null
    : sum(e.lines.map((l) => l.qty * l.cost));
export const eventClaim = (e) =>
  e.lines.some((l) => l.used > 0 && l.cost == null)
    ? null
    : sum(e.lines.map((l) => l.used * (l.cost || 0)));
export function invoiceDeductions(s, r) {
  const events = r.eventIds.map((id) => s.events.find((e) => e.id === id));
  if (events.some((e) => eventCost(e) == null)) return null;
  if (r.stockIds.some(id => s.stocks.find(st => st.id === id)?.cost == null)) return null;
  return (
    sum(events.map(eventCost)) +
    sum(
      r.stockIds.map((id) => {
        const st = s.stocks.find((x) => x.id === id);
        return st.qty * st.cost;
      }),
    )
  );
}
export function undoTransfer(s, stockId) {
  const stock = s.stocks.find((x) => x.id === stockId);
  if (!stock?.eventId || soldQty(s, stockId) > 0 || movedOut(s,stockId)>0)
    throw Error(
      "販売済みの商品は振替を戻せません。誤った販売は先に取消してください。",
    );
  stock.qty = 0;
  stock.cancelled = true;
}
export function roundCost(s, r) {
  const deduction = invoiceDeductions(s, r);
  return r.invoice == null || deduction == null ? null : r.invoice - deduction;
}
export function transfer(s, event, line, qty, sellingPrice, date) {
  integer(qty, "振替数");
  integer(sellingPrice, "販売価格");
  if (!qty) throw Error("振替数は1以上にしてください");
  if (line.cost == null) throw Error("仕入単価を確認して入力してください");
  if (qty > line.qty - line.used - transferredQty(s, line.id))
    throw Error("余剰数を超えています");
  s.stocks.push({
    id: uid(),
    name: line.name,
    productId: line.productId,
    category: line.category || "パン",
    qty,
    cost: line.cost,
    price: sellingPrice,
    date,
    test: event.test,
    eventId: event.id,
    eventLineId: line.id,
    note: `${event.name}の余剰`,
    roundId: null,
    channel: 'onsite', depth: 0,
  });
}
export function addSale(s, stock, entry) {
  integer(entry.qty, "販売数");
  if (entry.qty < 1 || entry.qty > stockRemaining(s, stock))
    throw Error("販売数が残数を超えています");
  const destinationType = entry.destinationType || (entry.pending ? "unknown" : entry.paid ? "external" : "buyer");
  const paymentStatus = entry.paymentStatus || (entry.pending ? "unconfirmed" : entry.paid ? "paid" : "later");
  if (destinationType === "buyer" && !entry.buyerId) throw Error("購入者を選んでください");
  if (destinationType === "external" && !String(entry.destinationName || "").trim()) entry.destinationName = "外部販売（名称未入力）";
  const salePrice = entry.price ?? stock.price;
  integer(salePrice, "販売価格");
  if (!['buyer','external','unknown'].includes(destinationType) || !['paid','later','unconfirmed'].includes(paymentStatus)) throw Error("販売先・支払状態を確認してください");
  if (destinationType === 'unknown' && paymentStatus !== 'unconfirmed') throw Error("販売先未確認は入金未確認として保存してください");
  if (destinationType === 'buyer' && paymentStatus !== 'later') throw Error("購入者への販売は後日請求として保存してください");
  const buyerName = destinationType === 'buyer'
    ? s.buyers.find((b) => b.id === entry.buyerId)?.name
    : destinationType === 'external'
      ? String(entry.destinationName).trim()
      : "販売先未確認";
  s.sales.push({
    ...entry,
    id: uid(),
    stockId: stock.id,
    destinationType,
    paymentStatus,
    destinationName: destinationType === 'external' ? String(entry.destinationName).trim() : null,
    pending: destinationType === 'unknown',
    paid: paymentStatus === 'paid',
    buyerId: destinationType === 'buyer' ? entry.buyerId : null,
    chargeRoundId: destinationType === 'buyer' ? entry.chargeRoundId : null,
    buyerName,
    price: salePrice,
    cost: stock.cost,
  });
  if (destinationType === 'external') {
    s.externalDestinations ??= [];
    if (!s.externalDestinations.includes(buyerName)) s.externalDestinations.push(buyerName);
  }
}
export function updateSaleDestination(s, saleId, entry) {
  const sale = s.sales.find((item) => item.id === saleId);
  if (!sale || sale.void) throw Error("変更できる販売記録が見つかりません");
  const stock = s.stocks.find((item) => item.id === sale.stockId);
  if (!stock) throw Error("販売元の商品が見つかりません");
  const destinationType = entry.destinationType;
  if (!['buyer', 'external', 'unknown'].includes(destinationType))
    throw Error("販売先を確認してください");
  if (destinationType === 'buyer') {
    const buyer = s.buyers.find((item) => item.id === entry.buyerId);
    if (!buyer) throw Error("購入者を選んでください");
    const chargeRoundId = entry.chargeRoundId || stock.roundId || null;
    if (chargeRoundId) {
      const round = s.rounds.find((item) => item.id === chargeRoundId);
      if (!round || round.test !== stock.test)
        throw Error("集金する注文回のテスト区分が一致しません");
    }
    Object.assign(sale, {
      destinationType: 'buyer',
      paymentStatus: 'later',
      pending: false,
      paid: false,
      buyerId: buyer.id,
      buyerName: buyer.name,
      chargeRoundId,
      destinationName: null,
    });
    return sale;
  }
  if (destinationType === 'external') {
    const destinationName = String(entry.destinationName || '').trim();
    if (!destinationName) throw Error("外部販売先の名称を入力してください");
    const paymentStatus = entry.paymentStatus === 'paid' ? 'paid' : 'unconfirmed';
    Object.assign(sale, {
      destinationType: 'external',
      paymentStatus,
      pending: false,
      paid: paymentStatus === 'paid',
      buyerId: null,
      buyerName: destinationName,
      chargeRoundId: null,
      destinationName,
    });
    s.externalDestinations ??= [];
    if (!s.externalDestinations.includes(destinationName))
      s.externalDestinations.push(destinationName);
    return sale;
  }
  Object.assign(sale, {
    destinationType: 'unknown',
    paymentStatus: 'unconfirmed',
    pending: true,
    paid: false,
    buyerId: null,
    buyerName: '販売先未確認',
    chargeRoundId: null,
    destinationName: null,
  });
  return sale;
}
export function assignSalesToBuyer(s, saleIds, buyerId, chargeRoundId = null) {
  const ids = [...new Set(saleIds)];
  if (!ids.length) throw Error("割り当てる販売記録を選んでください");
  for (const id of ids) {
    const sale = s.sales.find((item) => item.id === id);
    if (
      !sale ||
      sale.void ||
      (!sale.pending && sale.destinationType !== 'unknown')
    )
      throw Error("販売先未確認の記録だけを選んでください");
    updateSaleDestination(s, id, {
      destinationType: 'buyer',
      buyerId,
      chargeRoundId,
    });
  }
}
export const isSaleTest = (s, sale) =>
  s.stocks.find((x) => x.id === sale.stockId)?.test;
export function collections(s, from, to, roundId = null, includeTest = false) {
  const map = new Map();
  const add = (id, name, kind, amount, description) => {
    if (!map.has(id))
      map.set(id, { id, name, normal: 0, onsite: 0, lines: [] });
    const row = map.get(id);
    row[kind] += amount;
    row.lines.push({ description, amount });
  };
  for (const r of s.rounds.filter(
    (r) =>
      (includeTest || !r.test) &&
      (roundId ? r.id === roundId : from <= r.date && r.date <= to),
  ))
    for (const [id, o] of Object.entries(r.orders)) {
      const amount = orderAmount(r, o);
      if (amount)
        add(
          id,
          s.buyers.find((b) => b.id === id)?.name || o.name,
          "normal",
          amount,
          `${r.date} 通常注文`,
        );
    }
  for (const sale of s.sales.filter(
    (x) =>
      !x.void &&
      (x.destinationType || (!x.paid && !x.pending ? 'buyer' : 'external')) === 'buyer' &&
      (includeTest || !isSaleTest(s, x)) &&
      (roundId ? x.chargeRoundId === roundId : from <= x.date && x.date <= to),
  ))
    add(
      sale.buyerId,
      s.buyers.find((b) => b.id === sale.buyerId)?.name || sale.buyerName,
      "onsite",
      sale.price * sale.qty,
      `${sale.date} ${s.stocks.find((st) => st.id === sale.stockId).name} ×${sale.qty}`,
    );
  for (const sale of (s.bundleSales||[]).filter(
    (x) => !x.void && x.destinationType === 'buyer' && (includeTest || !s.rounds.find(r=>r.id===x.chargeRoundId)?.test) &&
      (roundId ? x.chargeRoundId === roundId : from <= x.date && x.date <= to),
  )) add(sale.buyerId,s.buyers.find(b=>b.id===sale.buyerId)?.name||sale.destinationName,'onsite',sale.price*sale.qty,`${sale.date} ${sale.name} ×${sale.qty}`);
  return [...map.values()].map((r) => ({ ...r, total: r.normal + r.onsite }));
}
export function report(s, from, to, year) {
  const inRange = (d) => from <= d && d <= to;
  const rows = [];
  for (const r of s.rounds.filter((r) => !r.test && inRange(r.date) && (Object.keys(r.orders).length || r.invoice!=null))) {
    const revenue = roundRevenue(r),
      cost = roundCost(s, r);
    rows.push({
      id: r.id,
      date: r.date,
      type: "通常販売",
      name: `${r.date} 納品`,
      revenue,
      cost,
      profit: cost == null ? null : revenue - cost,
      provisional: r.status !== "精算済み",
    });
  }
  for (const sale of s.sales.filter(
    (x) => !x.void && !isSaleTest(s, x) && inRange(x.date),
  ))
    rows.push({
      id: sale.id,
      date: sale.date,
      type: "販売用商品",
      name: s.stocks.find((st) => st.id === sale.stockId).name,
      revenue: sale.qty * sale.price,
      cost: sale.cost == null ? null : sale.qty * sale.cost,
      profit: sale.cost == null ? null : sale.qty * (sale.price - sale.cost),
      provisional: (()=>{const st=s.stocks.find(st=>st.id===sale.stockId),mid=sale.marketId||st?.marketId;return mid && s.markets?.find(m=>m.id===mid)?.expense==null;})(),
    });
  for(const x of (s.bundleSales||[]).filter(x=>!x.void&&inRange(x.date))){
    const m=s.markets.find(m=>m.id===x.marketId),r=s.rounds.find(r=>r.id===m?.roundId);if(r?.test)continue;
    const cost=bundleCost(x),revenue=x.price*x.qty;
    rows.push({id:x.id,date:x.date,type:'外部セット販売',name:x.name,revenue,cost,profit:cost==null?null:revenue-cost,provisional:m?.expense==null});
  }
  for(const m of (s.markets||[]).filter(m=>inRange(m.date)&&!s.rounds.find(r=>r.id===m.roundId)?.test)){
    if(m.expenseMode==='apply'&&m.expense!=null)rows.push({id:m.id,date:m.date,type:'外部販売経費',name:m.name,revenue:0,cost:0,profit:-m.expense,expense:m.expense});
  }
  for (const h of s.history.filter((h) => !h.test && inRange(h.date)))
    rows.push({
      ...h,
      type: "過去実績",
      name: h.note || "過去実績",
      profit: h.revenue == null ? h.profit : h.revenue - h.cost,
    });
  const adjustments = s.adjustments.filter(
    (a) =>
      a.year === Number(year) &&
      (a.date
        ? inRange(a.date)
        : from === `${year}-04-01` && to === `${Number(year) + 1}-03-31`),
  );
  const salesProfit = sum(rows.map((r) => r.profit ?? 0)),
    adjustment = sum(adjustments.map((a) => a.amount));
  return {
    rows: rows.sort((a, b) => a.date.localeCompare(b.date)),
    adjustments,
    revenue: sum(rows.map((r) => r.revenue ?? 0)),
    cost: sum(rows.map((r) => r.cost ?? 0)),
    unknownRevenue: rows.some((r) => r.revenue == null),
    unknownCost: rows.some((r) => r.cost == null),
    pending: rows.filter((r) => r.profit == null).length,
    provisional: rows.some((r) => r.provisional),
    salesProfit,
    expenses: sum(rows.map(r=>r.expense||0)),
    adjustment,
    profit: salesProfit + adjustment,
    undated: s.adjustments.filter(
      (a) => a.year === Number(year) && !a.date && !adjustments.includes(a),
    ).length,
  };
}
export function setTest(s, round, test) {
  round.test = test;
  for (const e of s.events.filter((e) => round.eventIds.includes(e.id)))
    setEventTest(s, e, test);
  for (const st of s.stocks.filter(
    (st) => round.stockIds.includes(st.id) || st.roundId === round.id,
  ))
    st.test = test;
  for (const sale of s.sales.filter((x) => x.chargeRoundId === round.id)) {
    if (s.stocks.find((st) => st.id === sale.stockId).test !== test)
      throw Error(
        "集金に含まれる園内販売とテスト区分が異なります。先に販売記録の集金先を解除してください",
      );
  }
}
export function setEventTest(s, e, test) {
  e.test = test;
  for (const st of s.stocks.filter((st) => st.eventId === e.id)) st.test = test;
}
export function validate(s) {
  if (s.schema !== 1 && s.schema !== 2) throw Error("未対応のデータ形式です");
  const unique = (rows, key = "id") => {
    if (new Set(rows.map((r) => r[key])).size !== rows.length)
      throw Error("同じデータが重複しています");
  };
  [
    "products",
    "buyers",
    "rounds",
    "events",
    "stocks",
    "sales",
    "history",
    "adjustments",
  ].forEach((k) => unique(s[k]));
  unique(
    s.products.map((p) => ({ name: normalize(p.name) })),
    "name",
  );
  unique(
    s.buyers.map((p) => ({ name: normalize(p.name) })),
    "name",
  );
  const date = (d) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      Number.isNaN(new Date(d + "T00:00:00Z").valueOf()) ||
      new Date(d + "T00:00:00Z").toISOString().slice(0, 10) !== d
    )
      throw Error("日付を確認してください");
  };
  for (const p of s.products) {
    if (!p.name.trim()) throw Error("商品名が必要です");
    if (p.gross != null) integer(p.gross, "税込価格");
    if (p.cost != null) integer(p.cost, "仕入単価");
    if (p.mode === "manual") integer(p.manual, "指定販売価格");
    if (p.start) date(p.start);
    if (p.end) date(p.end);
    if (p.start && p.end && p.end < p.start)
      throw Error("対象期間の終了日を確認してください");
    if (p.lifecycle && !["staple", "once", "seasonal", "permanent"].includes(p.lifecycle)) throw Error("商品区分を確認してください");
    if (p.lifecycle === "seasonal" && (!p.start || !p.end)) throw Error("期間商品の開始日と終了日が必要です");
  }
  for (const b of s.buyers) {
    if (!b.name.trim()) throw Error("購入者名が必要です");
    unique(b.fixed, "productId");
    for (const f of b.fixed) {
      integer(f.qty, "固定注文数");
      if (!s.products.some((p) => p.id === f.productId))
        throw Error("固定注文の商品が見つかりません");
    }
  }
  const links = [];
  for (const r of s.rounds) {
    date(r.date);
    if (!["入力中", "注文確定", "納品済み", "精算済み"].includes(r.status))
      throw Error("注文状態が不正です");
    unique(r.products);
    for (const p of r.products) integer(p.price, "販売価格");
    for (const [bid, o] of Object.entries(r.orders)) {
      if (!s.buyers.some((b) => b.id === bid))
        throw Error("購入者が見つかりません");
      for (const [pid, q] of Object.entries(o.quantities)) {
        integer(q, "注文数");
        if (!r.products.some((p) => p.id === pid))
          throw Error("注文回に商品がありません");
      }
    }
    for (const id of r.eventIds) {
      const e = s.events.find((e) => e.id === id);
      if (!e || e.test !== r.test)
        throw Error("納品書の行事区分を確認してください");
      links.push("e" + id);
    }
    for (const id of r.stockIds) {
      const st = s.stocks.find((x) => x.id === id);
      if (!st || st.eventId || st.test !== r.test)
        throw Error("納品書の園内販売区分を確認してください");
      links.push("s" + id);
    }
    if (r.invoice != null) {
      integer(r.invoice, "仕入税込総額");
      const d = invoiceDeductions(s, r);
      if (d == null)
        throw Error("同じ納品書の行事仕入単価を先に入力してください");
      if (r.invoice < d)
        throw Error("仕入総額が行事・園内販売の仕入額より小さくなっています");
    }
    if (r.status === "精算済み" && r.invoice == null)
      throw Error("精算前に仕入税込総額を入力してください");
  }
  if (new Set(links).size !== links.length)
    throw Error("同じ仕入を複数の納品書に含めることはできません");
  for (const e of s.events) {
    if (!e.name.trim() || !e.lines.length)
      throw Error("行事名と注文商品を入力してください");
    date(e.date);
    unique(e.lines);
    for (const l of e.lines) {
      if (!l.name.trim()) throw Error("行事の商品名を入力してください");
      integer(l.qty, "行事注文数");
      integer(l.used, "行事使用数");
      if (l.cost != null) integer(l.cost, "仕入単価");
      if (l.used + transferredQty(s, l.id) > l.qty)
        throw Error("行事使用数と振替数が注文数を超えています");
    }
  }
  for (const st of s.stocks) {
    if (!st.name.trim()) throw Error("園内販売の商品名を入力してください");
    date(st.date);
    integer(st.qty, "販売可能数");
    if (st.cost != null) integer(st.cost, "仕入単価");
    integer(st.price, "販売価格");
    if (stockRemaining(s, st) < 0) throw Error("販売数が在庫数を超えています");
    if (st.eventId) {
      const e = s.events.find((e) => e.id === st.eventId),
        l = e?.lines.find((l) => l.id === st.eventLineId);
      if (!l || st.cost == null || (st.qty > 0 && st.cost !== l.cost) || st.test !== e.test)
        throw Error("行事振替元と仕入単価・テスト区分が一致しません");
    }
  }
  for (const sale of s.sales) {
    date(sale.date);
    integer(sale.qty, "販売数");
    integer(sale.price, "販売価格");
    if (sale.cost != null) integer(sale.cost, "仕入単価");
    const st = s.stocks.find((st) => st.id === sale.stockId);
    if (!st || sale.qty < 1 || sale.date < st.date)
      throw Error("販売日・販売数を確認してください");
    if (sale.cost !== st.cost)
      throw Error("販売済み商品の単価は変更できません");
    const destinationType=sale.destinationType || (sale.pending?'unknown':sale.paid?'external':'buyer');
    const paymentStatus=sale.paymentStatus || (sale.pending?'unconfirmed':sale.paid?'paid':'later');
    if (!['buyer','external','unknown'].includes(destinationType)||!['paid','later','unconfirmed'].includes(paymentStatus)) throw Error("販売先・支払状態を確認してください");
    if (destinationType==='unknown' && (paymentStatus!=='unconfirmed'||sale.buyerId||sale.chargeRoundId)) throw Error("未確認販売を入金・請求扱いにはできません");
    if (destinationType==='external' && !String(sale.destinationName||sale.buyerName||'').trim()) throw Error("外部販売先の名称が必要です");
    if (destinationType==='buyer' && (paymentStatus!=='later'||!s.buyers.some((b) => b.id === sale.buyerId)))
      throw Error("購入者を選択してください");
    if (sale.chargeRoundId) {
      const r = s.rounds.find((r) => r.id === sale.chargeRoundId);
      if (!r || r.test !== st.test)
        throw Error("集金する注文回のテスト区分が一致しません");
    }
  }
  for (const h of s.history) {
    date(h.date);
    if (h.revenue == null) {
      if (h.cost != null)
        throw Error("利益のみの登録は販売額・仕入額とも不明にしてください");
      integer(h.profit, "利益", true);
    } else {
      integer(h.revenue, "販売額");
      integer(h.cost, "仕入額");
    }
  }
  for (const a of s.adjustments) {
    integer(a.year, "年度");
    integer(a.amount, "調整額", true);
    if (a.date) {
      date(a.date);
      if (fiscalYear(a.date) !== a.year)
        throw Error("調整日が対象年度の範囲外です");
    }
  }
  validateCommerce(s);
  if (s.schema===2 && (!Array.isArray(s.externalDestinations) || new Set(s.externalDestinations).size !== s.externalDestinations.length || s.externalDestinations.some(x=>!String(x).trim()))) throw Error("外部販売先候補を確認してください");
  Object.values(s.goals).forEach((v) => integer(v, "目標額"));
  return s;
}
