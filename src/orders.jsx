import React, { useState } from "react";
import { deliveryTotals } from './commerce';
import {LineImport} from './line-import.jsx';
import {Sales} from './sales';
import {RoundCollections} from './collections';
import {Events} from './events';
import {Markets} from './markets';
import {ExcelImport} from './masters';
import {TaskIcon} from './task-icon';
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
  monthProductsImported,
} from "./domain";
import {
  useApp,
  Button,
  Field,
  Money,
  Qty,
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
  ["販売用", new URL("../wappan_icon_sales_basket_final.png", import.meta.url).href, "販売用の注文"],
  ["おやつ用", new URL("../wappan_icon_snack_use_anpan_final.png", import.meta.url).href, "おやつ用の注文"],
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
      <div className="home-start"><Button onClick={() => setCreating(true)}>＋ 新しい注文を始める</Button></div>
      <h2 className="list-heading">進行中・過去の注文</h2>
      {[...state.rounds]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((r) => (
          <button
            className={`card clickable round-list-item status-${r.status}`}
            key={r.id}
            onClick={() => setId(r.id)}
          >
            <div className="line">
              <h2>{r.date.replaceAll("-", "/")} 着</h2>
              <Tag>{r.status}</Tag>
            </div>
            {r.test && <Tag>テスト・年度集計対象外</Tag>}
            <span className="round-open" aria-hidden="true">›</span>
          </button>
        ))}
      {!state.rounds.length && (
        <Empty>納品日を選んで新しい注文を始めましょう。</Empty>
      )}
      {creating && (
        <Modal title="いつ届く分を注文しますか" onClose={() => setCreating(false)}>
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
    [products, setProducts] = useState(false), [lineImport,setLineImport]=useState(false), [excelImport,setExcelImport]=useState(false);
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
  const needsMonthlyProducts = r.productImportPending && !monthProductsImported(state, r.date);
  const monthLabel = `${Number(r.date.slice(5, 7))}月`;
  return (
    <>
      <button type="button" className="text-action back-link"
        onClick={() => {
          if (
            draft &&
            !confirm("個人注文を閉じますか？未保存の数量変更は失われます。")
          )
            return;
          back();
        }}
      >
        ‹ 注文一覧へ
      </button>
      <div className="delivery-heading">
        <div><span className="eyebrow">納品予定日</span><h1>{r.date.replaceAll("-", "/")} 着</h1></div>
        <Button secondary onClick={() => setSettings(true)}>
          詳細
        </Button>
      </div>
      <p>
        <Tag>{r.status}</Tag> {r.test && <Tag>テスト・集計対象外</Tag>}
      </p>
      {needsMonthlyProducts ? (
        <section className="monthly-import-callout">
          <div>
            <strong>② {monthLabel}の商品を準備する</strong>
            <small>{monthLabel}の注文票を読み込みます。</small>
          </div>
          <Button onClick={() => setExcelImport(true)}><TaskIcon type="excel"/>{monthLabel}のExcel注文表を取り込む</Button>
        </section>
      ) : <details className="monthly-import-ready">
        <summary>商品情報を更新</summary>
        <Button secondary onClick={() => setExcelImport(true)}>{monthLabel}の商品を更新</Button>
      </details>}
      {r.note && <details className="round-note"><summary>この注文回のメモ</summary><p>{r.note}</p></details>}
      <section className="order-stage"><h2 className="workflow-heading">① 注文 <small>用途を選ぶ</small></h2>
      <div className="purpose-grid" aria-label="注文の用途を選ぶ">
        {PURPOSES.map(([label, image, note]) => (
          <button type="button" key={label} data-purpose={label} className={`purpose ${tab === label ? "selected" : ""}`} onClick={() => setTab(label)}>
            <img src={image} alt="" />
            <span><strong>{label}</strong><small>{note}</small></span>
          </button>
        ))}
      </div></section>
      <div className="tabs work-tabs">
        {[["発注", "②"], ["納品・精算", "③"], ["集金", "④"]].map(([t, number]) => (
          <Button key={t} secondary={tab !== t} onClick={() => setTab(t)}>
            <TaskIcon type={{'発注':'totals','納品・精算':'delivery','集金':'coins'}[t]}/>
            <span className="work-tab-label"><span aria-hidden="true">{number} </span>{t}</span></Button>
        ))}
      </div>
      {lineImport&&<LineImport round={r} onClose={()=>setLineImport(false)}/>}
      {excelImport&&<ExcelImport targetRoundId={r.id} onClose={()=>setExcelImport(false)}/>}
      {tab==='販売用'&&<Sales roundId={r.id} phase="order" onManageProducts={() => setProducts(true)}/>}
      {tab==='おやつ用'&&<Events roundId={r.id} phase="order" onManageProducts={() => setProducts(true)}/>}
      {tab === "個人注文" && (
        <>
          <section className="personal-start">
          <div className="section-head">
              <h2>① 個人注文を入力する</h2>
            <div className="compact-actions">
              <Button secondary onClick={()=>setLineImport(true)}>注文を貼り付け</Button>
              <Button secondary onClick={() => setProducts(true)}>商品を追加・変更</Button>
            </div>
          </div>
          <BuyerPicker value={buyerId} onChange={choose} includeTest={r.test} /></section>
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
                startCollapsed
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
          {Object.keys(r.orders).length > 0 && <h3>入力済みの購入者</h3>}
          {Object.entries(r.orders).map(([id, o]) => (
            <button
              className="card clickable line completed-buyer"
              key={id}
              onClick={() => choose(id)}
            >
              <span className="completed-buyer-name">
                {state.buyers.find((b) => b.id === id)?.name || o.name}
              </span>
              <b>{yen(orderAmount(r, o))} ›</b>
            </button>
          ))}
        </>
      )}
      {tab === "集金" && (
        <>
          <Summary
            label={r.reconciliationPending ? "個人請求の判明分（照合中・未確定）" : "この注文回にまとめた個人請求"}
            value={yen(rows.reduce((a, b) => a + b.total, 0))}
            note="個人注文＋販売用からの追加購入。外部売上は含みません。"
          />
          <RoundCollections round={r} rows={rows} />
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
      {tab === "発注" && (
        <>
          <h2>わっぱんへ発注する数量</h2>
          {deliveryTotals(state,r).map((p) => (
            <div className="delivery-total-row" key={p.id}>
              <span>{p.name}</span>
              <span className="delivery-total-quantity"><strong>{p.qty}個</strong><small>{[["個人",p.personal],["販売",p.sales],["おやつ",p.snack]].filter(([,n])=>n>0).map(([name,n])=>`${name}${n}`).join("｜")}</small></span>
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
          {r.planned && r.products.some((p) => (productTotals(r, r.planned).find((x) => x.id === p.id)?.qty||0)!==(productTotals(r).find((x) => x.id === p.id)?.qty||0)) && (
            <details>
              <summary>発注確定後に変更あり</summary>
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
          <h2>納品後に確認する</h2>
          <Shortage round={r}/>
          <Invoice key={`${r.id}-${r.invoice}`} round={r} />
          <details className="after-work"><summary>販売先を割り当てる</summary>
            <Sales roundId={r.id} phase="after"/>
            <details><summary>販売場所・セットを使う</summary><Markets roundId={r.id}/></details>
          </details>
          <details className="after-work"><summary>おやつ使用・財政請求</summary>
            <Events roundId={r.id} phase="after"/>
          </details>
          <details className="after-work"><summary>利益の確認</summary>
            <div className="grid2"><Summary label="販売額" value={yen(total)} />
              <Summary label="利益" value={yen(cost == null ? null : total - cost)} /></div>
          </details>
          {r.planned && r.products.some((p) => (productTotals(r, r.planned).find((x) => x.id === p.id)?.qty||0)!==(productTotals(r).find((x) => x.id === p.id)?.qty||0)) && (
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
function Shortage({round:r}) {
  const {save} = useApp();
  const [choice,setChoice] = useState(r.shortageConfirmation || null);
  const [buyerId,setBuyerId] = useState('');
  const [quantities,setQuantities] = useState(null);
  const [agreed,setAgreed] = useState(false);
  const ordered = Object.entries(r.orders).filter(([,order])=>Object.values(order.quantities).some(q=>q>0));
  return <section className="shortage-check"><h3>欠品確認</h3>
    <div className="segmented" role="group" aria-label="欠品確認">
      {[['none','なし'],['yes','あり']].map(([value,label]) => <button type="button" key={value}
        className={choice===value?'selected':''} aria-pressed={choice===value}
        onClick={async()=>{if(await save(s=>{s.rounds.find(x=>x.id===r.id).shortageConfirmation=value;},'欠品確認'))setChoice(value);}}>{label}</button>)}
    </div>
    {choice === 'yes' && <div className="shortage-editor">
      <Field label="欠品を修正する購入者"><select value={buyerId} onChange={e=>{const id=e.target.value;setBuyerId(id);setQuantities(id?{...r.orders[id].quantities}:null);setAgreed(false);}}>
        <option value="">購入者を選ぶ</option>{ordered.map(([id,o])=><option key={id} value={id}>{o.name}</option>)}
      </select></Field>
      {buyerId && quantities && <>
        {r.products.filter(p=>(r.orders[buyerId]?.quantities[p.id]||0)>0).map(p=><div className="product-row" key={p.id}><span className="grow">{p.name}<small>注文 {r.orders[buyerId].quantities[p.id]}個</small></span>
          <Qty label={`${p.name} 納品数量`} value={quantities[p.id]||0} onChange={n=>setQuantities({...quantities,[p.id]:n})}/></div>)}
        <Check label="購入者の了承を得て数量を修正する" checked={agreed} onChange={setAgreed}/>
        <Button disabled={!agreed||r.products.some(p=>(quantities[p.id]||0)>(r.orders[buyerId].quantities[p.id]||0))} onClick={async()=>{
          if(await save(s=>{s.rounds.find(x=>x.id===r.id).orders[buyerId].quantities=quantities;},'欠品による注文数量を修正')) {setBuyerId('');setQuantities(null);setAgreed(false);}
        }}>了承済みの数量で保存</Button>
      </>}
    </div>}
  </section>;
}
function Invoice({ round: r }) {
  const { state, save } = useApp();
  const [invoice, setInvoice] = useState(r.invoice),
    [eventIds, setEvents] = useState(r.eventIds),
    [stockIds, setStocks] = useState(r.stockIds),
    [status, setStatus] = useState(r.status);
  const preview = { ...r, invoice, eventIds, stockIds },
    ded = invoiceDeductions(state, preview);
  const snackRows = state.events.filter(e => eventIds.includes(e.id));
  const salesRows = state.stocks.filter(st => stockIds.includes(st.id));
  const snackKnown = snackRows.every(e => e.lines.every(line => line.cost != null));
  const salesKnown = salesRows.every(st => st.cost != null);
  const snackCost = snackKnown ? snackRows.reduce((n,e) => n + e.lines.reduce((m,line) => m + line.qty * line.cost,0),0) : null;
  const salesCost = salesKnown ? salesRows.reduce((n,st) => n + st.qty * st.cost,0) : null;
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
        const nextStatus = status === '注文確定' && r.shortageConfirmation === 'none' && invoice != null ? '納品済み' : status;
        await save((s) => {
          const round = s.rounds.find((x) => x.id === r.id);
          Object.assign(round, { invoice, eventIds, stockIds, status: nextStatus });
          if (nextStatus !== "入力中")
            round.planned ??= structuredClone(round.orders);
        }, "納品・仕入額を保存");
      }}
    >
      <h2>納品書の仕入額を登録</h2>
      <Money
        label="納品書の税込合計"
        unit="円"
        value={invoice}
        onChange={setInvoice}
      />
      {invoice != null && <div className="cost-overview">個人注文 {yen(roundCost(state, preview))} ／ 販売用 {yen(salesCost)} ／ おやつ用 {yen(snackCost)}</div>}
      <details>
        <summary>用途別の内訳を見る</summary>
        {snackRows.map(e=><p key={e.id}>おやつ用：{e.name} ／ {yen(e.lines.every(line=>line.cost!=null) ? e.lines.reduce((n,line)=>n+line.qty*line.cost,0) : null)}</p>)}
        {salesRows.map(st=><p key={st.id}>販売用：{st.name} ×{st.qty} ／ {yen(st.cost==null?null:st.cost*st.qty)}</p>)}
      </details>
      {invoice != null && ded == null && <p className="notice">用途別の仕入単価を確認してから精算済みにしてください。</p>}
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
    <Modal title="注文の詳細" onClose={onClose}>
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
