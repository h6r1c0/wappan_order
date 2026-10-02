import React, { useEffect, useRef, useState } from "react";
import { SalesWorkspace } from "./sales-workspace";
import { TaskIcon } from "./task-icon";
import {
  delivery,
  salesOrderQuantities,
  salesCutQuantities,
  setSalesOrderQuantities,
} from './commerce';
import {
  uid,
  today,
  price,
  yen,
  stockRemaining,
  addSale,
  soldQty,
  assignSalesToBuyer,
  assignUnknownSale,
  updateSaleDestination,
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
  Empty,
  BuyerPicker,
  ProductQuantityEditor,
} from "./ui";
const quantitySignature = quantities => JSON.stringify(Object.entries(quantities).filter(([,qty])=>qty>0).sort(([a],[b])=>a.localeCompare(b)));
export function Sales({roundId=null,marketId=null,onManageProducts=null,phase='all'}) {
  const { state, save } = useApp();
  const titleRef = useRef(null);

  const [mode, setMode] = useState(phase === 'order' ? 'order' : null);
  const [inputMode, setInputMode] = useState(null);
  const [edit, setEdit] = useState(null);
  const [selling, setSelling] = useState(null);
  const [batchSelling, setBatchSelling] = useState(false);
  const [unconfirmedOpen, setUnconfirmedOpen] = useState(false);
  const [orderQuantities, setOrderQuantities] = useState(() =>
    roundId ? salesOrderQuantities(state, roundId) : {},
  );
  const [orderCuts, setOrderCuts] = useState(() => roundId ? salesCutQuantities(state, roundId) : {});
  const [cutFees, setCutFees] = useState(() => Object.fromEntries(
    (state.rounds.find(item=>item.id===roundId)?.products||[]).map(product => [product.id,product.cutFee ?? null])));
  const [reviewing, setReviewing] = useState(() => roundId &&
    Object.values(salesOrderQuantities(state, roundId)).some(q => q > 0));
  const [showPersonal, setShowPersonal] = useState(false);
  const round = state.rounds.find((item) => item.id === roundId);
  const savedOrderQuantities = roundId ? salesOrderQuantities(state, roundId) : {};
  const savedCuts = roundId ? salesCutQuantities(state, roundId) : {};
  const stocks = state.stocks.filter(st =>
    (!roundId || st.roundId === roundId) &&
    (!marketId || st.marketId === marketId || st.roundId === roundId)
  );
  const remainingStocks = stocks.filter((stock) => stockRemaining(state, stock) > 0);
  const stockIds = new Set(stocks.map((stock) => stock.id));
  const unconfirmedSales = state.sales.filter((sale) => stockIds.has(sale.stockId) &&
    !sale.void && (sale.pending || sale.destinationType === "unknown"));
  const unconfirmedQty = unconfirmedSales.reduce((n, sale) => n + sale.qty, 0);
  const toggleStep = (key) => {
    if (document.querySelector('.sales-workspace[data-unsaved="true"], .work-section.order-editor[data-unsaved="true"]') &&
      !confirm('未保存の入力があります。画面を閉じますか？')) return;
    setMode(mode === key ? null : key);
    setInputMode(null);
  };
  const step = (key, label) => <button type="button" className={`sales-step ${mode === key ? 'selected' : ''}`}
    onClick={() => toggleStep(key)} aria-expanded={mode === key}>

    <span className="step-label">{label}{key === 'assign' && <small>未割当 {stocks.reduce((n,stock)=>n+stockRemaining(state,stock),0)+unconfirmedQty}個</small>}</span>
    <span className="chevron" aria-hidden="true">{mode === key ? '⌄' : '›'}</span>
  </button>;
  return <>
    {phase === 'all' && <div className="work-title" ref={titleRef}><span className="eyebrow">販売用 {round?.date ? `・${round.date.replaceAll('-', '/')} 着` : ''}</span>
      <h1>販売用の作業</h1></div>}
    <div className="sales-steps">
      {phase === 'all' && step('order', '① 販売用として注文する')}
      {mode === 'order' && !round && <p>納品回を選んでください。</p>}
      {mode === 'order' && round && <section className="work-section order-editor"
        data-unsaved={quantitySignature(orderQuantities) !== quantitySignature(savedOrderQuantities) ||
          quantitySignature(orderCuts) !== quantitySignature(savedCuts)}>
        <h2>{reviewing ? '今回の販売用注文' : '販売用として注文する'}</h2>
        {!reviewing && <>
        <Check label="個人注文数を表示" checked={showPersonal} onChange={setShowPersonal}/>
        <ProductQuantityEditor products={round.products} quantities={orderQuantities}
          onChange={quantities => {setOrderQuantities(quantities);setOrderCuts(Object.fromEntries(
            Object.entries(orderCuts).map(([id,qty])=>[id,Math.min(qty,quantities[id]||0)])));}}
          cutQuantities={orderCuts}
          onCutChange={setOrderCuts}
          cutFees={cutFees}
          onCutFeeChange={(id,value) => setCutFees({...cutFees,[id]:value})}
          secondaryLabel={showPersonal ? product => {
            const count = Object.values(round.orders).reduce((n, order) => n + (order.quantities[product.id] || 0), 0);
            return count ? `個人注文 ${count}個` : null;
          } : null}
          emptyMessage="今月の商品を準備してください。"/>
        <div className="sticky-action"><span>入力数 <strong>{Object.values(orderQuantities).reduce((a,b)=>a+b,0)}個</strong></span>
          <Button disabled={round.products.some(p=>orderCuts[p.id]>0&&cutFees[p.id]==null)} onClick={async () => {
            if (await save((s) => {
              const current=s.rounds.find(item=>item.id===roundId);
              for(const product of current.products) if(orderCuts[product.id]>0&&cutFees[product.id]!=null){
                product.cutFee=cutFees[product.id];
                const master=s.products.find(item=>item.id===product.id);
                if(master)master.cutFee=cutFees[product.id];
              }
              setSalesOrderQuantities(s, roundId, orderQuantities, orderCuts);
            },
              "販売用の注文数量を保存")) setReviewing(true);
          }}>保存</Button></div></>}
        {Object.values(savedOrderQuantities).some(q=>q>0) && <section className="sales-order-summary" aria-label="今回の販売用注文">
          {!reviewing && <h3>保存済みの注文</h3>}
          {round.products.filter(p=>savedOrderQuantities[p.id]>0).map(p=><div className="sales-order-line" key={p.id}><span>{p.name}{savedCuts[p.id]>0&&<small> カット {savedCuts[p.id]}個</small>}</span><strong>{savedOrderQuantities[p.id]}個</strong></div>)}
          <div className="sales-order-total">合計 {Object.values(savedOrderQuantities).reduce((n,q)=>n+q,0)}個</div>
        </section>}
        {reviewing && <Button secondary onClick={() => setReviewing(false)}>数量を編集</Button>}
        {!reviewing && onManageProducts && <Button secondary onClick={onManageProducts}>商品を追加・変更</Button>}
      </section>}
      {phase !== 'order' && step('assign', phase === 'after' ? '売れた商品の販売先を割り当てる' : '② 売れた商品の販売先を割り当てる')}
      {mode === 'assign' && <section className="work-section sales-step-body">
            <h2>入力方法を選ぶ</h2>
            <div className="sales-mode-grid">
              {[["buyer", "購入者から入力"], ["product", "商品から入力"]].map(([input, text]) =>
                <Button key={input} secondary={inputMode !== input} aria-expanded={inputMode === input}
                  onClick={() => {
                    if (document.querySelector('.sales-workspace[data-unsaved="true"]') &&
                      !confirm('未保存の入力があります。切り替えますか？')) return;
                    setInputMode(inputMode === input ? null : input);
                  }}>{text}</Button>)}
            </div>
            {inputMode && <SalesWorkspace key={inputMode} stocks={stocks} roundId={roundId} mode={inputMode}/>}
      </section>}
      {phase !== 'order' && step('history', phase === 'after' ? '残数・販売履歴' : '③ 残数・販売履歴を確認する')}
    </div>
    {mode === 'history' && <section className="work-section history-section">
      <h2>残数・販売履歴</h2>
      {remainingStocks.length > 0 && <Button secondary onClick={() => setBatchSelling(true)}>
        購入者を選んでまとめて販売を記録
      </Button>}
      {stocks.slice().sort((a,b)=>(round?.products.findIndex(p=>p.id===a.productId)??0)-(round?.products.findIndex(p=>p.id===b.productId)??0)).map((st) => {
        const remaining = stockRemaining(state, st);
        return <details className={`stock-card ${remaining<1?'sold-out':''}`} key={st.id}>
          <summary className="product-row"><span className="grow"><strong>{st.name}</strong>
            <small>{yen(st.price)} ／ 注文 {st.qty}個 ／ 販売記録 {soldQty(state,st.id)}個</small></span>
            <strong>残数 {remaining}個</strong></summary>
          <div className="actions"><Button disabled={remaining<1} onClick={() => setSelling(st)}>1商品ずつ販売を記録</Button>
            <Button secondary onClick={() => setEdit(st)}>販売履歴を確認・修正</Button></div>
        </details>;
      })}
      {!stocks.length && <Empty>販売用として注文すると商品が表示されます。</Empty>}
    </section>}
    {batchSelling && <BatchSaleEditor stocks={remainingStocks} roundId={roundId} onClose={() => setBatchSelling(false)}/>}
    {unconfirmedOpen && <UnconfirmedSalesEditor stocks={stocks} roundId={roundId} onClose={() => setUnconfirmedOpen(false)}/>}
    {edit && <StockEditor roundId={roundId} marketId={marketId} stock={edit.id ? edit : null}
      onClose={() => setEdit(null)} onSale={() => { setSelling(edit); setEdit(null); }}/>}
    {selling && <SaleEditor stock={state.stocks.find((s) => s.id === selling.id)} onClose={() => setSelling(null)}/>}
  </>;
}
function UnconfirmedSalesEditor({ stocks, roundId, onClose }) {
  const { state, save } = useApp();
  const [buyerId, setBuyerId] = useState("");
  const [quantities, setQuantities] = useState({});
  const [category, setCategory] = useState("全部");
  const [resolving, setResolving] = useState(null);
  const stockIds = new Set(stocks.map((stock) => stock.id));
  const sales = state.sales.filter(
    (sale) =>
      stockIds.has(sale.stockId) &&
      !sale.void &&
      (sale.pending || sale.destinationType === "unknown"),
  );
  const visibleSales = sales.filter((sale) => {
    const stock = state.stocks.find((item) => item.id === sale.stockId);
    return category === "全部" || stock?.category === category;
  });
  const picked = sales
    .map((sale) => ({ sale, qty: quantities[sale.id] || 0 }))
    .filter((row) => row.qty > 0);
  const total = picked.reduce((sum, row) => sum + row.qty * row.sale.price, 0);
  const buyerName = state.buyers.find((buyer) => buyer.id === buyerId)?.name;
  const toggle = (sale, checked) => setQuantities((current) => {
    const next = { ...current };
    if (checked) next[sale.id] = current[sale.id] || 1;
    else delete next[sale.id];
    return next;
  });
  const changeQuantity = (sale, quantity) => setQuantities((current) => ({
    ...current,
    [sale.id]: Math.max(1, Math.min(sale.qty, quantity)),
  }));
  const remainingCount = sales.reduce((sum, sale) => sum + sale.qty, 0);
  return (
    <Modal title={`販売先未確認 ${remainingCount}個`} onClose={onClose}>
      {sales.length ? (
        <>
          <div className="task-heading compact">
            <span>1</span>
            <div><h3>購入者を選ぶ</h3><small>選んだ記録をこの人の集金額へ追加</small></div>
          </div>
          <BuyerPicker
            value={buyerId}
            includeTest={stocks.some((stock) => stock.test)}
            onChange={setBuyerId}
          />
          <div className="task-heading compact">
            <span>2</span>
            <div><h3>この人が買った商品と数量</h3><small>1個から、未確認の残り数量まで割り当てられます</small></div>
          </div>
          <div className="tabs category-tabs" aria-label="未確認商品を絞り込む">
            {["全部", "パン", "焼き菓子"].map((value) => <Button key={value} secondary={category !== value} onClick={() => setCategory(value)}>{value}</Button>)}
          </div>
          <div className="unconfirmed-list">
            {visibleSales.map((sale) => {
              const stock = state.stocks.find((item) => item.id === sale.stockId);
              const quantity = quantities[sale.id] || 0;
              return (
                <div className={`sale-pick-card ${quantity ? "selected" : ""}`} key={sale.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={quantity > 0}
                      onChange={(event) => toggle(sale, event.target.checked)}
                    />
                    <span>
                      <strong>{stock?.name || "商品不明"}</strong>
                      <small>未確認 {sale.qty}個 ／ {yen(sale.qty * sale.price)} ／ {sale.date}</small>
                    </span>
                  </label>
                  {quantity > 0 && <div className="quantity-stepper" aria-label={`${stock?.name || "商品"} 割り当て数量`}>
                    <Button secondary aria-label={`${stock?.name || "商品"} 割り当て数量を減らす`} disabled={quantity <= 1} onClick={() => changeQuantity(sale, quantity - 1)}>−</Button>
                    <strong>{quantity}</strong>
                    <Button secondary aria-label={`${stock?.name || "商品"} 割り当て数量を増やす`} disabled={quantity >= sale.qty} onClick={() => changeQuantity(sale, quantity + 1)}>＋</Button>
                  </div>}
                  <Button secondary onClick={() => setResolving(sale)}>
                    全数を個別に設定
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="sticky-action">
            <span>{picked.length}商品・{picked.reduce((sum, row) => sum + row.qty, 0)}個 ／ <strong>{yen(total)}</strong></span>
            <Button
              disabled={!buyerId || !picked.length}
              onClick={async () => {
                const completedAll = picked.length === sales.length && picked.every((row) => row.qty === row.sale.qty);
                if (
                  await save(
                    (next) =>
                      assignSalesToBuyer(
                        next,
                        picked.map((row) => ({ saleId: row.sale.id, qty: row.qty })),
                        buyerId,
                        roundId,
                      ),
                    "未確認販売を購入者へまとめて割り当て",
                  )
                ) {
                  setQuantities({});
                  if (completedAll) onClose();
                }
              }}
            >
              選んだ商品を{buyerName ? `${buyerName}に` : "購入者に"}割り当て
            </Button>
          </div>
        </>
      ) : (
        <Empty>販売先未確認の記録はありません。</Empty>
      )}
      {resolving && (
        <SaleResolution sale={resolving} onClose={() => setResolving(null)} />
      )}
    </Modal>
  );
}
function BatchSaleEditor({stocks,roundId,onClose}) {
  const {state,save}=useApp();
  const [buyerId,setBuyerId]=useState("");
  const [quantities,setQuantities]=useState({});
  const [date,setDate]=useState(today());
  const products=stocks.map((stock)=>({
    id:stock.id,
    name:stock.name,
    category:stock.category,
    price:stock.price,
  }));
  const picked=stocks.filter((stock)=>(quantities[stock.id]||0)>0);
  const total=picked.reduce((sum,stock)=>sum+(quantities[stock.id]||0)*stock.price,0);
  return (
    <Modal title="購入者を選んでまとめて販売" onClose={onClose}>
      <div className="task-heading compact">
        <span>1</span><div><h3>購入者を選ぶ</h3><small>個人別集金額へ追加します</small></div>
      </div>
      <BuyerPicker
        value={buyerId}
        includeTest={stocks.some((stock)=>stock.test)}
        onChange={setBuyerId}
      />
      <div className="task-heading compact">
        <span>2</span><div><h3>売れた商品と数量</h3><small>同じ画面で続けて選べます</small></div>
      </div>
      <ProductQuantityEditor
        products={products}
        quantities={quantities}
        onChange={setQuantities}
        priceLabel={(product)=>{
          const stock=stocks.find((item)=>item.id===product.id);
          return `${yen(product.price)} ／ 残り${stockRemaining(state,stock)}個`;
        }}
      />
      <Field label="販売日">
        <input type="date" value={date} onChange={(event)=>setDate(event.target.value)} />
      </Field>
      <div className="sticky-action">
        <span>{picked.length}商品 ／ <strong>{yen(total)}</strong></span>
        <Button
          disabled={!buyerId||!picked.length}
          onClick={async()=>{
            if(await save((next)=>{
              for(const stock of picked){
                const current=next.stocks.find((item)=>item.id===stock.id);
                addSale(next,current,{
                  date,
                  qty:quantities[stock.id],
                  destinationType:"buyer",
                  paymentStatus:"later",
                  destinationName:"",
                  buyerId,
                  chargeRoundId:roundId||current.roundId||null,
                  price:current.price,
                  marketId:null,
                  salePlace:"園内",
                  note:"",
                });
              }
            },"購入者への複数商品の販売を記録")) onClose();
          }}
        >
          まとめて販売を記録
        </Button>
      </div>
    </Modal>
  );
}
export function StockEditor({ stock, onClose,roundId=null,marketId=null }) {
  const { state, save } = useApp();
  const [resolve,setResolve]=useState(null);
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
          date: state.rounds.find(r=>r.id===roundId)?.date||today(),
          test: state.rounds.find(r=>r.id===roundId)?.test||false,
          note: "",
          eventId: null,
          eventLineId: null,
          roundId,
          marketId,
          channel: 'sales', depth:0,
        },
  );
  const put = (k, v) => set({ ...st, [k]: v });
  const sold = stock ? soldQty(state, stock.id) : 0,
    locked = stock && state.sales.some((x) => x.stockId === stock.id);
  return (
    <Modal
      title={stock ? `${stock.name}の数量・販売履歴` : "販売用商品を追加"}
      onClose={onClose}
    >
      {stock && (
        <StockSaleHistory
          stock={stock}
          sold={sold}
          onResolve={setResolve}
        />
      )}
      <details className="stock-settings" open={!stock}>
        {stock && <summary>商品情報・数量・仕入単価を編集</summary>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await save((s) => {
              st.roundId ||= delivery(s,st.date,st.test).id;
              st.test=s.rounds.find(r=>r.id===st.roundId).test;
              if (stock?.cost == null && st.cost != null) {
                for (const sale of s.sales.filter(x => x.stockId === st.id && x.cost == null)) sale.cost = st.cost;
              }
              if (stock)
                s.stocks[s.stocks.findIndex((x) => x.id === st.id)] = st;
              else s.stocks.push(st);
            }, "販売用商品を保存")
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
            おやつ余剰から振替：{st.qty}個 ／ 仕入単価 {yen(st.cost)}
            <br />
            数量・仕入単価は振替元に連動するため、ここでは変更しません。
          </p>
        ) : (
          <>
            <Field label="入荷した総数量（販売済みを含む）">
              <Qty value={st.qty} onChange={(v) => put("qty", v)} />
            </Field>
            <Money
              label="仕入単価（不明なら空欄・利益は未確定）"
              value={st.cost}
              onChange={(v) => put("cost", v)}
            />
          </>
        )}
        {locked ? (
          <p>
            販売価格 {yen(st.price)} ／ 仕入単価 {yen(st.cost)}
            （確認済み単価は販売履歴に保持。不明だった仕入単価の追加入力は販売記録にも反映）
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
        {!st.eventId && !st.roundId && <Check
            label="テスト入力・年度集計から除外"
            checked={st.test}
            onChange={(v) => put("test", v)}
          />}
        <Button type="submit">商品を保存</Button>
      </form>
      </details>
      {resolve&&<SaleResolution sale={resolve} onClose={()=>setResolve(null)}/>}
    </Modal>
  );
}
function StockSaleHistory({ stock, sold, onResolve }) {
  const { state, save } = useApp();
  const sales = state.sales.filter((sale) => sale.stockId === stock.id);
  return (
    <section className="stock-history-first">
      <h3>販売履歴（販売済み {sold}個／残り {stockRemaining(state, stock)}個）</h3>
      {sales.map((sale) => {
        const unconfirmed = sale.destinationType === "unknown" || sale.pending;
        return (
          <div className={`card sale-history-row ${unconfirmed ? "unconfirmed" : ""}`} key={sale.id}>
            <div className="line">
              <span><strong>{sale.buyerName}</strong><small>{stock.name}</small></span>
              <span>{sale.qty}個 ／ {yen(sale.qty * sale.price)}</span>
            </div>
            <small>
              {sale.date} ／ {unconfirmed
                ? "販売先・支払方法未確認（請求に含めない）"
                : sale.destinationType === "external"
                  ? `外部販売・${sale.paymentStatus === "paid" ? "入金済み" : "入金未確認"}`
                  : "個人請求"}{sale.void ? " ／ 取消済み" : ""}
            </small>
            {sale.note && <p>{sale.note}</p>}
            {!sale.void && (
              <div className="actions">
                <Button onClick={() => onResolve(sale)}>
                  {unconfirmed ? "購入者を設定" : "販売先・支払を変更"}
                </Button>
                <Button
                  secondary
                  danger
                  onClick={async () => {
                    if (
                      confirm("この販売記録を取り消して、残数と請求額を戻しますか？")
                    ) {
                      await save((next) => {
                        next.sales.find((item) => item.id === sale.id).void = true;
                      }, "販売記録を取消");
                    }
                  }}
                >
                  誤入力を取り消す
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
function SaleResolution({sale,onClose}){
 const {state,save}=useApp();const stock=state.stocks.find(st=>st.id===sale.stockId);
 const [v,set]=useState({destinationType:sale.destinationType||(sale.pending?'unknown':sale.paid?'external':'buyer'),paymentStatus:sale.paymentStatus||(sale.pending?'unconfirmed':sale.paid?'paid':'later'),destinationName:sale.destinationName||(sale.destinationType==='external'?sale.buyerName:''),buyerId:sale.buyerId||'',chargeRoundId:sale.chargeRoundId||stock.roundId});
 return <Modal title="販売先・支払状態を確認" onClose={onClose}><div className="sale-resolution-summary"><strong>{stock.name} ×{sale.qty}</strong><span>{yen(sale.qty*sale.price)}</span></div><div className="choice-grid"><Button secondary={v.destinationType!=='buyer'} onClick={()=>set({...v,destinationType:'buyer',paymentStatus:'later'})}>登録済み購入者</Button><Button secondary={v.destinationType!=='external'} onClick={()=>set({...v,destinationType:'external',paymentStatus:'unconfirmed'})}>外部販売</Button><Button secondary={v.destinationType!=='unknown'} onClick={()=>set({...v,destinationType:'unknown',paymentStatus:'unconfirmed'})}>販売先未確認</Button></div>{v.destinationType==='buyer'&&<BuyerPicker includeTest={stock.test} value={v.buyerId} onChange={buyerId=>set({...v,buyerId})}/>} {v.destinationType==='external'&&<><Field label="外部販売先・団体・マルシェ名"><input list="external-destinations-resolve" value={v.destinationName} onChange={e=>set({...v,destinationName:e.target.value})}/></Field><datalist id="external-destinations-resolve">{state.externalDestinations.map(x=><option key={x} value={x}/>)}</datalist><div className="choice-grid"><Button secondary={v.paymentStatus!=='paid'} onClick={()=>set({...v,paymentStatus:'paid'})}>入金済み</Button><Button secondary={v.paymentStatus!=='unconfirmed'} onClick={()=>set({...v,paymentStatus:'unconfirmed'})}>入金未確認</Button></div></>}<Button disabled={v.destinationType==='buyer'&&!v.buyerId} onClick={async()=>{if(await save(s=>updateSaleDestination(s,sale.id,v),'販売先・支払状態を更新'))onClose();}}>確認内容を保存</Button></Modal>;
}
export function SaleEditor({ stock, onClose }) {
  const { state, save } = useApp();
  const defaultRound =
    state.rounds.find((r) => r.stockIds.includes(stock.id)) ||
    state.rounds.find(
      (r) => stock.eventId && r.eventIds.includes(stock.eventId),
    );
  const market=state.markets.find(m=>m.id===stock.marketId);
  const [entry, set] = useState({
    date: today(),
    qty: 1,
    destinationType: 'buyer',
    paymentStatus: 'later',
    destinationName: '',
    buyerId: "",
    chargeRoundId: defaultRound?.id || null,
    price: stock.price,
    marketId: market?.id || null,
    salePlace: market?.name || "園内",
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
      <Money label="1個の販売価格（この販売だけ）" required value={entry.price} onChange={v=>put('price',v)}/>
      <Field
        label="販売日"
        type="date"
        value={entry.date}
        onChange={(e) => put("date", e.target.value)}
      />
      <Field label="販売場所（任意）">
        <input list="sale-places" value={entry.salePlace || ""} placeholder="未指定でも登録できます" onChange={e=>{const m=state.markets.find(m=>m.name===e.target.value&&m.roundId===stock.roundId);set({...entry,salePlace:e.target.value,marketId:m?.id||null});}} />
      </Field>
      <datalist id="sale-places">
        {["園内","運動会","親子リズム","手話タイム",...state.markets.filter(m=>m.roundId===stock.roundId).map(m=>m.name)].filter((x,i,a)=>a.indexOf(x)===i).map(x=><option value={x} key={x}/>) }
      </datalist>
      <h3>販売先</h3><div className="choice-grid">
        <Button secondary={entry.destinationType!=='buyer'} onClick={() => set({...entry,destinationType:'buyer',paymentStatus:'later'})}>登録済み購入者</Button>
        <Button secondary={entry.destinationType!=='external'} onClick={() => set({...entry,destinationType:'external',paymentStatus:entry.paymentStatus==='paid'?'paid':'unconfirmed'})}>外部販売</Button>
        <Button secondary={entry.destinationType!=='unknown'} onClick={() => set({...entry,destinationType:'unknown',paymentStatus:'unconfirmed',buyerId:'',destinationName:''})}>販売先未確認</Button>
      </div>
      {entry.destinationType==='buyer' && (
        <>
          <h3>購入者を選ぶ（個人請求へ追加）</h3>
          <BuyerPicker
            includeTest={stock.test}
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
      {entry.destinationType==='external'&&<><Field label="外部販売先・団体・マルシェ名"><input required list="external-destinations" value={entry.destinationName} onChange={e=>put('destinationName',e.target.value)}/></Field><datalist id="external-destinations">{state.externalDestinations.map(x=><option value={x} key={x}/>)}</datalist><h3>支払状態</h3><div className="choice-grid"><Button secondary={entry.paymentStatus!=='paid'} onClick={()=>put('paymentStatus','paid')}>入金済み</Button><Button secondary={entry.paymentStatus!=='unconfirmed'} onClick={()=>put('paymentStatus','unconfirmed')}>入金未確認</Button></div></>}
      {entry.destinationType==='unknown'&&<p className="notice">売れた数量だけ記録し、個人請求にも入金済みにも含めません。後で販売先を確認できます。</p>}
      <Field label="メモ・支払メモ（任意）">
        <textarea
          value={entry.note}
          onChange={(e) => put("note", e.target.value)}
        />
      </Field>
      <p className="total">
        {entry.destinationType==='unknown' ? "販売額（請求・入金は保留）" : entry.destinationType==='buyer' ? "個人請求に追加" : entry.paymentStatus==='paid'?'入金額':'売上（入金未確認）'}：
        {yen(entry.price * entry.qty)}
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
                    chargeRoundId: entry.destinationType==='buyer' ? entry.chargeRoundId : null,
                  },
                ),
              "販売用商品の販売を記録",
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
