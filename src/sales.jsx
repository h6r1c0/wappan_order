import React, { useState } from "react";
import {
  delivery,
  salesOrderQuantities,
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
export function Sales({roundId=null,marketId=null,onManageProducts=null}) {
  const { state, save } = useApp();
  const [edit, setEdit] = useState(null);
  const [selling, setSelling] = useState(null);
  const [batchSelling, setBatchSelling] = useState(false);
  const [orderQuantities, setOrderQuantities] = useState(() =>
    roundId ? salesOrderQuantities(state, roundId) : {},
  );
  const round = state.rounds.find((item) => item.id === roundId);
  const savedOrderQuantities = roundId
    ? salesOrderQuantities(state, roundId)
    : {};
  const stocks = state.stocks.filter(st =>
    (!roundId || st.roundId === roundId) &&
    (!marketId || st.marketId === marketId || st.roundId === roundId)
  );
  const remainingStocks = stocks.filter((stock) => stockRemaining(state, stock) > 0);
  return (
    <>
      <div className="work-title">
        <span className="eyebrow">販売用</span>
        <div className="section-head">
          <h1>注文と販売を記録する</h1>
          {onManageProducts && <Button secondary onClick={onManageProducts}>この納品日の商品</Button>}
        </div>
      </div>
      {round && (
        <section
          className="work-section order-editor"
          data-unsaved={
            JSON.stringify(orderQuantities) !==
            JSON.stringify(savedOrderQuantities)
          }
        >
          <div className="task-heading">
            <span>1</span>
            <div><h2>販売用として注文する</h2><small>納品前：仕入れる商品と数量</small></div>
          </div>
          <ProductQuantityEditor
            products={round.products}
            quantities={orderQuantities}
            onChange={setOrderQuantities}
            emptyMessage="「この納品日の商品」から、販売価格が分かっている商品を追加してください。"
          />
          <div className="sticky-action">
            <span>入力数 <strong>{Object.values(orderQuantities).reduce((a,b)=>a+b,0)}個</strong></span>
            <Button onClick={() => save(
              (s) => setSalesOrderQuantities(s, roundId, orderQuantities),
              "販売用の注文数量を保存",
            )}>販売用の注文を保存</Button>
          </div>
        </section>
      )}
      <section className="work-section sale-action-section">
        <div className="task-heading">
          <span>2</span>
          <div><h2>売れた商品を記録する</h2><small>納品後：購入者を選び、複数商品をまとめて登録</small></div>
        </div>
        <Button
          className="primary-wide"
          disabled={!remainingStocks.length}
          onClick={() => setBatchSelling(true)}
        >
          購入者を選んでまとめて販売を記録
        </Button>
        {!remainingStocks.length && <p className="muted">販売できる残数がある商品はありません。</p>}
        <p className="muted">外部販売・価格変更・販売先未確認は、下の商品ごとの「1商品ずつ販売を記録」を使います。</p>
      </section>
      <section className="work-section history-section">
        <div className="task-heading">
          <span>3</span>
          <div><h2>残数・販売履歴を確認する</h2><small>売り切れた商品も履歴と一緒に表示</small></div>
        </div>
        {state.sales.some(x => !x.void && x.pending) && <p className="notice">販売先・支払方法が未確認の記録があります。個人請求・入金済みには含めていません。各商品の販売履歴から確認できます。</p>}
        {stocks
          .slice()
          .sort((a, b) => {
            const ar=stockRemaining(state,a), br=stockRemaining(state,b);
            return (br>0)-(ar>0) || b.date.localeCompare(a.date);
          })
          .map((st) => {
            const remaining=stockRemaining(state,st);
            const salesCount=state.sales.filter((sale)=>sale.stockId===st.id&&!sale.void).length;
            return (
              <section className={`card stock-card ${remaining<1?"sold-out":""}`} key={st.id}>
                <div className="product-row">
                  <div className="grow">
                    <h2>{st.name}</h2>
                    <small>
                      {yen(st.price)} ／ 販売済み {soldQty(state,st.id)}個・{salesCount}件
                      {st.eventId ? " ／ おやつ余剰から振替" : ""}
                    </small>
                  </div>
                  <strong className={`remaining ${remaining<1?"sold-out-label":""}`}>
                    {remaining < 1 ? "売り切れ" : `残り ${remaining}個`}
                  </strong>
                </div>
                {st.test && <Tag>テスト</Tag>}
                <div className="actions">
                  <Button
                    disabled={remaining < 1}
                    onClick={() => setSelling(st)}
                  >
                    1商品ずつ販売を記録
                  </Button>
                  <Button secondary onClick={() => setEdit(st)}>
                    販売履歴・数量を確認
                  </Button>
                </div>
              </section>
            );
          })}
        {!stocks.length && (
          <Empty>
            上の商品一覧で数量を入力して保存します。おやつの余剰は「おやつ用」から振り替えます。
          </Empty>
        )}
      </section>
      {batchSelling && (
        <BatchSaleEditor
          stocks={remainingStocks}
          roundId={roundId}
          onClose={() => setBatchSelling(false)}
        />
      )}
      {edit && (
        <StockEditor
          roundId={roundId} marketId={marketId}
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
      {stock && (
        <>
          <h3>販売履歴（販売済み {sold}個／残り {stockRemaining(state, stock)}個）</h3>
          {state.sales
            .filter((x) => x.stockId === stock.id)
            .map((sale) => (
              <div className="card" key={sale.id}>
                <div className="line">
                  <span><strong>{sale.buyerName}</strong><small>{stock.name}</small></span>
                  <span>
                    {sale.qty}個 ／ {yen(sale.qty * sale.price)}
                  </span>
                </div>
                <small>
                  {sale.date} ／ {sale.destinationType==='unknown'||sale.pending ? "販売先・支払方法未確認（請求に含めない）" : sale.destinationType==='external' ? `外部販売・${sale.paymentStatus==='paid'?'入金済み':'入金未確認'}` : "個人請求"}{" "}
                  {sale.void ? "／ 取消済み" : ""}
                </small>
                {sale.note && <p>{sale.note}</p>}
                {!sale.void && (
                  <><Button secondary onClick={()=>setResolve(sale)}>販売先・支払を変更</Button><Button
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
                          }, "販売記録を取消")
                        )
                          onClose();
                      }
                    }}
                  >
                    誤入力を取り消す
                  </Button></>
                )}
              </div>
            ))}
        </>
      )}
      {resolve&&<SaleResolution sale={resolve} onClose={()=>setResolve(null)}/>}
    </Modal>
  );
}
function SaleResolution({sale,onClose}){
 const {state,save}=useApp();const stock=state.stocks.find(st=>st.id===sale.stockId);
 const [v,set]=useState({destinationType:sale.destinationType||(sale.pending?'unknown':sale.paid?'external':'buyer'),paymentStatus:sale.paymentStatus||(sale.pending?'unconfirmed':sale.paid?'paid':'later'),destinationName:sale.destinationName||(sale.destinationType==='external'?sale.buyerName:''),buyerId:sale.buyerId||'',chargeRoundId:sale.chargeRoundId||stock.roundId});
 return <Modal title="販売先・支払状態を確認" onClose={onClose}><div className="choice-grid"><Button secondary={v.destinationType!=='buyer'} onClick={()=>set({...v,destinationType:'buyer',paymentStatus:'later'})}>登録済み購入者</Button><Button secondary={v.destinationType!=='external'} onClick={()=>set({...v,destinationType:'external',paymentStatus:'unconfirmed'})}>外部販売</Button><Button secondary={v.destinationType!=='unknown'} onClick={()=>set({...v,destinationType:'unknown',paymentStatus:'unconfirmed'})}>販売先未確認</Button></div>{v.destinationType==='buyer'&&<BuyerPicker includeTest={stock.test} value={v.buyerId} onChange={buyerId=>set({...v,buyerId})}/>} {v.destinationType==='external'&&<><Field label="外部販売先・団体・マルシェ名"><input list="external-destinations-resolve" value={v.destinationName} onChange={e=>set({...v,destinationName:e.target.value})}/></Field><datalist id="external-destinations-resolve">{state.externalDestinations.map(x=><option key={x} value={x}/>)}</datalist><div className="choice-grid"><Button secondary={v.paymentStatus!=='paid'} onClick={()=>set({...v,paymentStatus:'paid'})}>入金済み</Button><Button secondary={v.paymentStatus!=='unconfirmed'} onClick={()=>set({...v,paymentStatus:'unconfirmed'})}>入金未確認</Button></div></>}<Button onClick={async()=>{if(await save(s=>{const x=s.sales.find(x=>x.id===sale.id);x.destinationType=v.destinationType;x.paymentStatus=v.destinationType==='buyer'?'later':v.destinationType==='unknown'?'unconfirmed':v.paymentStatus;x.pending=v.destinationType==='unknown';x.paid=x.paymentStatus==='paid';x.buyerId=v.destinationType==='buyer'?v.buyerId:null;x.chargeRoundId=v.destinationType==='buyer'?v.chargeRoundId:null;x.destinationName=v.destinationType==='external'?v.destinationName.trim():null;x.buyerName=v.destinationType==='buyer'?s.buyers.find(b=>b.id===v.buyerId)?.name:v.destinationType==='external'?v.destinationName.trim():'販売先未確認';if(v.destinationType==='external'&&!s.externalDestinations.includes(x.destinationName))s.externalDestinations.push(x.destinationName);},'販売先・支払状態を更新'))onClose();}}>確認内容を保存</Button></Modal>;
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
