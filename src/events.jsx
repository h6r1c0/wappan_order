import {receivedQuantity} from './shortages';
import React, { useState } from "react";
import {
  delivery,
  setSnackOrderQuantities,
  snackOrderQuantities,
} from './commerce';
import {
  uid,
  today,
  price,
  yen,
  eventCost,
  eventClaim,
  transferredQty,
  transfer,
  setEventTest,
  undoTransfer,
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
  Summary,
  ProductQuantityEditor,
} from "./ui";
export function Events({roundId=null,onManageProducts=null,phase='all'}) {
  const { state, save } = useApp();
  const [edit, setEdit] = useState(null),
    [move, setMove] = useState(null),
    [orderQuantities, setOrderQuantities] = useState(() =>
      roundId ? snackOrderQuantities(state, roundId) : {},
    );
  const round = state.rounds.find((item) => item.id === roundId);
  const savedOrderQuantities = roundId
    ? snackOrderQuantities(state, roundId)
    : {};
  const events = [...state.events]
    .filter((event) => !roundId || event.roundId === roundId)
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      {phase !== 'after' && <div className="section-head">
        <h2>おやつ用</h2>
        {onManageProducts && <Button secondary onClick={onManageProducts}>商品を追加・変更</Button>}
      </div>}
      {phase !== 'after' && round && (
        <section
          className="card order-editor"
          data-unsaved={
            JSON.stringify(orderQuantities) !==
            JSON.stringify(savedOrderQuantities)
          }
        >
          <ProductQuantityEditor
            products={round.products}
            quantities={orderQuantities}
            onChange={setOrderQuantities}
            priceHeading="商品　仕入単価　数量"
            priceLabel={(product) => {
              const cost = product.cost ?? (round.status === '入力中' ? state.products.find((item) => item.id === product.id)?.cost : null);
              return cost == null ? "未確認" : yen(cost);
            }}
            emptyMessage="今月の商品を準備してください。"
          />
          <div className="sticky-action">
            <span>入力数 <strong>{Object.values(orderQuantities).reduce((a,b)=>a+b,0)}個</strong></span>
            <Button onClick={() => save(
              (s) => setSnackOrderQuantities(s, roundId, orderQuantities),
              "おやつ用の注文数量を保存",
            )}>保存</Button>
          </div>
        </section>
      )}
      {phase !== 'order' && !roundId && <h2>おやつ使用・財政請求</h2>}
      {phase !== 'order' && <>
      {events.map(e=><SnackUsage key={e.id} event={e} onTransfer={line=>setMove({event:e,line})}/>)}
      {!events.length && (
        <Empty>
          上の商品一覧で注文数量を入力して保存します。
        </Empty>
      )}
      </>}
      {edit && (
        <EventEditor
          roundId={roundId}
          event={edit.id ? edit : null}
          onClose={() => setEdit(null)}
        />
      )}{" "}
      {move && (
        <TransferEditor
          event={move.event}
          line={move.line}
          onClose={() => setMove(null)}
        />
      )}
    </>
  );
}
function EventEditor({ event, onClose, roundId=null }) {
  const { state, save } = useApp();
  const lockedOrder = !!event && state.rounds.find(r=>r.id===event.roundId)?.status !== '入力中';
  const [e, set] = useState(
    event
      ? structuredClone(event)
      : {
          id: uid(),
          name: "",
          date: today(),
          test: state.rounds.find(r=>r.id===roundId)?.test || false,
          roundId,
          note: "",
          lines: [],
        },
  );
  const [choice, setChoice] = useState("walnut");
  const add = () => {
    const p = state.products.find((p) => p.id === choice);
    set({
      ...e,
      lines: [
        ...e.lines,
        {
          id: uid(),
          productId: p?.id || null,
          name: p?.name || "",
          category: p?.category || "パン",
          cost: p?.cost ?? null,
          qty: 1,
          used: 0,
        },
      ],
    });
  };
  const put = (i, k, v) =>
    set({
      ...e,
      lines: e.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)),
    });
  return (
    <Modal
      title={event ? "おやつ用の注文・使用数" : "おやつ予定を追加"}
      onClose={onClose}
    >
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (
            await save((s) => {
              e.roundId ||= delivery(s,e.deliveryDate||e.date,e.test).id;
              e.test=s.rounds.find(r=>r.id===e.roundId).test;
              const i = s.events.findIndex((x) => x.id === e.id);
              if (lockedOrder && event.lines.some(line => e.lines.find(next => next.id === line.id)?.qty !== line.qty))
                throw Error('確定後の注文数は欠品修正の手順から変更してください');
              if (i < 0) s.events.push(e);
              else s.events[i] = e;
              setEventTest(s, e, e.test);
            }, "おやつ用を保存")
          )
            onClose();
        }}
      >
        <Field
          required
          label="行事・おやつ名"
          value={e.name}
          onChange={(ev) => set({ ...e, name: ev.target.value })}
        />
        <Field
          required
          label="使用日"
          type="date"
          value={e.date}
          onChange={(ev) => set({ ...e, date: ev.target.value })}
        />
        {e.roundId ? <p className="notice">納品回：{state.rounds.find(r=>r.id===e.roundId)?.date}（用途：おやつ用）</p> : <Field label="納品予定日（空欄なら使用日と同じ）" type="date" value={e.deliveryDate||''} onChange={ev=>set({...e,deliveryDate:ev.target.value})}/>}
        {e.lines.map((l, i) => {
          const moved = transferredQty(state, l.id);
          return (
            <div className="card" key={l.id}>
              <Field
                required
                label="商品名"
                value={l.name}
                onChange={(ev) => put(i, "name", ev.target.value)}
              />
              <div className="grid2">
                <Field label="注文数">
                  {lockedOrder ? <strong>{l.qty}個</strong> : <Qty label={`${l.name} 注文数`} value={l.qty} onChange={(v) => put(i, "qty", v)} />}
                </Field>
                <Field label="実際のおやつ使用数">
                  <Qty label={`${l.name} おやつ使用数`} value={l.used} onChange={(v) => put(i, "used", v)} />
                </Field>
              </div>
              {moved ? (
                <p>
                  仕入単価 {yen(l.cost)}（{moved}個を販売側へ振替済み）
                </p>
              ) : (
                <Money
                  label="実際の仕入単価（未確認なら空欄）"
                  value={l.cost}
                  onChange={(v) => put(i, "cost", v)}
                />
              )}
              <p>未処理余剰：{receivedQuantity(l) - l.used - moved}個</p>
              {!state.stocks.some((st) => st.eventLineId === l.id) && (
                <Button
                  secondary
                  danger
                  onClick={() => {
                    if (confirm("この商品行を削除しますか？"))
                      set({
                        ...e,
                        lines: e.lines.filter((x) => x.id !== l.id),
                      });
                  }}
                >
                  この商品行を削除
                </Button>
              )}
            </div>
          );
        })}
        <div className="inline">
          <Field label="注文商品">
            <select
              value={choice}
              onChange={(ev) => setChoice(ev.target.value)}
            >
              {state.products
                .filter((p) => ["walnut", "bean", "apple"].includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              <option value="other">その他（名前と単価を入力）</option>
            </select>
          </Field>
          <Button secondary onClick={add}>
            ＋ 商品行を追加
          </Button>
        </div>
        <p className="notice">
          こしあんぱん等、未確認の仕入単価は空欄です。確認後に入力してください。
        </p>
        <Field label="メモ">
          <textarea
            value={e.note}
            onChange={(ev) => set({ ...e, note: ev.target.value })}
          />
        </Field>
        <Check
          label="テスト入力・年度集計から除外"
          checked={e.test}
          onChange={(v) => set({ ...e, test: v })}
        />
        <Button type="submit">おやつ用の注文・使用数を保存</Button>
      </form>
    </Modal>
  );
}
function TransferEditor({ event, line, onClose }) {
  const { state, save } = useApp();
  const remaining = receivedQuantity(line) - line.used - transferredQty(state, line.id);
  const [qty, setQty] = useState(remaining),
    [amount, setAmount] = useState(
      price(
        state.products.find((p) => p.id === line.productId) || {
          mode: "auto",
          gross: null,
        },
      ),
    ),
    [date, setDate] = useState(event.date);
  return (
    <Modal title="余剰を販売用へ振替" onClose={onClose}>
      <h3>
        {line.name} ／ 未処理余剰 {remaining}個
      </h3>
      <p className="notice">共通の販売用在庫へ移します。販売場所は、実際に売れたときだけ必要に応じて記録します。</p>
      <Field label="振り替える数量">
        <Qty value={qty} onChange={setQty} />
      </Field>
      <Money
        required
        label="通常販売価格（1個）"
        value={amount}
        onChange={setAmount}
      />
      <Field
        label="販売開始日"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <p>
        販売側に移る仕入額：<strong>{yen(qty * line.cost)}</strong>
      </p>
      <p className="muted">
        この数量は財政へ請求しません。売れた数量分だけ販売利益になります。
      </p>
      <Button
        onClick={async () => {
          if (
            await save((s) => {
              const e = s.events.find((x) => x.id === event.id),
                l = e.lines.find((x) => x.id === line.id);
              transfer(s, e, l, qty, amount, date);
              Object.assign(s.stocks.at(-1),{roundId:e.roundId,channel:'sales',marketId:null});
            }, "おやつ余剰を販売用へ振替")
          )
            onClose();
        }}
      >
        振り替えて販売用に追加
      </Button>
    </Modal>
  );
}

