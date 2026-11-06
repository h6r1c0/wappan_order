import {receivedQuantity} from './shortages';
import {productDisplayName} from './product-names.js';
import {SnackBilling} from './snack-billing.jsx';
import {StockEditor} from './sales.jsx';
import {transferStockToSnack,cancelStockToSnackTransfer} from './snack-transfer.js';
import {saveSnackSection,suggestedSnackPrice,savedFiscalAmount,snackQuantityRows,saveSnackCost,snackPurposeQuantity,addLineToSnackGroup,effectiveFiscalReceipts,recordFiscalReceipt,correctFiscalReceipt} from './snack-billing.js';
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
  soldQty,
  stockRemaining,
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
  BuyerPicker,
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
  const usageEvents=events.filter(event=>event.billing||event.lines.some(line=>receivedQuantity(line)>0||line.used>0));
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
      {usageEvents.map(e=><SnackUsage key={e.id+':'+e.lines.map(l=>l.id+':'+l.used+':'+l.cost).join('|')} event={e} onTransfer={line=>setMove({event:e,line})}/>)}
      {!usageEvents.length && (
        <Empty>
          {phase==='after'?'おやつ用の入荷・使用はありません。':'上の商品一覧で注文数量を入力して保存します。'}
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
  const [choice, setChoice] = useState(() => state.products.find(p=>p.active&&!p.retiredDuplicate&&/くるみパン\s*1個(?:入り)?$/u.test(p.name))?.id || state.products.find(p=>p.id==='walnut'&&p.active&&!p.retiredDuplicate)?.id || '');
  const add = () => {
    const p = state.products.find((p) => p.id === choice && !p.retiredDuplicate);
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
      title={event ? "おやつ用の注文" : "おやつ予定を追加"}
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
              <p>用途未振分：{receivedQuantity(l) - snackPurposeQuantity(e,l.id) - moved}個</p>
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
                .filter((p) => p.active && !p.retiredDuplicate && (/くるみパン\s*1個(?:入り)?$/u.test(p.name) || p.id==='walnut'&&!state.products.some(x=>x.active&&!x.retiredDuplicate&&/くるみパン\s*1個(?:入り)?$/u.test(x.name)) || /^こしあんぱん/u.test(p.name) || /^りんごデニッシュ/u.test(p.name)))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {productDisplayName(p.name)}
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
        <Button type="submit">おやつ用の注文を保存</Button>
      </form>
    </Modal>
  );
}
function TransferEditor({ event, line, onClose }) {
  const { state, save } = useApp();
  const remaining = receivedQuantity(line) - (event.snackDraft||event.billing?snackPurposeQuantity(event,line.id):line.used) - transferredQty(state, line.id);
  const [qty, setQty] = useState(0),
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
    <Modal title="おやつから販売用へ振替" onClose={onClose}>
      <h3>
        {line.name} ／ 振替可能 {remaining}個
      </h3>
      <p className="notice">共通の販売用在庫へ移します。販売場所は、実際に売れたときだけ必要に応じて記録します。</p>
      <Field label="振り替える数量">
        <Qty value={qty} max={Math.max(0,remaining)} onChange={setQty} />
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
      <p>販売側に移る仕入額：<strong>{line.cost==null?'原価未確定':yen(qty * line.cost)}</strong></p>
      <p className="muted">
        この数量は財政へ請求しません。売れた数量分だけ販売利益になります。
      </p>
      <Button disabled={qty<1||qty>remaining||amount==null||line.cost==null}
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
 const [costSource,setCostSource]=useState(null);
 const [costs,setCosts]=useState(()=>Object.fromEntries(e.lines.map(l=>[l.id,l.cost])));
 const [costReason,setCostReason]=useState('');
 const [cashAmount,setCashAmount]=useState(null),[cashDate,setCashDate]=useState(today());
 const [cashCorrection,setCashCorrection]=useState(''),[cashReason,setCashReason]=useState('');
 const [cashMemo,setCashMemo]=useState(e.fiscalReconciliationMemo||'');
 const rows=snackQuantityRows(state,e),draftAmount=savedFiscalAmount(e);
 const usageCost=rows.some(x=>x.used>0&&x.line.cost==null)?null:rows.reduce((n,x)=>n+x.used*(x.line.cost||0),0);
 const fiscalCash=effectiveFiscalReceipts(e).reduce((n,x)=>n+x.amount,0);
 return <section className="snack-usage">
  {e.name&&e.name!=='おやつ用'&&<h3>{e.name}</h3>}
  <StockToSnack event={e}/>
  <SnackBilling event={e} onTransfer={onTransfer}/>
  <details className="snack-stock-facts"><summary>商品別の入荷・原価・余剰を確認</summary>
  {e.lines.filter(l=>receivedQuantity(l)>0).map(l=>{const moved=transferredQty(state,l.id);
   const row=rows.find(x=>x.line.id===l.id);
   const masterCost=state.products.find(p=>p.id===l.productId)?.cost;
   return <div className="event-line" key={l.id}><div className="product-row"><span className="grow">{l.name}</span></div>
    {l.sourceStockId?<button type="button" className="text-action" onClick={()=>setCostSource(l.sourceStockId)}>仕入単価 {yen(costs[l.id])} ・{costs[l.id]==null?'確定・入力':'訂正'} ›</button>:
    <details className="snack-cost"><summary>仕入単価 {costs[l.id]==null?(masterCost==null?'未登録':`基準 ${yen(masterCost)}`):yen(costs[l.id])} ・変更</summary>
     {costs[l.id]==null&&masterCost!=null&&!moved&&<button type="button" className="text-action" onClick={()=>setCosts({...costs,[l.id]:masterCost})}>基準単価 {yen(masterCost)}を今回に適用</button>}
     {!moved&&<><Money label={`${l.name} 今回の仕入単価`} value={costs[l.id]} onChange={n=>setCosts({...costs,[l.id]:n})}/>
      {l.cost!=null&&costs[l.id]!==l.cost&&<Field label="原価を訂正する理由"><input value={costReason} onChange={ev=>setCostReason(ev.target.value)}/></Field>}
      <button type="button" className="text-action" disabled={costs[l.id]==null||costs[l.id]===l.cost||l.cost!=null&&!costReason.trim()} onClick={async()=>{if(await save(s=>saveSnackCost(s,e.id,l.id,costs[l.id],l.cost==null?'今回の仕入単価を確認':costReason),'おやつ仕入単価を保存'))setCostReason('');}}>仕入単価を保存</button></>}
    </details>}
   </div>;
  })}
  <div className="snack-claim"><span>おやつ使用原価（請求額とは別）</span><strong>{yen(usageCost)}</strong></div>
  <div className="snack-claim"><span>{e.billing?'確定した財政請求':e.snackDraft?'保存済み財政分（請求未確定）':'財政請求（用途未確定）'}</span><strong>{e.billing?yen(eventClaim(e)):e.snackDraft?yen(draftAmount):'未確定'}</strong></div>
  </details>
  <details className="fiscal-cash-detail"><summary>財政からの受取・請求差を確認{fiscalCash?`（記録済み ${yen(fiscalCash)}）`:''}</summary>
   <p>実際の受取は請求の訂正後も履歴に残ります。請求への自動充当や売上の再計上はしません。</p>
   {e.billing?<p>確定した財政請求 {yen(eventClaim(e))} ／ 記録済みの受取 {yen(fiscalCash)} ／ 差 {yen((eventClaim(e)||0)-fiscalCash)}</p>:<p>財政請求は未確定です。受取と請求の差は確定後に表示します。</p>}
   {(fiscalCash>0||e.fiscalReconciliationMemo)&&<div><Field label="差額・確認待ちのメモ（任意）"><input value={cashMemo} onChange={ev=>setCashMemo(ev.target.value)} placeholder="例：最終精算時に説明・調整"/></Field>
    <button type="button" className="text-action" disabled={cashMemo===e.fiscalReconciliationMemo} onClick={()=>save(s=>{const item=s.events.find(x=>x.id===e.id);item.fiscalReconciliationHistory??=[];item.fiscalReconciliationHistory.push({at:new Date().toISOString(),previous:item.fiscalReconciliationMemo||'',updated:cashMemo});item.fiscalReconciliationMemo=cashMemo;},'財政の請求と受取の差をメモ')}>メモを保存</button></div>}
   {e.fiscalReceipts?.map(x=>{const corrected=e.fiscalReceiptCorrections?.find(c=>c.targetId===x.id);return <div className="fiscal-cash-row" key={x.id}>
    <span>{x.date} 受取 {yen(x.amount)}{corrected?`（訂正済み：${corrected.reason}）`:''}</span>
    {!corrected&&<button type="button" className="text-action" onClick={()=>{setCashCorrection(x.id);setCashReason('');}}>この受取を訂正</button>}
   </div>;})}
   {cashCorrection&&<div><Field label="受領記録を訂正する理由"><input value={cashReason} onChange={ev=>setCashReason(ev.target.value)}/></Field><Button secondary disabled={!cashReason.trim()} onClick={async()=>{if(await save(s=>correctFiscalReceipt(s,e.id,cashCorrection,cashReason),'財政の受領記録を理由付き訂正')){setCashCorrection('');setCashReason('');}}}>元記録を残して訂正</Button></div>}
   <Field label="財政から実際に受け取った日" type="date" value={cashDate} onChange={ev=>setCashDate(ev.target.value)}/>
   <Money label="実際に受け取った金額" value={cashAmount} onChange={setCashAmount}/>
   <Button secondary disabled={!cashAmount||!cashDate} onClick={async()=>{const id=uid();if(await save(s=>recordFiscalReceipt(s,e.id,{id,amount:cashAmount,date:cashDate}),'財政からの実際の受取を保存'))setCashAmount(null);}}>受取事実を保存</Button>
  </details>
  {costSource&&state.stocks.some(st=>st.id===costSource)&&<StockEditor stock={state.stocks.find(st=>st.id===costSource)} costOnly onClose={()=>setCostSource(null)}/>}
 </section>;
}

function StockToSnack({event}){
 const {state,save}=useApp(),sources=state.stocks.filter(st=>st.roundId===event.roundId&&!st.eventId&&stockRemaining(state,st)>0);
 const [stockId,setStockId]=useState(''),[qty,setQty]=useState(1),[purpose,setPurpose]=useState('fiscal');
 const [buyerId,setBuyerId]=useState(''),[unitPrice,setUnitPrice]=useState(null),[error,setError]=useState('');
 const [cancelLine,setCancelLine]=useState(''),[cancelReason,setCancelReason]=useState('');
 const groups=event.snackDraft?.groups||event.billing?.groups||[];
 const [groupId,setGroupId]=useState('');
 const source=sources.find(s=>s.id===stockId);
 return <details className="stock-to-snack"><summary>販売用からおやつへ振替</summary>
  {error&&<p role="alert" className="notice">{error}</p>}
  {event.lines.filter(l=>l.sourceStockId&&receivedQuantity(l)>0).map(l=><div className="snack-transfer-entry" key={l.id}><span>{l.name}：販売用から {l.qty}個</span>
    <button type="button" className="text-action" onClick={()=>{setCancelLine(l.id);setCancelReason('');setError('');}}>この振替を訂正</button>
    {cancelLine===l.id&&<div className="snack-transfer-correction"><p>この振替行を0個に戻します。元の販売記録は保持します。請求先がある場合は取り消せません。</p>
      <Field label="訂正理由"><input value={cancelReason} onChange={e=>setCancelReason(e.target.value)}/></Field>
      <Button secondary disabled={!cancelReason.trim()} onClick={async()=>{try{cancelStockToSnackTransfer(structuredClone(state),event.id,l.id,cancelReason);setError('');
        if(await save(s=>cancelStockToSnackTransfer(s,event.id,l.id,cancelReason),'販売用からおやつへの振替を訂正'))setCancelLine('');}
        catch(e){setError(e.message);}}}>訂正を保存</Button>
      <button type="button" className="text-action" onClick={()=>setCancelLine('')}>閉じる</button></div>}
  </div>)}
  <p className="muted">未割当の在庫から振り替えます。</p>
  <Field label="販売用の商品"><select value={stockId} onChange={e=>{setStockId(e.target.value);setUnitPrice(null);setError('');}}>
   <option value="">商品を選ぶ</option>{sources.map(st=><option value={st.id} key={st.id}>{st.name}（残り{stockRemaining(state,st)}個）</option>)}</select></Field>
  {source&&<><Qty label="おやつへ振り替える数量" min={1} max={stockRemaining(state,source)} value={qty} onChange={setQty}/>
   <Field label="振替先の用途"><select value={purpose} onChange={e=>setPurpose(e.target.value)}>
    <option value="fiscal">財政分</option><option value="direct">そのまま購入者へ請求</option><option value="common">共通単価を設定する分</option>
   </select></Field>
   {purpose==='direct'&&<BuyerPicker value={buyerId} onChange={setBuyerId} includeTest={event.test}/>}
   {purpose==='common'&&<Field label="追加先の共通単価"><select value={groupId} onChange={e=>setGroupId(e.target.value)}>
    <option value="">追加先を選ぶ</option>{groups.map(g=><option key={g.id} value={g.id}>{g.label}（対象 {Object.values(g.quantities||{}).reduce((n,x)=>n+x,0)}個）</option>)}<option value="new">新しい共通単価を作成</option>
   </select></Field>}
   {(purpose==='direct'||purpose==='common'&&groupId==='new')&&<Money label="請求単価" value={unitPrice} onChange={setUnitPrice}/>}
   {source.cost==null&&<p className="notice">この販売用商品の仕入原価は未確定です。振替後も原価は推測せず、請求確定前に元の販売用商品から入力してください。</p>}
   <Button disabled={purpose==='direct'&&(!buyerId||unitPrice==null)||purpose==='common'&&(!groupId||groupId==='new'&&unitPrice==null)} onClick={async()=>{
    try{
     const action=s=>{
      const line=transferStockToSnack(s,stockId,event.id,qty);
      const draft=s.events.find(x=>x.id===event.id).snackDraft||s.events.find(x=>x.id===event.id).billing||{label:'',fiscal:[],household:[],groups:[]};
      if(purpose==='fiscal')saveSnackSection(s,event.id,'fiscal',[...draft.fiscal,{lineId:line.id,qty}]);
      if(purpose==='direct')saveSnackSection(s,event.id,'direct',[...draft.household.filter(x=>!x.groupId&&x.lineId),{buyerId,lineId:line.id,qty,unitPrice}]);
      if(purpose==='common'){
       if(groupId==='new')saveSnackSection(s,event.id,'common',{groups:[...draft.groups,{id:crypto.randomUUID(),label:'共通単価',unitPrice,lineIds:[line.id],quantities:{[line.id]:qty},priceMode:'manual'}],household:draft.household.filter(x=>x.groupId)});
       else addLineToSnackGroup(s,event.id,groupId,line.id,qty);
      }
     };
     action(structuredClone(state));setError('');
     if(await save(action,'販売用からおやつへ振替し用途を保存')){setStockId('');setQty(1);setBuyerId('');setUnitPrice(null);setGroupId('');}
    }catch(e){setError(e.message);}
   }}>おやつへ振替して保存</Button></>}
 </details>;
}
