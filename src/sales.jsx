import React, { useState } from "react";
import {
  uid,
  today,
  price,
  yen,
  stockRemaining,
  addSale,
  soldQty,
} from "./domain";
import {
  useApp,
  Button,
  Field,
  Money,
  Qty,
  Check,
  Modal,
  Cat,
  Tag,
  Empty,
  BuyerPicker,
} from "./ui";
export function Sales() {
  const { state, save } = useApp();
  const [edit, setEdit] = useState(null),
    [selling, setSelling] = useState(null),
    [all, setAll] = useState(false);
  return (
    <>
      <div className="section-head">
        <h1>園内販売</h1>
        <Button onClick={() => setEdit({})}>＋ 商品を置く</Button>
      </div>
      <p className="lead">
        売れたら「販売を記録」。残数と請求額が更新されます。
      </p>
      <Check label="売り切れの商品も表示" checked={all} onChange={setAll} />
      {state.stocks
        .filter((st) => all || stockRemaining(state, st) > 0)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((st) => (
          <section className="card" key={st.id}>
            <div className="product-row">
              <Cat category={st.category} />
              <div className="grow">
                <h2>{st.name}</h2>
                <small>
                  {st.date} ／ {yen(st.price)}
                  {st.eventId ? " ／ 行事から振替" : ""}
                </small>
              </div>
              <strong className="remaining">
                残り {stockRemaining(state, st)}
              </strong>
            </div>
            {st.test && <Tag>テスト</Tag>}
            <div className="actions">
              <Button
                disabled={stockRemaining(state, st) < 1}
                onClick={() => setSelling(st)}
              >
                販売を記録
              </Button>
              <Button secondary onClick={() => setEdit(st)}>
                数量・記録を見る
              </Button>
            </div>
          </section>
        ))}
      {!state.stocks.length && (
        <Empty>
          直接仕入れた商品は「商品を置く」から。行事の余剰は「行事」で振り替えます。
        </Empty>
      )}
      {edit && (
        <StockEditor
          stock={edit.id ? edit : null}
          onClose={() => setEdit(null)}
          onSale={() => {
            setSelling(edit);
            setEdit(null);
          }}
        />
      )}
      {selling && (
        <SaleEditor
          stock={state.stocks.find((s) => s.id === selling.id)}
          onClose={() => setSelling(null)}
        />
      )}
    </>
  );
}
function StockEditor({ stock, onClose }) {
  const { state, save } = useApp();
  const [st, set] = useState(
    stock
      ? structuredClone(stock)
      : {
          id: uid(),
          productId: "",
          name: "",
          category: "パン",
          qty: 1,
          price: null,
          cost: null,
          date: today(),
          test: false,
          note: "",
          eventId: null,
          eventLineId: null,
          roundId: null,
        },
  );
  const put = (k, v) => set({ ...st, [k]: v });
  const sold = stock ? soldQty(state, stock.id) : 0,
    locked = stock && state.sales.some((x) => x.stockId === stock.id);
  return (
    <Modal
      title={stock ? "園内販売の商品・販売記録" : "園内販売の商品を追加"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await save((s) => {
              if (stock)
                s.stocks[s.stocks.findIndex((x) => x.id === st.id)] = st;
              else s.stocks.push(st);
            }, "園内販売商品を保存")
          )
            onClose();
        }}
      >
        {!stock && (
          <Field label="商品を選ぶ">
            <select
              value={st.productId}
              onChange={(e) => {
                const p = state.products.find((x) => x.id === e.target.value);
                set({
                  ...st,
                  productId: p?.id || "",
                  name: p?.name || "",
                  category: p?.category || "パン",
                  price: p ? price(p) : null,
                  cost: p?.cost ?? null,
                });
              }}
            >
              <option value="">その他（商品名を入力）</option>
              {state.products
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field
          label="商品名"
          required
          value={st.name}
          onChange={(e) => put("name", e.target.value)}
        />
        <Field label="カテゴリー">
          <select
            value={st.category}
            onChange={(e) => put("category", e.target.value)}
          >
            <option>パン</option>
            <option>焼き菓子</option>
          </select>
        </Field>
        <Field
          label="販売開始日・入荷日"
          type="date"
          required
          value={st.date}
          onChange={(e) => put("date", e.target.value)}
        />
        {st.eventId ? (
          <p className="notice">
            行事から振替：{st.qty}個 ／ 仕入単価 {yen(st.cost)}
            <br />
            数量・仕入単価は振替元に連動するため、ここでは変更しません。
          </p>
        ) : (
          <>
            <Field label="入荷した総数量（販売済みを含む）">
              <Qty value={st.qty} onChange={(v) => put("qty", v)} />
            </Field>
            <Money
              required
              label="仕入単価"
              value={st.cost}
              onChange={(v) => put("cost", v)}
            />
          </>
        )}
        {locked ? (
          <p>
            販売価格 {yen(st.price)} ／ 仕入単価 {yen(st.cost)}
            （販売履歴があるため単価は変更不可）
          </p>
        ) : (
          <Money
            required
            label="通常販売価格"
            value={st.price}
            onChange={(v) => put("price", v)}
          />
        )}
        <Field label="メモ">
          <textarea
            value={st.note}
            onChange={(e) => put("note", e.target.value)}
          />
        </Field>
        {!st.eventId && (
          <Check
            label="テスト入力・年度集計から除外"
            checked={st.test}
            onChange={(v) => put("test", v)}
          />
        )}
        <Button type="submit">商品を保存</Button>
      </form>
      {stock && (
        <>
          <h3>販売記録（販売済み {sold}個）</h3>
          {state.sales
            .filter((x) => x.stockId === stock.id)
            .map((sale) => (
              <div className="card" key={sale.id}>
                <div className="line">
                  <strong>{sale.buyerName}</strong>
                  <span>
                    {sale.qty}個 ／ {yen(sale.qty * sale.price)}
                  </span>
                </div>
                <small>
                  {sale.date} ／ {sale.paid ? "入金済み" : "個人請求"}{" "}
                  {sale.void ? "／ 取消済み" : ""}
                </small>
                {sale.note && <p>{sale.note}</p>}
                {!sale.void && (
                  <Button
                    secondary
                    danger
                    onClick={async () => {
                      if (
                        confirm(
                          "この販売記録を取り消して、残数と請求額を戻しますか？",
                        )
                      ) {
                        if (
                          await save((s) => {
                            s.sales.find((x) => x.id === sale.id).void = true;
                          }, "園内販売を取消")
                        )
                          onClose();
                      }
                    }}
                  >
                    誤入力を取り消す
                  </Button>
                )}
              </div>
            ))}
        </>
      )}
    </Modal>
  );
}
export function SaleEditor({ stock, onClose }) {
  const { state, save } = useApp();
  const defaultRound =
    state.rounds.find((r) => r.stockIds.includes(stock.id)) ||
    state.rounds.find(
      (r) => stock.eventId && r.eventIds.includes(stock.eventId),
    );
  const [entry, set] = useState({
    date: today(),
    qty: 1,
    paid: false,
    buyerId: "",
    chargeRoundId: defaultRound?.id || null,
    note: "",
  });
  const put = (k, v) => set({ ...entry, [k]: v });
  return (
    <Modal title={`${stock.name}を販売`} onClose={onClose}>
      <p>
        残り {stockRemaining(state, stock)}個 ／ 1個 {yen(stock.price)}
      </p>
      <Field label="販売数量">
        <Qty value={entry.qty} onChange={(v) => put("qty", v)} />
      </Field>
      <Field
        label="販売日"
        type="date"
        value={entry.date}
        onChange={(e) => put("date", e.target.value)}
      />
      <div className="tabs">
        <Button secondary={entry.paid} onClick={() => put("paid", false)}>
          購入者へ後日請求
        </Button>
        <Button secondary={!entry.paid} onClick={() => put("paid", true)}>
          その場で支払い済み
        </Button>
      </div>
      {!entry.paid && (
        <>
          <h3>購入者を選ぶ</h3>
          <BuyerPicker
            value={entry.buyerId}
            onChange={(id) => put("buyerId", id)}
          />
          <Field label="集金をまとめる注文回">
            <select
              value={entry.chargeRoundId || ""}
              onChange={(e) => put("chargeRoundId", e.target.value || null)}
            >
              <option value="">注文回と別に集金（集計の個人請求に表示）</option>
              {state.rounds
                .filter((r) => r.test === stock.test)
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.date} 着
                  </option>
                ))}
            </select>
          </Field>
        </>
      )}
      <Field label="メモ・その場で購入した方の名称（任意）">
        <textarea
          value={entry.note}
          onChange={(e) => put("note", e.target.value)}
        />
      </Field>
      <p className="total">
        {entry.paid ? "入金額" : "個人請求に追加"}：
        {yen(stock.price * entry.qty)}
      </p>
      <Button
        onClick={async () => {
          if (
            await save(
              (s) =>
                addSale(
                  s,
                  s.stocks.find((x) => x.id === stock.id),
                  {
                    ...entry,
                    chargeRoundId: entry.paid ? null : entry.chargeRoundId,
                  },
                ),
              "園内販売を記録",
            )
          )
            onClose();
        }}
      >
        販売を記録して残数を減らす
      </Button>
    </Modal>
  );
}
