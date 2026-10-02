import {Shortage} from './shortage-ui';
import {receivedQuantity, updateDeliveryStatus} from './shortages';
import React, { useState } from "react";
import { deliveryTotals, setSalesOrderQuantities, salesOrderQuantities, salesCutQuantities } from './commerce';
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
  faxProducts,
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
const PURPOSES = ["個人注文", "販売用", "おやつ用"];
export function Orders() {
  const { state, save } = useApp();
  const [id, setId] = useState(null),
    [justCreated, setJustCreated] = useState(false),
    [creating, setCreating] = useState(false),
    [date, setDate] = useState(today()),
    [test, setIsTest] = useState(false);
  const r = state.rounds.find((r) => r.id === id);
  return r ? (
    <Round key={r.id} round={r} initialTab={justCreated ? "個人注文" : null} back={() => {setId(null);setJustCreated(false);}} />
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
            onClick={() => {setJustCreated(false);setId(r.id);}}
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
              if(existing){setCreating(false);setJustCreated(false);setId(existing.id);return;}
              const r = newRound(state, date, test);
              if (await save((s) => s.rounds.push(r), "注文回を作成")) {
                setCreating(false);
                setJustCreated(true);
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
function Round({ round: r, initialTab = null, back }) {
  const { state, save, notify } = useApp();
  const [tab, setTab] = useState(initialTab),
    [lastPurpose, setLastPurpose] = useState("個人注文"),
    [lastSavedBuyer, setLastSavedBuyer] = useState(null),
    [buyerId, setBuyerId] = useState(null),
    [draft, setDraft] = useState(null),
    [cutFees, setCutFees] = useState(() => Object.fromEntries(r.products.map(p => [p.id, p.cutFee ?? null]))),
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
  const activeStage = PURPOSES.includes(tab) ? "注文" : tab;
  const moveTo = (next) => {
    if (draft && JSON.stringify(draft) !== JSON.stringify(orderDraft(state, r, currentBuyer)) &&
      !confirm("未保存の個人注文を閉じますか？")) return;
    if (draft && next !== '個人注文') { setDraft(null); setBuyerId(null); }
    setTab(next);
    if (next) requestAnimationFrame(() => document.querySelector('.stage.active > .stage-trigger')?.scrollIntoView({block:'start',behavior:'smooth'}));
    if (PURPOSES.includes(next)) setLastPurpose(next);
  };
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
      {r.note && <details className="round-note"><summary>この注文回のメモ</summary><p>{r.note}</p></details>}
      <div className="stage-list" aria-label="注文の工程">
        {["注文", "発注", "納品・精算", "集金"].map((stage, index) => (
          <section className={`stage stage-${index + 1} ${activeStage === stage ? "active" : ""}`} key={stage}>
            <button type="button" className="stage-trigger" aria-expanded={activeStage === stage}
              aria-controls={`stage-body-${index + 1}`}
              onClick={() => moveTo(activeStage === stage ? null : stage === "注文" ? lastPurpose : stage)}>
              <span className="stage-number">{["①", "②", "③", "④"][index]}</span>
              <span>{stage}</span>
              <span className="stage-chevron" aria-hidden="true">{activeStage === stage ? "⌄" : "›"}</span>
            </button>
            {activeStage === stage && <div className="stage-content" id={`stage-body-${index + 1}`}>
              {stage === "注文" && <>
      {needsMonthlyProducts ? (
        <section className="monthly-import-callout">
          <div>
            <strong>{monthLabel}の商品を準備する</strong>
            <small>{monthLabel}の注文票を読み込みます。</small>
          </div>
          <Button onClick={() => setExcelImport(true)}><TaskIcon type="excel"/>{monthLabel}のExcel注文表を取り込む</Button>
        </section>
      ) : <details className="monthly-import-ready">
        <summary>商品情報を更新</summary>
        <Button secondary onClick={() => setExcelImport(true)}>{monthLabel}の商品を更新</Button>
      </details>}
              <div className="purpose-grid" role="group" aria-label="注文の用途を選ぶ">
                {PURPOSES.map((label) => (
                  <button type="button" key={label} data-purpose={label}
                    className={`purpose ${tab === label ? "selected" : ""}`}
                    aria-pressed={tab === label}
                    onClick={() => moveTo(label)}>
                    <TaskIcon type={{"個人注文":"buyer","販売用":"basket","おやつ用":"bread"}[label]}/>
                    <span>{label}</span>
                  </button>
                ))}
              </div></>}
      {tab==='販売用'&&<Sales roundId={r.id} phase="order" onManageProducts={() => setProducts(true)}/>}
      {tab==='おやつ用'&&<Events roundId={r.id} phase="order" onManageProducts={() => setProducts(true)}/>}
      {tab === "個人注文" && (
        <>
          <section className="personal-start">
          <div className="section-head">
              <h2>購入者ごとの注文</h2>
            <div className="compact-actions">
              <Button secondary onClick={()=>setLineImport(true)}>注文を貼り付け</Button>
              <button type="button" className="text-action" onClick={() => setProducts(true)}>＋ 商品が見つからない場合</button>
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
                onChange={(quantities) => setDraft({ ...draft, quantities,
                  cutQuantities: Object.fromEntries(Object.entries(draft.cutQuantities || {}).map(([id, qty]) => [id, Math.min(qty, quantities[id] || 0)])) })}
                cutQuantities={draft.cutQuantities || {}}
                onCutChange={cutQuantities => setDraft({...draft,cutQuantities})}
                cutFees={cutFees}
                onCutFeeChange={(id,value) => setCutFees({...cutFees,[id]:value})}
                startCollapsed
                emptyMessage="「この納品日の商品」から、販売価格が分かっている商品を追加してください。"
              />
              <div className="sticky-action">
                <span>
                  合計 <strong>{yen(orderAmount({...r,products:r.products.map(p=>({...p,cutFee:cutFees[p.id]}))}, draft))}</strong>
                </span>
                <Button
                  disabled={r.products.some(p => draft.cutQuantities?.[p.id] > 0 && cutFees[p.id] == null)}
                  onClick={async () => {
                    if (
                      await save((s) => {
                        const round = s.rounds.find((x) => x.id === r.id);
                        for (const p of round.products) if (draft.cutQuantities?.[p.id] > 0 && cutFees[p.id] != null) {
                          p.cutFee = cutFees[p.id];
                          const master=s.products.find(x=>x.id===p.id);
                          if(master) master.cutFee=cutFees[p.id];
                        }
                        if (round.shortages?.length && JSON.stringify(round.orders[buyerId]?.quantities||{}) !== JSON.stringify(draft.quantities)) throw Error('欠品配分後は元の注文数を変更できません。欠品配分を修正してください');
                        round.orders[buyerId] = draft;
                      }, `${currentBuyer.name}の注文を保存`)
                    ) {
                        setLastSavedBuyer(buyerId);
                        setDraft(null);
                        setBuyerId(null);
                        requestAnimationFrame(() => document.querySelector('.personal-saved[open]')?.scrollIntoView({block:'nearest'}));
                    }
                  }}
                >
                  保存して次の購入者へ
                </Button>
              </div>
            </section>
          )}
          {Object.keys(r.orders).length > 0 && <h3 className="saved-list-heading">今回の注文</h3>}
          {Object.entries(r.orders).map(([id, o]) => (
            <details className="personal-saved" key={`${id}-${id === lastSavedBuyer ? 'saved' : 'other'}`}
              open={id === lastSavedBuyer || undefined}>
              <summary className="completed-buyer">
                <span className="completed-buyer-name">{state.buyers.find((b) => b.id === id)?.name || o.name}</span>
                <strong>{yen(orderAmount(r, o))}</strong>
              </summary>
              <div className="saved-order-lines" aria-label={`${o.name}の注文内容`}>
                {r.products.filter(p => (o.quantities[p.id] || 0) > 0).map(p =>
                  <div className="saved-order-line" key={p.id}><span>{p.name}</span><strong>{o.quantities[p.id]}個</strong></div>)}
                {!r.products.some(p => (o.quantities[p.id] || 0) > 0) && <small>注文商品はありません</small>}
                <button type="button" className="text-action" onClick={() => choose(id)}>注文を編集 ›</button>
              </div>
            </details>
          ))}
        </>
      )}
      {stage === "注文" && PURPOSES.includes(tab) && <div className="purpose-next" aria-label="ほかの注文用途">
        {PURPOSES.map((label,index) =>
          <button type="button" className={`text-action ${label === tab ? 'selected' : ''}`} aria-pressed={label===tab} key={label} onClick={() => moveTo(label)}>{['個人','販売','おやつ'][index]} {label===tab?'✓':'›'}</button>)}
      </div>}
      {tab === "集金" && (
        <>
          <div className="collection-total"><span>今回の請求合計{r.reconciliationPending && <small>　照合中</small>}</span>
            <strong>{yen(rows.reduce((a, b) => a + b.total, 0))}</strong></div>
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
          <h2>発注一覧</h2>
          {deliveryTotals(state,r).map((p) => (
            <div className="delivery-total-row" key={p.id}>
              <span>{p.name}</span>
              <span className="delivery-total-quantity"><strong>{p.qty}個</strong><small>{[["個人",p.personal],["販売",p.sales],["おやつ",p.snack]].filter(([,n])=>n>0).map(([name,n])=>`${name}${n}`).join("｜")}</small></span>
              {r.status==='入力中' && <div className="fax-adjust"><small>販売用</small><Qty label={`${p.name} 販売用の最終調整`} value={p.sales} min={salesCutQuantities(state,r.id)[p.id]||0}
                onChange={n=>save(s=>setSalesOrderQuantities(s,r.id,{...salesOrderQuantities(s,r.id),[p.id]:n}),'発注前の販売用数量を調整')}/></div>}
            </div>
          ))}
          {!productTotals(r).length && (
            <Empty>注文を入力すると商品別数量が表示されます。</Empty>
          )}
          <button type="button" className="text-action" onClick={() => moveTo("販売用")}>販売用の数量を変更 ›</button>
          <button type="button" className="text-action"
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
            商品名・数量をコピー ›
          </button>
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
          <h2>納品・精算</h2>
          <Shortage round={r}/>
          {r.shortageConfirmation && <>
          <SetPreparation roundId={r.id}/>
          <Invoice key={`${r.id}-${r.invoice}`} round={r} />

          <details className="after-work"><summary>販売先を割り当てる</summary>
            <Sales roundId={r.id} phase="after"/>
          </details>
          <details className="after-work"><summary>販売場所</summary><Markets roundId={r.id} section="places"/></details>
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
          </>}
        </>
      )}
            </div>}
          </section>
        ))}
      </div>
      {lineImport&&<LineImport round={r} onClose={()=>setLineImport(false)}/>}
      {excelImport&&<ExcelImport targetRoundId={r.id} onClose={()=>setExcelImport(false)}/>}
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
    [stockIds, setStocks] = useState(r.stockIds);
  const preview = { ...r, invoice, eventIds, stockIds },
    ded = invoiceDeductions(state, preview);
  const snackRows = state.events.filter(e => eventIds.includes(e.id));
  const salesRows = state.stocks.filter(st => stockIds.includes(st.id));
  const snackKnown = snackRows.every(e => e.lines.every(line => line.cost != null));
  const salesKnown = salesRows.every(st => st.cost != null);
  const snackCost = snackKnown ? snackRows.reduce((n,e) => n + e.lines.reduce((m,line) => m + receivedQuantity(line) * line.cost,0),0) : null;
  const salesCost = salesKnown ? salesRows.reduce((n,st) => n + receivedQuantity(st) * st.cost,0) : null;
  return (
    <form
      className="invoice-form"
      data-unsaved={
        invoice !== r.invoice ||
        JSON.stringify(eventIds) !== JSON.stringify(r.eventIds) ||
        JSON.stringify(stockIds) !== JSON.stringify(r.stockIds)
      }
      onSubmit={async (e) => {
        e.preventDefault();
        const nextStatus = r.status;
        await save((s) => {
          const round = s.rounds.find((x) => x.id === r.id);
          Object.assign(round, { invoice, eventIds, stockIds, status: nextStatus });
          updateDeliveryStatus(round);
          if (nextStatus !== "入力中")
            round.planned ??= structuredClone(round.orders);
        }, "納品・仕入額を保存");
      }}
    >
      <div className="invoice-input-row"><Money label="税込合計" value={invoice} onChange={setInvoice}/><Button type="submit">保存</Button></div>
      {r.invoice != null && <details><summary>用途別の内訳を見る</summary>
        <div className="cost-overview">個人注文 {yen(roundCost(state, preview))} ／ 販売用 {yen(salesCost)} ／ おやつ用 {yen(snackCost)}</div>
        {snackRows.map(e=><p key={e.id}>おやつ用：{e.name}</p>)}
        {salesRows.map(st=><p key={st.id}>販売用：{st.name} ×{st.qty}</p>)}
        {ded == null && <small>用途別の仕入単価を確認すると精算を完了できます。</small>}
      </details>}
      {r.status === '納品済み' && r.invoice != null && ded != null &&
        <Button secondary onClick={() => save(s => { s.rounds.find(x => x.id === r.id).status = '精算済み'; }, '精算完了')}>精算完了を確認</Button>}
    </form>
  );
}
function RoundSettings({ round: r, onClose, onDeleted }) {
  const { save } = useApp();
  const [date, setDate] = useState(r.date),
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
              Object.assign(round, { date, note });
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
              round.products = faxProducts(items);
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

function SetPreparation({roundId}) {
  const {state}=useApp();
  const [open,setOpen]=useState(state.bundles.some(b=>(b.roundId||state.markets.find(m=>m.id===b.marketId)?.roundId)===roundId));
  return <section className="set-preparation"><div className="line"><h3>セット販売</h3><div className="segmented" role="group" aria-label="セット販売">
    <button type="button" className={!open?'selected':''} onClick={()=>setOpen(false)}>なし</button>
    <button type="button" className={open?'selected':''} onClick={()=>setOpen(true)}>あり</button>
  </div></div>{open&&<Markets roundId={roundId} section="sets"/>}</section>;
}
