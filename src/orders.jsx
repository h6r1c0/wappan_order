import React, { useState } from "react";
import { deliveryTotals } from './commerce';
import {LineImport} from './line-import.jsx';
import {Sales} from './sales';
import {Events} from './events';
import {Markets} from './markets';
import {
  newRound,
  productAvailable,
  price,
  snapshot,
  orderDraft,
  orderAmount,
  roundRevenue,
  roundCost,
  productTotals,
  collections,
  yen,
  today,
  invoiceDeductions,
  setTest,
} from "./domain";
import {
  useApp,
  Button,
  Field,
  Money,
  Check,
  Modal,
  Tag,
  ProductQuantityEditor,
  Summary,
  Empty,
  BuyerPicker,
  CollectionList,
  copyText,
} from "./ui";
const PURPOSES = [
  ["個人注文", new URL("../wappan_icon_personal_order_final.png", import.meta.url).href, "購入者ごとの注文"],
  ["販売用", new URL("../wappan_icon_sales_basket_final.png", import.meta.url).href, "販売・残数・セット"],
  ["おやつ用", new URL("../wappan_icon_snack_use_anpan_final.png", import.meta.url).href, "使用数と財政請求"],
];
export function Orders() {
  const { state, save } = useApp();
  const [id, setId] = useState(null),
    [creating, setCreating] = useState(false),
    [date, setDate] = useState(today()),
    [test, setIsTest] = useState(false);
  const r = state.rounds.find((r) => r.id === id);
  return r ? (
    <Round key={r.id} round={r} back={() => setId(null)} />
  ) : (
    <>
      <div className="section-head">
        <h1>納品日ごとの注文</h1>
        <Button onClick={() => setCreating(true)}>＋ 注文回を作る</Button>
      </div>
      <p className="lead">納品日を開いて、購入者の注文を入力します。</p>
      {[...state.rounds]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((r) => (
          <button
            className="card clickable"
            key={r.id}
            onClick={() => setId(r.id)}
          >
            <div className="line">
              <h2>{r.date.replaceAll("-", "/")} 着</h2>
              <Tag>{r.status}</Tag>
            </div>
            {r.test && <Tag>テスト・年度集計対象外</Tag>}
            <div className="line">
              <span>{Object.keys(r.orders).length}人 入力済み</span>
              <strong>{r.reconciliationPending ? "判明分 " : ""}{yen(roundRevenue(r))} ›</strong>
            </div>
          </button>
        ))}
      {!state.rounds.length && (
        <Empty>まず「注文回を作る」から納品日を登録してください。</Empty>
      )}
      {creating && (
        <Modal title="注文回を作る" onClose={() => setCreating(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const existing=state.rounds.find(r=>r.date===date&&r.test===test);
              if(existing){setCreating(false);setId(existing.id);return;}
              const r = newRound(state, date, test);
              if (await save((s) => s.rounds.push(r), "注文回を作成")) {
                setCreating(false);
                setId(r.id);
              }
            }}
          >
            <Field
              label="納品予定日"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Check
              label="テスト入力（年度実績へ含めない）"
              checked={test}
              onChange={setIsTest}
            />
            <p className="muted">
              販売価格が登録され、対象期間内の商品をこの回へ入れます。商品は後から追加できます。
            </p>
            <Button type="submit">この納品日で注文を始める</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Round({ round: r, back }) {
  const { state, save, notify } = useApp();
  const [tab, setTab] = useState("個人注文"),
    [buyerId, setBuyerId] = useState(null),
    [draft, setDraft] = useState(null),
    [settings, setSettings] = useState(false),
    [products, setProducts] = useState(false), [lineImport,setLineImport]=useState(false);
  const choose = (id, newBuyer) => {
    if (
      draft &&
      JSON.stringify(draft) !==
        JSON.stringify(
          orderDraft(
            state,
            r,
            state.buyers.find((b) => b.id === buyerId),
          ),
        ) &&
      !confirm("入力中の内容を保存せず、購入者を切り替えますか？")
    )
      return;
    setBuyerId(id);
    setDraft(
      orderDraft(state, r, newBuyer || state.buyers.find((b) => b.id === id)),
    );
    requestAnimationFrame(() => document.querySelector('.order-editor')?.scrollIntoView({block:'start'}));
  };
  const currentBuyer = state.buyers.find((b) => b.id === buyerId);
  const rows = collections(state, "", "", r.id, r.test);
  const total = roundRevenue(r),
    cost = roundCost(state, r);
  return (
    <>
      <Button
        secondary
        onClick={() => {
          if (
            draft &&
            !confirm("個人注文を閉じますか？未保存の数量変更は失われます。")
          )
            return;
          back();
        }}
      >
        ‹ 注文回一覧
      </Button>
      <div className="delivery-heading">
        <div><span className="eyebrow">現在の納品日</span><h1>{r.date.replaceAll("-", "/")} 着</h1></div>
        <Button secondary onClick={() => setSettings(true)}>
          日付・状態
        </Button>
      </div>
      <p>
        <Tag>{r.status}</Tag> {r.test && <Tag>テスト・集計対象外</Tag>}
      </p>
      {r.note && (r.reconciliationPending ? <details className="notice"><summary>実資料の照合中：表示金額は判明分です（詳細・未確認事項）</summary><p>{r.note}</p></details> : <p className="notice">{r.note}</p>)}
      <div className="purpose-grid" aria-label="注文の用途を選ぶ">
        {PURPOSES.map(([label, image, note]) => (
          <button type="button" key={label} className={`purpose ${tab === label ? "selected" : ""}`} onClick={() => setTab(label)}>
            <img src={image} alt="" />
            <span><strong>{label}</strong><small>{note}</small></span>
          </button>
        ))}
      </div>
      <div className="tabs work-tabs">
        {["集金額", "発注数", "納品・精算"].map((t) => (
          <Button key={t} secondary={tab !== t} onClick={() => setTab(t)}>{t}</Button>
        ))}
      </div>
      {lineImport&&<LineImport round={r} onClose={()=>setLineImport(false)}/>}
      {tab==='販売用'&&<><Sales roundId={r.id} onManageProducts={() => setProducts(true)}/><Markets roundId={r.id}/></>}
      {tab==='おやつ用'&&<Events roundId={r.id} onManageProducts={() => setProducts(true)}/>}
      {tab === "個人注文" && (
        <>
          <section className="personal-start"><Button className="line-import-entry" secondary onClick={()=>setLineImport(true)}>LINE注文を貼り付けて入力を省く</Button>
          <div className="section-head">
              <h2>購入者を選ぶ</h2>
            <Button secondary onClick={() => setProducts(true)}>
              この納品日の商品
            </Button>
          </div>
          <BuyerPicker value={buyerId} onChange={choose} includeTest={r.test} /></section>
          {!draft && (
            <Empty>
              名前をタップすると、固定注文が入った入力欄が開きます。
            </Empty>
          )}
          {draft && (
            <section className="card order-editor" data-unsaved="true">
              <h2>{currentBuyer?.name}さんの注文</h2>
              {currentBuyer?.fixed.some(
                (f) => !r.products.some((p) => p.id === f.productId),
              ) && (
                <p className="notice">
                  固定注文のうち、この回にない商品があります。「この納品日の商品」で追加してください。価格未確認の商品は先に商品管理で価格を設定してください。
                </p>
              )}
              <ProductQuantityEditor
                products={r.products}
                quantities={draft.quantities}
                onChange={(quantities) => setDraft({ ...draft, quantities })}
                emptyMessage="「この納品日の商品」から、販売価格が分かっている商品を追加してください。"
              />
              <div className="sticky-action">
                <span>
                  合計 <strong>{yen(orderAmount(r, draft))}</strong>
                </span>
                <Button
                  onClick={async () => {
                    if (
                      await save((s) => {
                        s.rounds.find((x) => x.id === r.id).orders[buyerId] =
                          draft;
                      }, `${currentBuyer.name}の注文を保存`)
                    ) {
                        setDraft(null);
                        setBuyerId(null);
                        requestAnimationFrame(() => document.querySelector('.buyer-grid')?.scrollIntoView({block:'start'}));
                    }
                  }}
                >
                  保存して次の購入者へ
                </Button>
              </div>
            </section>
          )}
          <h3>入力済みの購入者</h3>
          {Object.entries(r.orders).map(([id, o]) => (
            <button
              className="card clickable line completed-buyer"
              key={id}
              onClick={() => choose(id)}
            >
              <span className="completed-buyer-name">
                {state.buyers.find((b) => b.id === id)?.name || o.name}
                <small>入力済み</small>
              </span>
              <b>{yen(orderAmount(r, o))} ›</b>
            </button>
          ))}
        </>
      )}
      {tab === "集金額" && (
        <>
          <Summary
            label={r.reconciliationPending ? "個人請求の判明分（照合中・未確定）" : "この注文回にまとめた個人請求"}
            value={yen(rows.reduce((a, b) => a + b.total, 0))}
            note="個人注文＋販売用からの追加購入。外部売上は含みません。"
          />
          <CollectionList rows={rows} />
          <Button
            secondary
            onClick={async () => {
              try {
                await copyText(
                  (r.reconciliationPending ? "照合用・未確定（未確認価格・販売用商品の個人割当を含まない）\n" : "") + rows.map((x) => `${x.name}　${yen(x.total)}`).join("\n"),
                );
                notify("集金額をコピーしました");
              } catch (e) {
                notify(e.message);
              }
            }}
          >
            集金額をコピー
          </Button>
        </>
      )}
      {tab === "発注数" && (
        <>
          <h2>わっぱんへ発注する数量</h2>
          <p className="muted">
            個人注文・販売用・おやつ用を合算した、この納品日の発注数です。販売場所の変更や余剰の振替は追加発注に数えません。
          </p>
          {deliveryTotals(state,r).map((p) => (
            <div className="card line" key={p.id}>
              <span>{p.name}<small>個人 {p.personal} ／ 販売用 {p.sales} ／ おやつ用 {p.snack}</small></span>
              <strong>{p.qty} 個／袋</strong>
            </div>
          ))}
          {!productTotals(r).length && (
            <Empty>注文を入力すると商品別数量が表示されます。</Empty>
          )}
          <Button
            secondary
            onClick={async () => {
              try {
                await copyText(
                  `${r.date} 納品\n` +
                    deliveryTotals(state,r)
                      .map((p) => `${p.name}　${p.qty}`)
                      .join("\n"),
                );
                notify("発注数をコピーしました");
              } catch (e) {
                notify(e.message);
              }
            }}
          >
            商品名・数量をコピー
          </Button>
          <pre className="copyable">
            {deliveryTotals(state,r)
              .map((p) => `${p.name}　${p.qty}`)
              .join("\n")}
          </pre>
          {r.planned && (
            <details>
              <summary>注文確定時の数量を見る</summary>
              {productTotals(r, r.planned).map((p) => (
                <p key={p.id}>
                  {p.name}：{p.qty}
                </p>
              ))}
            </details>
          )}
          {r.status === "入力中" && (
            <Button
              onClick={() =>
                save((s) => {
                  const round = s.rounds.find((x) => x.id === r.id);
                  round.status = "注文確定";
                  round.planned ??= structuredClone(round.orders);
                }, "注文確定")
              }
            >
              注文確定にする
            </Button>
          )}
        </>
      )}
      {tab === "納品・精算" && (
        <>
          <div className="notice">
            欠品があるときだけ「個人注文」で、了承した購入者の数量を減らして保存してください。全員の納品確認は不要です。
          </div>
          <div className="grid2">
            <Summary label="修正後の通常販売額" value={yen(total)} />
            <Summary
              label="通常販売の利益"
              value={yen(cost == null ? null : total - cost)}
            />
          </div>
          <Invoice key={`${r.id}-${r.invoice}`} round={r} />
          {r.planned && (
            <details>
              <summary>注文確定時と現在の差を確認</summary>
              {r.products.map((p) => {
                const before =
                    productTotals(r, r.planned).find((x) => x.id === p.id)
                      ?.qty || 0,
                  after = productTotals(r).find((x) => x.id === p.id)?.qty || 0;
                return before === after ? null : (
                  <p key={p.id}>
                    {p.name}：{before} → {after}
                  </p>
                );
              })}
            </details>
          )}
        </>
      )}
      {settings && (
        <RoundSettings
          round={r}
          onClose={() => setSettings(false)}
          onDeleted={back}
        />
      )}{" "}
      {products && (
        <RoundProducts round={r} onClose={() => setProducts(false)} />
      )}
    </>
  );
}
function Invoice({ round: r }) {
  const { state, save } = useApp();
  const [invoice, setInvoice] = useState(r.invoice),
    [eventIds, setEvents] = useState(r.eventIds),
    [stockIds, setStocks] = useState(r.stockIds),
    [status, setStatus] = useState(r.status);
  const preview = { ...r, invoice, eventIds, stockIds },
    ded = invoiceDeductions(state, preview);
  return (
    <form
      className="card"
      data-unsaved={
        invoice !== r.invoice ||
        status !== r.status ||
        JSON.stringify(eventIds) !== JSON.stringify(r.eventIds) ||
        JSON.stringify(stockIds) !== JSON.stringify(r.stockIds)
      }
      onSubmit={async (e) => {
        e.preventDefault();
        await save((s) => {
          const round = s.rounds.find((x) => x.id === r.id);
          Object.assign(round, { invoice, eventIds, stockIds, status });
          if (status !== "入力中")
            round.planned ??= structuredClone(round.orders);
        }, "納品・仕入額を保存");
      }}
    >
      <h2>納品書の仕入額を登録</h2>
      <Money
        label="実際に支払う仕入税込総額"
        value={invoice}
        onChange={setInvoice}
      />
      <details open={eventIds.length > 0 || stockIds.length > 0}>
        <summary>同じ納品回の用途別仕入（自動で区分）</summary>
        <p className="muted">販売用・おやつ用は、この納品回への登録から自動で区分します。販売場所の変更や余剰振替は追加仕入に数えません。</p>
        {state.events.filter(e=>e.roundId===r.id).map(e=><p key={e.id}>おやつ用：{e.name}</p>)}
        {state.stocks.filter(st=>r.stockIds.includes(st.id)).map(st=><p key={st.id}>販売用：{st.name} ×{st.qty} ／ {yen(st.cost==null?null:st.cost*st.qty)}</p>)}
      </details>
      <p>販売用・おやつ用の仕入：{yen(ded)}</p>
      <p className="total">個人注文の仕入：{yen(roundCost(state, preview))}</p>
      <Field label="納品・精算の状態">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {["入力中", "注文確定", "納品済み", "精算済み"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      <Button type="submit">仕入額・状態を保存</Button>
    </form>
  );
}
function RoundSettings({ round: r, onClose, onDeleted }) {
  const { save } = useApp();
  const [date, setDate] = useState(r.date),
    [status, setStatus] = useState(r.status),
    [test, setIsTest] = useState(r.test),
    [note, setNote] = useState(r.note);
  return (
    <Modal title="注文回の日付・状態" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            test !== r.test &&
            !confirm(
              "関連する販売用・おやつ用も同じテスト区分へ変更します。続けますか？",
            )
          )
            return;
          if (
            await save((s) => {
              const round = s.rounds.find((x) => x.id === r.id);
              Object.assign(round, { date, status, note });
              if (status !== "入力中")
                round.planned ??= structuredClone(round.orders);
              setTest(s, round, test);
            }, "注文回の設定を保存")
          )
            onClose();
        }}
      >
        <Field
          label="納品予定日"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Field label="状態">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {["入力中", "注文確定", "納品済み", "精算済み"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="メモ">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Check
          label="テスト入力・年度集計から除外"
          checked={test}
          onChange={setIsTest}
        />
        <Button type="submit">設定を保存</Button>
      </form>
      {r.test && (
        <Button
          danger
          secondary
          onClick={async () => {
            if (!confirm("このテスト注文回を削除しますか？")) return;
            if (
              await save((s) => {
                if (
                  r.eventIds.length ||
                  r.stockIds.length ||
                  s.sales.some((x) => x.chargeRoundId === r.id) ||
                  s.stocks.some((x) => x.roundId === r.id)
                )
                  throw Error(
                    "関連データがあるため削除できません。テスト扱いのまま残せば集計に含まれません。",
                  );
                s.rounds = s.rounds.filter((x) => x.id !== r.id);
              }, "テスト注文回を削除")
            ) {
              onClose();
              onDeleted();
            }
          }}
        >
          テスト注文回を削除
        </Button>
      )}
    </Modal>
  );
}
function RoundProducts({ round: r, onClose }) {
  const { state, save } = useApp();
  const [items, setItems] = useState(structuredClone(r.products));
  return (
    <Modal title="この納品日の商品・価格" onClose={onClose}>
      <p className="muted">
        この納品日だけの商品候補と価格です。ここから外しても商品マスターや過去履歴は消えません。価格を変えると、この納品日の集金額が再計算されます。
      </p>
      {items.map((p) => (
        <div className="card" key={p.id}>
          <strong>{p.name}</strong>
          <Money
            label={`${p.name} 販売価格`}
            value={p.price}
            onChange={(price) =>
              setItems(items.map((x) => (x.id === p.id ? { ...x, price } : x)))
            }
          />
          <Button
            secondary
            onClick={() => {
              if (
                Object.values(r.orders).some((o) => o.quantities[p.id]) ||
                Object.values(r.planned || {}).some((o) => o.quantities[p.id]) ||
                state.stocks.some(
                  (stock) => stock.roundId === r.id && stock.productId === p.id && stock.qty > 0,
                ) ||
                state.events.some(
                  (event) =>
                    event.roundId === r.id &&
                    event.lines.some((line) => line.productId === p.id && line.qty > 0),
                )
              ) {
                alert("この納品日で数量を入力済みのため、候補から外せません。数量を0にしてから操作してください。");
                return;
              }
              setItems(items.filter((x) => x.id !== p.id));
            }}
          >
            この納品日の候補から外す
          </Button>
        </div>
      ))}
      <h3>商品を追加</h3>
      {state.products
        .filter((p) => productAvailable(p, r.date, r.id) && !items.some((x) => x.id === p.id))
        .map((p) => (
          <Button
            secondary
            key={p.id}
            disabled={price(p) == null}
            onClick={() => setItems([...items, snapshot(p)])}
          >
            ＋ {p.name} {price(p) == null ? "（価格未確認）" : yen(price(p))}
          </Button>
        ))}
      <Button
        onClick={async () => {
          if (
            items.some((p) =>
              r.products.some((x) => x.id === p.id && x.price !== p.price),
            ) &&
            Object.keys(r.orders).length &&
            !confirm(
              "入力済みの購入者の集金額も再計算されます。この回の価格を変更しますか？",
            )
          )
            return;
          if (
            await save((s) => {
              const round = s.rounds.find((x) => x.id === r.id);
              round.products = items;
              for (const order of [
                ...Object.values(round.orders),
                ...Object.values(round.planned || {}),
              ]) {
                for (const id of Object.keys(order.quantities)) {
                  if (
                    !items.some((p) => p.id === id) &&
                    order.quantities[id] === 0
                  )
                    delete order.quantities[id];
                }
              }
            }, "注文回の商品を保存")
          )
            onClose();
        }}
      >
        この納品日の商品を保存
      </Button>
    </Modal>
  );
}
