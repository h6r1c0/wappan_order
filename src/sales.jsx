import React, { useState } from "react";
import {delivery,moveStock} from './commerce';
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
} from "./ui";
export function Sales({roundId=null,marketId=null}) {
  const { state, save } = useApp();
  const [edit, setEdit] = useState(null),
    [selling, setSelling] = useState(null),
    [all, setAll] = useState(false), [moving,setMoving]=useState(null);
  return (
    <>
      <div className="section-head">
        <h1>{marketId?'マルシェの単品販売':'園内販売'}</h1>
        <Button onClick={() => setEdit({})}>＋ 商品を置く</Button>
      </div>
      <p className="lead">
        売れたら「販売を記録」。残数と請求額が更新されます。
      </p>
      <Check label="売り切れの商品も表示" checked={all} onChange={setAll} />
      {state.sales.some(x => !x.void && x.pending) && <p className="notice">販売先・支払方法が未確認の記録があります。個人請求・入金済みには含めていません。「売り切れの商品も表示」から記録を確認できます。</p>}
      {state.stocks
        .filter(st=>(!roundId||st.roundId===roundId)&&(marketId?st.marketId===marketId:st.channel!=='external'))
        .filter((st) => all || stockRemaining(state, st) > 0)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((st) => (
          <section className="card" key={st.id}>
            <div className="product-row">
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
              <Button secondary disabled={stockRemaining(state,st)<1} onClick={()=>setMoving(st)}>販売先へ振替</Button>
            </div>
          </section>
        ))}
      {!state.stocks.filter(st=>(!roundId||st.roundId===roundId)&&(marketId?st.marketId===marketId:st.channel!=='external')).length && (
        <Empty>
          直接仕入れた商品は「商品を置く」から。行事の余剰は「行事」で振り替えます。
        </Empty>
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
      {moving&&<StockMove stock={moving} onClose={()=>setMoving(null)}/>}
    </>
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
          channel: marketId?'external':'onsite', depth:0,
        },
  );
  const put = (k, v) => set({ ...st, [k]: v });
  const sold = stock ? soldQty(state, stock.id) : 0,
    locked = stock && state.sales.some((x) => x.stockId === stock.id);
  return (
    <Modal
      title={stock ? `${marketId?'マルシェ':'園内販売'}の商品・販売記録` : `${marketId?'マルシェ':'園内販売'}の商品を追加`}
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
                          }, "園内販売を取消")
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
function StockMove({stock,onClose}){
 const {state,save}=useApp();const [qty,setQty]=useState(1),[market,setMarket]=useState(stock.channel==='external'?'':'choose'),[amount,setAmount]=useState(stock.price);
 return <Modal title="販売待ち商品を振り替える" onClose={onClose}><p>{stock.name}：残り{stockRemaining(state,stock)}点。追加仕入ではありません。</p><Field label="振替先"><select value={market} onChange={e=>setMarket(e.target.value)}><option value="choose">選んでください</option><option value="">園内販売</option>{state.markets.filter(m=>m.roundId===stock.roundId&&m.id!==stock.marketId).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field><Qty label="振替数量" value={qty} onChange={setQty}/><Money label="振替先での販売価格" value={amount} onChange={setAmount}/><p>仕入単価{yen(stock.cost)}を引き継ぎます。</p><Button disabled={market==='choose'} onClick={async()=>{if(await save(s=>moveStock(s,s.stocks.find(st=>st.id===stock.id),qty,market||null,amount),'販売先を振替'))onClose();}}>この数量を振り替える</Button></Modal>;
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
    destinationType: stock.channel==='external'?'external':'buyer',
    paymentStatus: stock.channel==='external'?'unconfirmed':'later',
    destinationName: stock.channel==='external'?(market?.name||''):'',
    buyerId: "",
    chargeRoundId: defaultRound?.id || null,
    price: stock.price,
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
      {stock.channel==='external'&&<Money label="1個の販売価格（この販売だけ）" required value={entry.price} onChange={v=>put('price',v)}/>}
      <Field
        label="販売日"
        type="date"
        value={entry.date}
        onChange={(e) => put("date", e.target.value)}
      />
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
              stock.channel==='external'?"外部販売を記録":"園内販売を記録",
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