function SnackUsage({event:e,onTransfer}) {
 const {state,save}=useApp();
 const [used,setUsed]=useState(()=>Object.fromEntries(e.lines.map(l=>[l.id,l.used])));
 const [costs,setCosts]=useState(()=>Object.fromEntries(e.lines.map(l=>[l.id,l.cost])));
 const dirty=e.lines.some(l=>used[l.id]!==l.used||costs[l.id]!==l.cost);
 return <section className="snack-usage" data-unsaved={dirty}>
  <h3>{e.name}</h3>
  {e.lines.map(l=>{const moved=transferredQty(state,l.id),remaining=receivedQuantity(l)-(used[l.id]||0)-moved;
   const masterCost=state.products.find(p=>p.id===l.productId)?.cost;
   return <div className="event-line" key={l.id}><div className="product-row"><span className="grow">{l.name}<small>入荷 {receivedQuantity(l)}個 ／ 余剰 {remaining}個{moved?` ／ 振替済 ${moved}個`:''}</small></span>
    <Qty label={`${l.name} おやつ使用数`} max={receivedQuantity(l)-moved} value={used[l.id]||0} onChange={n=>setUsed({...used,[l.id]:n})}/></div>
    <details className="snack-cost"><summary>仕入単価 {costs[l.id]==null?(masterCost==null?'未登録':`基準 ${yen(masterCost)}`):yen(costs[l.id])} ・変更</summary>
     {costs[l.id]==null&&masterCost!=null&&!moved&&<button type="button" className="text-action" onClick={()=>setCosts({...costs,[l.id]:masterCost})}>基準単価 {yen(masterCost)}を今回に適用</button>}
     {!moved&&<Money label={`${l.name} 今回の仕入単価`} value={costs[l.id]} onChange={n=>setCosts({...costs,[l.id]:n})}/>}
    </details>
    {remaining>0&&<button type="button" className="text-action" disabled={dirty||l.cost==null} onClick={()=>onTransfer(l)}>余剰を販売用へ振替 ›</button>}
    {state.stocks.filter(st=>st.eventLineId===l.id&&st.qty>0).map(st=><div className="line" key={st.id}><small>振替 {st.qty}個 ／ 販売 {soldQty(state,st.id)}個</small><button type="button" className="text-action" disabled={soldQty(state,st.id)>0} onClick={()=>{if(confirm('振替を戻しますか？'))save(s=>undoTransfer(s,st.id),'余剰振替取消');}}>戻す</button></div>)}
   </div>;
  })}
  <div className="snack-claim"><span>財政請求</span><strong>{yen(eventClaim({...e,lines:e.lines.map(l=>({...l,used:used[l.id]||0,cost:costs[l.id]}))}))}</strong>
   <Button disabled={!dirty} onClick={()=>save(s=>{const current=s.events.find(x=>x.id===e.id);for(const l of current.lines){l.used=used[l.id]||0;l.cost=costs[l.id];}},'おやつ使用数・今回原価を保存')}>保存</Button></div>
 </section>;
}
