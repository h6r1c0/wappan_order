import {billingAudit} from './collection-workflow.js';
import {client} from './store.js';
import {Shortage} from './shortage-ui';
import {receivedQuantity, updateDeliveryStatus} from './shortages';
import React, { useEffect, useState } from "react";
import { deliveryTotals, setSalesOrderQuantities, salesOrderQuantities, salesCutQuantities } from './commerce';
import {LineImport} from './line-import.jsx';
import {Sales} from './sales';
import {RoundCollections} from './collections';
import {Events} from './events';
import {Markets} from './markets';
import {ExcelImport} from './masters';
import {TaskIcon} from './task-icon';
import {PrintPrep} from './print-prep.jsx';
import {productDisplayName} from './product-names.js';
import {
  newRound,
  productAvailable,
  price,
  snapshot,
  orderDraft,
  orderAmount,
  unpricedOrderLines,
  roundRevenue,
  roundCost,
  roundAccounting,
  roundSettlementStatus,
  stockRemaining,
  productTotals,
  collections,
  collectionPosition,
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
            className={`card clickable round-list-item status-${roundSettlementStatus(state,r)}`}
            key={r.id}
            onClick={() => {setJustCreated(false);setId(r.id);}}
          >
            <div className="line">
              <h2>{r.date.replaceAll("-", "/")} 着</h2>
              <Tag status={roundSettlementStatus(state,r)}>{roundSettlementStatus(state,r)}</Tag>
            </div>
            {r.test && <Tag status="テスト">テスト・年度集計対象外</Tag>}
            <small className="round-next-step">{r.status==='入力中'?'注文を入力':!r.shortageConfirmation?'次は欠品・納品確認':roundSettlementStatus(state,r)==='納品済み'?'仕入・販売を確認':state.buyers.filter(b=>collectionPosition(state,r.id,b.id).balance>0).length?`集金が残っています：${state.buyers.filter(b=>collectionPosition(state,r.id,b.id).balance>0).length}人`:'集金状況を確認'}</small>
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
  const { state, save, notify, revision } = useApp();
  const [recent,setRecent]=useState(null);
  useEffect(()=>{
    let active=true;
    client?.rpc('wappan_round_activity',{target_round:r.id,max_items:5}).then(({data,error})=>{
      if(active)setRecent(error?[]:data||[]);
    });
    return()=>{active=false;};
  },[r.id,revision]);
  const [collectionSessions,setCollectionSessions]=useState({}),[collectionReturn,setCollectionReturn]=useState('');
  const [tab, setTab] = useState(initialTab),
    [returnStage, setReturnStage] = useState(null),
    [adjustProduct, setAdjustProduct] = useState(null),
    [adjustQty, setAdjustQty] = useState(0),
    [lastPurpose, setLastPurpose] = useState("個人注文"),
    [lastSavedBuyer, setLastSavedBuyer] = useState(null),
    [buyerId, setBuyerId] = useState(null),
    [draft, setDraft] = useState(null),
    [cutFees, setCutFees] = useState(() => Object.fromEntries(r.products.map(p => [p.id, p.cutFee ?? null]))),
    [personalClosed,setPersonalClosed] = useState(r.status!=='入力中'),
    [settings, setSettings] = useState(false),
    [products, setProducts] = useState(false), [lineImport,setLineImport]=useState(false), [excelImport,setExcelImport]=useState(false);
  useEffect(()=>{if(r.status!=='入力中')setPersonalClosed(true);},[r.status]);
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
  const finances = roundAccounting(state,r);
  const sales = state.sales.filter(x=>!x.void&&r.stockIds.some(id=>id===x.stockId));
  const buyerSales = sales.filter(x=>x.destinationType==='buyer').reduce((n,x)=>n+x.qty*x.price,0);
  const paidSales = sales.filter(x=>x.destinationType!=='buyer'&&x.paymentStatus==='paid').reduce((n,x)=>n+x.qty*x.price,0);
  const otherSales = finances.onsite-buyerSales-paidSales;
  const stockCostIssues=finances.profit==null?r.stockIds.map(id=>state.stocks.find(st=>st.id===id)).filter(st=>!st||stockRemaining(state,st)>0&&st.cost==null):[];
  const eventCostIssues=finances.profit==null?r.eventIds.map(id=>state.events.find(e=>e.id===id)).filter(e=>e&&e.lines.some(l=>receivedQuantity(l)>0&&l.cost==null)):[];
  const profitIssues=[
    ...(r.invoice==null?['納品書の税込合計が未入力']:[]),
    ...stockCostIssues.map(st=>`${st?.name||'販売用商品'}の未販売分の仕入単価が未確認`),
    ...eventCostIssues.map(e=>`${e.name}の仕入単価が未確認`),
    ...(finances.profit==null&&r.invoice!=null&&!stockCostIssues.length&&!eventCostIssues.length?['販売日が異なる商品や振替の原価内訳を確認してください']:[]),
  ];
  const needsMonthlyProducts = r.productImportPending && !monthProductsImported(state, r.date);
  const monthLabel = `${Number(r.date.slice(5, 7))}月`;
  const activeStage = PURPOSES.includes(tab) ? "注文" : tab;
  const moveTo = (next) => {
    if(next!==tab&&document.querySelector('.sales-workspace[data-unsaved="true"]')&&!confirm('未保存の販売先・数量があります。入力を閉じて別の工程へ移動しますか？'))return;
    if (draft && JSON.stringify(draft) !== JSON.stringify(orderDraft(state, r, currentBuyer)) &&
      !confirm("未保存の個人注文を閉じますか？")) return;
    if (draft && next !== '個人注文') { setDraft(null); setBuyerId(null); }
    if (activeStage === '発注' && next === '販売用') setReturnStage('発注');
    else if (next === '発注') setReturnStage(null);
    setTab(next);
    if (next) requestAnimationFrame(() => document.querySelector('.stage.active > .stage-trigger')?.scrollIntoView({block:'start',behavior:'smooth'}));
    if (PURPOSES.includes(next)) setLastPurpose(next);
  };
  return (
    <>
      <button type="button" className="text-action back-link"
        onClick={() => {
          if (
            draft && currentBuyer &&
            JSON.stringify(draft)!==JSON.stringify(orderDraft(state,r,currentBuyer)) &&
            !confirm("個人注文を閉じますか？未保存の数量変更は失われます。")
          )
            return;
          back();
        }}
      >
        ‹ 注文一覧へ
      </button>
      {collectionReturn&&tab!=='集金'&&<button type="button" className="text-action return-context" onClick={()=>moveTo('集金')}>元の集金へ戻る（受取額を保持）</button>}
      <div className="delivery-heading">
        <div><span className="eyebrow">納品予定日</span><h1>{r.date.replaceAll("-", "/")} 着</h1></div>
        <Button secondary onClick={() => setSettings(true)}>
          詳細
        </Button>
      </div>
      <p>
        <Tag status={roundSettlementStatus(state,r)}>{roundSettlementStatus(state,r)}</Tag> {r.test && <Tag status="テスト">テスト・集計対象外</Tag>}
      </p>
      <details className="round-activity"><summary>最近の操作{recent?.length?`（${recent.length}件）`:''}</summary>
        {recent===null?<small>読み込み中…</small>:recent.length?recent.map(x=><div className="round-activity-row" key={x.revision}>
          <span>{x.description}<small>{new Date(x.updated_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ ログイン：{x.actor_account}</small></span>
        </div>):<small>この注文回の保存履歴はありません。</small>}
      </details>
      {r.note && <details className="round-note"><summary>この注文回のメモ</summary><p>{r.note}</p></details>}
      <div className="stage-list" aria-label="注文の工程">
        {["注文", "発注", "納品・精算", "集金"].map((stage, index) => (
          <section className={`stage stage-${index + 1} ${activeStage === stage ? "active" : ""}`} key={stage}>
            <button type="button" className="stage-trigger" aria-expanded={activeStage === stage}
              aria-controls={`stage-body-${index + 1}`}
              onClick={() => moveTo(activeStage === stage ? null : stage === "注文" ? lastPurpose : stage)}>
              <span className="stage-number">{String(index + 1).padStart(2, '0')}</span>
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
                    <span>{label}</span>
                  </button>
                ))}
              </div></>}
      {tab==='販売用'&&<>{returnStage === '発注' && <button type="button" className="text-action return-context" onClick={() => moveTo('発注')}>‹ 発注一覧へ戻る</button>}
        <Sales roundId={r.id} phase="order" onManageProducts={() => setProducts(true)}/>
        {returnStage === '発注' && <button type="button" className="text-action return-context" onClick={() => moveTo('発注')}>‹ 発注一覧へ戻る</button>}</>}
      {tab==='おやつ用'&&<Events roundId={r.id} phase="order" onManageProducts={() => setProducts(true)}/>}
      {tab === "個人注文" && (
        <>
          {personalClosed&&<button type="button" className="text-action" onClick={()=>setPersonalClosed(false)}>注文を編集 ›</button>}
          {!personalClosed&&<>
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
            <section className="card order-editor" data-unsaved={JSON.stringify(draft)!==JSON.stringify(orderDraft(state,r,currentBuyer))}>
              <h2>{currentBuyer?.name}さんの注文</h2>
              {currentBuyer?.fixed.some(
                (f) => !r.products.some((p) => p.id === f.productId),
              ) && (
                <p className="notice">
                  固定注文のうち、この回にない商品があります。「この納品日の商品」で追加してください。価格未確認の商品は先に商品管理で価格を設定してください。
                </p>
              )}
              {unpricedOrderLines(r,draft).length>0 &&
                <p className="notice compact-notice">⚠ 販売価格未確認：{unpricedOrderLines(r,draft).map(x=>`${x.name} ×${x.qty}`).join('、')}。商品は注文に残し、請求額は価格確定まで未確定です。</p>}
              <ProductQuantityEditor
                products={r.products}
                quantities={draft.quantities}
                onChange={(quantities) => setDraft({ ...draft, quantities,
                  cutQuantities: Object.fromEntries(Object.entries(draft.cutQuantities || {}).map(([id, qty]) => [id, Math.min(qty, quantities[id] || 0)])) })}
                startCollapsed
                emptyMessage="「この納品日の商品」から、販売価格が分かっている商品を追加してください。"
              />
              <div className="sticky-action">
                <span>
                  {unpricedOrderLines(r,draft).length?'判明分の小計（請求未確定）':'合計'} <strong>{yen(orderAmount({...r,products:r.products.map(p=>({...p,cutFee:cutFees[p.id]}))}, draft))}</strong>
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
          </>}
          {Object.keys(r.orders).length > 0 && <h3 className="saved-list-heading">今回の注文</h3>}
          {Object.entries(r.orders).map(([id, o]) => (
            <details className="personal-saved" key={`${id}-${id === lastSavedBuyer ? 'saved' : 'other'}`}
              open={id === lastSavedBuyer || undefined}>
              <summary className="completed-buyer">
                <span className="completed-buyer-name">{state.buyers.find((b) => b.id === id)?.name || o.name}</span>
                <strong>{unpricedOrderLines(r,o).length?'請求総額 未確定':yen(orderAmount(r, o))}</strong>
              </summary>
              <div className="saved-order-lines" aria-label={`${o.name}の注文内容`}>
                {r.products.filter(p => (o.quantities[p.id] || 0) > 0).map(p =>
                  <div className="saved-order-line" key={p.id}><span>{productDisplayName(p.name)}</span><strong>{o.quantities[p.id]}個</strong></div>)}
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
          <div className="collection-total"><span>{rows.some(x=>x.unpriced.length)?'判明分の小計・請求未確定':'今回の請求合計'}</span>
            <strong>{yen(rows.reduce((a, b) => a + b.total, 0))}</strong></div>
          <RoundCollections round={r} rows={rows} sessions={collectionSessions} initialFocus={collectionReturn}
            onDraft={(id,draft)=>setCollectionSessions(s=>({...s,[id]:draft}))}
            onSource={(kind,id)=>{
              setCollectionReturn(id);
              if(kind==='order'){setTab('個人注文');setPersonalClosed(false);choose(id);}
              else{setTab('納品・精算');requestAnimationFrame(()=>{for(const d of document.querySelectorAll('.after-work'))if(d.querySelector('summary')?.textContent==='販売先を割り当てる')d.open=true;});}
            }}/>
          <button type="button" className="text-action"
            onClick={async () => {
              try {
                if(billingAudit(state,r.id).issues.length){notify('請求の未確定・案内額との差があります。集金前の確認から該当商品を確認してください。');document.querySelector('.billing-audit')?.scrollIntoView({block:'start'});return;}
                await copyText(
                  (r.reconciliationPending || rows.some(x=>x.unpriced.length) ? "照合用・未確定（未確認価格・販売用商品の個人割当を含まない）\n" : "") + rows.map((x) => `${x.name}　${x.unpriced.length?'請求総額 未確定':yen(x.total)}`).join("\n"),
                );
                notify("購入者別の請求額をコピーしました");
              } catch (e) {
                notify(e.message);
              }
            }}
          >
            購入者別の請求額をコピー ›
          </button>
        </>
      )}
      {tab === "発注" && (
        <>
          <h2>発注一覧</h2>
          {deliveryTotals(state,r).map((p) => (
            <div className="delivery-total-row" key={p.id}>
              <span className="delivery-name">{productDisplayName(p.name)}</span>
              <span className="delivery-parts">{[["個人",p.personal],["販売",p.sales],["おやつ",p.snack]].filter(([,n])=>n>0).map(([name,n])=>`${name}${n}`).join("｜")}</span>
              <strong className="delivery-amount">{p.qty}個</strong>
              {r.status==='入力中' && <div className="fax-adjust">{adjustProduct===p.id ? <>
                <Qty label={`${p.name} 販売用の最終調整`} value={adjustQty} min={salesCutQuantities(state,r.id)[p.id]||0} onChange={setAdjustQty}/>
                <Button onClick={async()=>{if(await save(s=>setSalesOrderQuantities(s,r.id,{...salesOrderQuantities(s,r.id),[p.id]:adjustQty}),'発注前の販売用数量を調整'))setAdjustProduct(null);}}>保存</Button>
                <button type="button" className="text-action" onClick={()=>setAdjustProduct(null)}>取消</button>
              </> : <button type="button" className="text-action" onClick={()=>{setAdjustProduct(p.id);setAdjustQty(p.sales);}}>販売{p.sales}を調整 ›</button>}</div>}
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
          <PrintPrep state={state} round={r}/>
          <Shortage round={r}/>
          {r.shortageConfirmation && <>
          <SetPreparation roundId={r.id}/>
          <Invoice key={`${r.id}-${r.invoice}`} round={r} />

          <details className="after-work" id="sales-after-work"><summary>販売先を割り当てる</summary>
            <Sales roundId={r.id} phase="after"/>
          </details>
          <details className="after-work"><summary>販売場所</summary><Markets roundId={r.id} section="places"/></details>
          <details className="after-work" id="snack-after-work"><summary>おやつ使用・財政請求</summary>
            <Events roundId={r.id} phase="after"/>
          </details>
          <details className="after-work round-profit"><summary>商品利益{roundSettlementStatus(state,r)==='精算済み'?'':'（見込み）'} {yen(finances.profit)}</summary>
            <div className="grid2"><Summary label="売上合計" value={yen(finances.revenue)} />
              <Summary label="納品書の仕入額" value={yen(r.invoice)} /></div>
            {finances.profit!=null&&<p className="profit-result">商品利益 {yen(finances.profit)}{finances.method==='invoice'&&<small>納品書総額から計算。商品別の原価内訳は未確定のままです。</small>}</p>}
            <details className="profit-breakdown"><summary>売上の内訳</summary>
              <div className="line"><span>個人注文</span><strong>{yen(finances.personal)}</strong></div>
              <div className="line"><span>販売用を購入者へ請求</span><strong>{yen(buyerSales)}</strong></div>
              <div className="line"><span>販売済み・支払済み（個人請求外）</span><strong>{yen(paidSales)}</strong></div>
              {otherSales>0&&<div className="line"><span>販売先・支払未確認</span><strong>{yen(otherSales)}</strong></div>}
              <small>請求・現金受取・年度実績は別に管理します。販売待ちの在庫は売上に含みません。</small>
            </details>
            {profitIssues.length>0&&<div className="profit-issues"><strong>確認する項目</strong>{profitIssues.map((issue,i)=><p key={i}>{issue}</p>)}
              {r.invoice==null&&<button type="button" className="text-action" onClick={()=>document.querySelector('.invoice-input-row input')?.focus()}>納品書の税込合計を入力 ›</button>}
              {stockCostIssues.length>0&&<button type="button" className="text-action" onClick={()=>{const el=document.getElementById('sales-after-work');el.open=true;requestAnimationFrame(()=>el.scrollIntoView({block:'start'}));}}>販売用の仕入単価を確認 ›</button>}
              {eventCostIssues.length>0&&<button type="button" className="text-action" onClick={()=>{const el=document.getElementById('snack-after-work');el.open=true;requestAnimationFrame(()=>el.scrollIntoView({block:'start'}));}}>おやつ用の仕入単価を確認 ›</button>}
              <small>金額がまだ分からなくても、ほかの作業は続けられます。</small></div>}
          </details>
          {r.planned && r.products.some((p) => Object.values(r.planned).some(o=>Object.hasOwn(o.quantities||{},p.id)) && (productTotals(r, r.planned).find((x) => x.id === p.id)?.qty||0)!==(productTotals(r).find((x) => x.id === p.id)?.qty||0)) && (
            <details>
              <summary>発注記録と現在の数量を照合</summary>
              <small>発注時の記録に商品がない場合は、追加注文と断定できません。欠品による実渡し数は欠品確認で扱います。</small>
              {r.products.map((p) => {
                const before =
                    productTotals(r, r.planned).find((x) => x.id === p.id)
                      ?.qty || 0,
                  after = productTotals(r).find((x) => x.id === p.id)?.qty || 0;
                  const recorded=Object.values(r.planned).some(o=>Object.hasOwn(o.quantities||{},p.id));
                  return !recorded||before === after ? null : (
                  <p key={p.id}>
                    {p.name}：{recorded?`${before}個`:'発注時の記録なし'} → 現在 {after}個
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
  const finances = roundAccounting(state, preview);
  const snackRows = state.events.filter(e => eventIds.includes(e.id));
  const salesRows = state.stocks.filter(st => stockIds.includes(st.id));
  const snackKnown = snackRows.every(e => e.lines.every(line => receivedQuantity(line)===0 || line.cost != null));
  const salesKnown = salesRows.every(st => receivedQuantity(st)===0 || st.cost != null);
  const snackCost = snackKnown ? snackRows.reduce((n,e) => n + e.lines.reduce((m,line) => m + receivedQuantity(line) * (line.cost||0),0),0) : null;
  const salesCost = salesKnown ? salesRows.reduce((n,st) => n + receivedQuantity(st) * (st.cost||0),0) : null;
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
      {r.invoice != null && <details><summary>仕入の内訳を見る</summary>
        <div className="cost-overview">個人注文 {yen(roundCost(state, preview))} ／ 販売用 {yen(salesCost)} ／ おやつ用 {yen(snackCost)}</div>
        {snackRows.map(e=><p key={e.id}>おやつ用：{e.name}</p>)}
        {salesRows.map(st=><p key={st.id}>販売用：{st.name} ×{st.qty}</p>)}
        {ded == null && <small>{finances.method==='invoice'?'販売済み分を含む利益は納品書総額から計算できます。商品別原価は内訳が必要なときに確認します。':'用途別の仕入単価が必要な計算は、対象商品の原価を確認してください。'}</small>}
      </details>}
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
            disabled={price(p) == null && !(p.lifecycle === 'permanent' && p.cost != null)}
            onClick={() => setItems([...items, snapshot(p,{snackOnly:true})])}
          >
            ＋ {p.name} {price(p) == null ? "（おやつ用のみ・販売価格未確認）" : yen(price(p))}
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
  const hasSets=state.bundles.some(b=>(b.roundId||state.markets.find(m=>m.id===b.marketId)?.roundId)===roundId);
  return <details className="set-preparation"><summary>セット販売 {hasSets?'（設定あり）':''} ›</summary><Markets roundId={roundId} section="sets"/></details>;
}
