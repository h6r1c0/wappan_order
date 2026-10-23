import React,{useState,useRef,useEffect} from 'react';
import {collectionPosition,collectionDueItems,today,uid,yen,collections} from './domain';
import {useApp,Button,Field,Money,Qty,copyText} from './ui';
import {productDisplayName} from './product-names.js';
import {billingAudit,chargeLines,collectionReasons,correctionReasons,confirmBilling,confirmLinePrice,flagMissingCharge,saveCollectionCase,receiveCollection,correctCollectionRecord,adjustReceivable} from './collection-workflow.js';
import {openPrintPreview} from './print-preview.js';

function BuyerCollection({round,buyer,row,focus,onDone,onOpen,session,onDraft,onSource}){
  const {state,save}=useApp();
  const audit=billingAudit(state,round.id).buyers.find(x=>x.buyerId===buyer.id);
  const position=collectionPosition(state,round.id,buyer.id),due=collectionDueItems(state,round.id,buyer.id);
  const pending=(state.collectionCases||[]).find(x=>x.roundId===round.id&&x.buyerId===buyer.id&&x.status==='pending');
  const [open,setOpen]=useState(false),[received,setReceived]=useState(session?.received??pending?.received??null),[reason,setReason]=useState(session?.reason||pending?.reason||'');
  const [pastDate,setPastDate]=useState(session?.pastDate||pending?.pastDate||new Date(Date.parse(round.date)-86400000).toISOString().slice(0,10));
  const [investigate,setInvestigate]=useState(false),[bag,setBag]=useState(null),[exception,setException]=useState('');
  const [lineKey,setLineKey]=useState(''),[qty,setQty]=useState(1),[unitPrice,setUnitPrice]=useState(null),[correction,setCorrection]=useState('');
  const [memo,setMemo]=useState(session?.memo||pending?.memo||''),[busy,setBusy]=useState(false),[editEntry,setEditEntry]=useState(null),[correctedCash,setCorrectedCash]=useState(null),[refund,setRefund]=useState(null),[target,setTarget]=useState(session?.target||'');
  const request=useRef(uid());
  useEffect(()=>{onDraft?.(buyer.id,{received,reason,pastDate,memo,target});},[received,reason,pastDate,memo,target,buyer.id]);
  const isOpen=focus===buyer.id;
  const lines=chargeLines(state,round.id,buyer.id),line=lines.find(x=>x.key===lineKey);
  const price=line?.unitPrice??unitPrice;
  const missingCandidates=lines.filter(l=>l.qty>0&&(l.unitPrice==null||audit?.knownBag!=null&&l.amount===position.current-audit.knownBag));
  const delta=received==null?null:received-position.balance;
  const missingPast=reason===collectionReasons[0]&&delta>0?delta:reason===collectionReasons[1]&&delta<0?-delta:0;
  const displayBalance=position.balance===0?'精算済み':position.balance<0?`預かり ${yen(-position.balance)}`:`未収 ${yen(position.balance)}`;
  const act=async(fn,description)=>{if(busy)return false;setBusy(true);try{return await save(fn,description);}finally{setBusy(false);}};
  const afterSave=()=>{setReceived(null);setReason('');setOpen(false);setInvestigate(false);request.current=uid();onDone(buyer.id);};
  const chooseLine=key=>{setLineKey(key);setQty(1);const l=lines.find(x=>x.key===key);setUnitPrice(l?.unitPrice??l?.candidate??null);};
  const historyRounds=state.rounds.filter(r=>(r.test===round.test||r.collectionLive)&&r.date<=round.date).map(r=>r.id);
  const history=[...(state.collectionEntries||[]).filter(x=>historyRounds.includes(x.roundId)&&x.buyerId===buyer.id).map(x=>({...x,kind:'collectionEntries'})),
    ...(state.collectionReconciliations||[]).filter(x=>historyRounds.includes(x.roundId)&&x.buyerId===buyer.id).map(x=>({...x,kind:'collectionReconciliations'}))];
  const resolved=id=>(state.collectionCorrections||[]).some(x=>x.targetId===id);
  return <section className="collection-entry" id={`collect-${buyer.id}`} data-buyer={buyer.id}>
    <div className="collection-person"><strong>{buyer.name}</strong><span className={`collection-state ${position.balance===0?'is-paid':'is-due'}`}>{pending?'要確認':displayBalance}</span></div>
    <div className="collection-right"><strong>今回請求 {audit?.lines.some(l=>l.qty>0&&l.amount==null)?'未確定':yen(position.current)}</strong>
      <button type="button" className="text-action collection-edit" aria-expanded={isOpen} onClick={()=>{if(isOpen)onDone(buyer.id,false);else onOpen(buyer.id);}}> {isOpen?'閉じる':'受取・請求確認 ›'}</button></div>
    {(state.receivableItems||[]).filter(x=>x.kind==='additional'&&x.roundId===round.id&&x.buyerId===buyer.id).map(x=><p className="collection-alert" key={x.id}>追加請求 {yen(x.amount)}<small>{x.note}（今回請求に含まれます）</small></p>)}
    {position.carry!==0&&<p className="collection-alert">{position.carry<0?'前回までの預かり':'過去未収'} {yen(Math.abs(position.carry))}</p>}
    {!!position.confirmedHistorical&&<p className="collection-alert">過去の支払済み確認 {yen(position.confirmedHistorical)}<small>現金の受取記録とは別の確認です。履歴から内容を調べられます。</small></p>}
    {audit?.issues.map((x,i)=><p className="collection-alert" key={i}>{x.message}</p>)}
    {!!position.received&&<small className="collection-note">この回の受取記録 {yen(position.received)}</small>}
    {isOpen&&<div className="collection-detail">
      <div className="collection-totals"><div><small>今回請求</small><strong>{yen(position.current)}</strong></div><div><small>過去未収・預かり</small><strong>{yen(position.carry)}</strong></div><div><small>現在の未収</small><strong>{yen(Math.max(0,position.balance))}</strong></div></div>
      <Money label="実際受取額" value={received} onChange={v=>{setReceived(v);setTarget('');}}/>
      {delta!=null&&<p className="receipt-difference" role="status">{delta===0?'請求残高と一致':`請求残高との差 ${delta>0?'＋':'−'}${yen(Math.abs(delta))}`}{position.received?` ／ 記録済み受取 ${yen(position.received)}`:''}</p>}
      {received!=null&&(delta!==0||received<0)&&<Field label="金額が違う理由"><select value={reason} onChange={e=>{setReason(e.target.value);if([collectionReasons[2],collectionReasons[6]].includes(e.target.value))setInvestigate(true);}}><option value="">理由を選んでください</option>{collectionReasons.map(x=><option key={x}>{x}</option>)}</select></Field>}
      {reason==='返金がある'&&<Money label="返金額" value={refund??Math.max(0,-position.balance)} onChange={setRefund}/>}
      {!!missingPast&&<div className="fact-confirmation"><p>{reason===collectionReasons[0]?'未登録の前回不足':'未登録の前回預かり'}候補：{yen(missingPast)}</p><Field label="前回分の対象日" type="date" value={pastDate} max={round.date} onChange={e=>setPastDate(e.target.value)}/><small>確認して受取を保存すると、前回分も一緒に記録します。登録済みの分は残高へ反映済みです。</small></div>}
      <div className="actions"><Button disabled={busy||received==null||(reason==='返金がある'?(refund??Math.max(0,-position.balance))<=0:received<=0)||delta!==0&&!reason||reason===collectionReasons[6]||audit?.lines.some(l=>l.qty>0&&(l.unitPrice==null||l.missingProduct))}
        onClick={async()=>{if(await act(s=>receiveCollection(s,{roundId:round.id,buyerId:buyer.id,received:reason==='返金がある'?-(refund??Math.max(0,-position.balance)):received,reason,pastAmount:missingPast,pastDate,requestId:request.current,caseId:pending?.id,itemId:target}),'実際の受取と差額理由を保存'))afterSave();}}>{reason==='返金がある'?'返金を保存':'受取額を保存'}</Button>
        <button type="button" className="text-action" onClick={()=>setInvestigate(!investigate)} aria-expanded={investigate}>請求・過去の履歴を調べる ›</button></div>
      {(investigate||reason===collectionReasons[6])&&<div className="collection-investigation" aria-label="差額の調査">
        <h3>注文・納品・請求を照合</h3>
        <div className="charge-line heading"><span>商品／注文・受取</span><span>数量</span><span>金額</span></div>
        {lines.map(l=><div className="charge-line" key={l.key}><span>{productDisplayName(l.name)}<small>{l.source==='sale'?'販売用から追加購入':`注文 ${l.ordered}個 ／ 受取 ${l.qty}個${l.cancelled?` ／ 欠品・取消 ${l.cancelled}個`:''}`}</small></span><span>{l.qty}個</span><strong>{yen(l.amount)}</strong></div>)}
        {row?.snack>0&&<p>おやつ請求 {yen(row.snack)}</p>}
        {lines.some(l=>l.qty>0&&l.unitPrice==null)&&<p className="notice">単価未確定の商品があります。下の商品選択から確認した価格を登録できます。</p>}
        {!!onSource&&<div className="actions"><button type="button" className="text-action" onClick={()=>onSource('order',buyer.id)}>元の個人注文を確認・修正 ›</button><button type="button" className="text-action" onClick={()=>onSource('sales',buyer.id)}>販売用の履歴を確認・修正 ›</button></div>}
        {!!round.planned?.[buyer.id]&&<details><summary>注文確定時と現在の数量</summary>{[...new Set([...Object.keys(round.planned[buyer.id].quantities),...Object.keys(round.orders[buyer.id]?.quantities||{})])].map(id=><p key={id}>{round.products.find(p=>p.id===id)?.name||'注文商品'}：確定時 {round.planned[buyer.id].quantities[id]||0}個 ／ 現在 {round.orders[buyer.id]?.quantities[id]||0}個</p>)}</details>}
        <h3>請求漏れ・単価を確認</h3>
        {missingCandidates.map(l=><button className="audit-issue" type="button" key={l.key} onClick={()=>{chooseLine(l.key);setQty(l.qty);}}>候補：{productDisplayName(l.name)} {l.qty}個 ／ {yen(l.amount)} ›</button>)}
        <Field label="請求を確認する商品"><select value={lineKey} onChange={e=>chooseLine(e.target.value)}><option value="">注文・追加購入から選ぶ</option>{lines.filter(l=>l.qty>0).map(l=><option key={l.key} value={l.key}>{l.name}（{l.qty}個・単価 {yen(l.unitPrice)}）</option>)}</select></Field>
        {line&&<div className="missing-charge-editor">
          <Qty label="請求漏れ数量" min={1} max={line.qty} value={qty} onChange={setQty}/>
          {line.unitPrice==null&&<><Money label="確認した請求単価" value={unitPrice} onChange={setUnitPrice}/>{line.candidate!=null&&<small>登録済み商品の単価候補：{line.candidateName} {yen(line.candidate)}。今回の単価か確認してください。</small>}</>}
          <p>単価 {yen(price)} × {qty}個 ＝ <strong>{yen(price==null?null:price*qty)}</strong></p>
          <Button disabled={busy||price==null||line.missingProduct} onClick={async()=>{if(await act(s=>flagMissingCharge(s,round.id,buyer.id,line.key,qty,price),'商品と数量から請求漏れを照合')){setLineKey('');setReason('一部しか受け取っていない');}}}>この商品・数量を請求へ反映</Button>
          {line.unitPrice==null&&!line.missingProduct&&<button type="button" className="text-action" disabled={price==null} onClick={()=>act(s=>confirmLinePrice(s,round.id,line.productId,price),'今回の請求単価を確認')}>単価だけ確認して反映</button>}
          <small>注文に含まれる金額の内訳として記録します。同じ商品を売上へ再加算しません。</small>
        </div>}
        {due.items.length>0&&<><h3>過去未収・追加請求</h3>{due.items.map(x=><div className="collection-item" key={x.id}><span>{x.date} {x.note}</span><strong>{yen(x.balance)}</strong>{x.balance>0&&<button type="button" className="text-action" onClick={()=>{setTarget(x.id);setReceived(x.balance);setReason('一部しか受け取っていない');setInvestigate(false);}}>この未収分を受取額に使う</button>}</div>)}</>}
        <h3>受取・支払済み確認・訂正履歴</h3>
        {history.map(x=><div className="collection-history" key={x.id}><p>{x.date||state.rounds.find(r=>r.id===x.roundId)?.date||round.date} {x.kind==='collectionEntries'?`実際受取 ${yen(x.received)}${x.adjustment?` ／ 過去の調整 ${yen(x.adjustment)}`:''}`:`支払済み確認 ${yen(x.amount)}`} {resolved(x.id)?'（訂正済み・計算対象外）':''}</p><small>{x.note}</small>
          {!resolved(x.id)&&<button type="button" className="text-action" onClick={()=>{setEditEntry(x);setCorrectedCash(x.received==null?null:Math.abs(x.received));setCorrection('');}}>この記録を確認・訂正 ›</button>}</div>)}
        {!history.length&&<small>この回の受取記録はありません。</small>}
        {editEntry&&<div className="fact-confirmation"><p>訂正対象：{editEntry.kind==='collectionEntries'?`受取 ${yen(editEntry.received)}`:`支払済み確認 ${yen(editEntry.amount)}`}</p>
          <Field label="履歴の訂正理由"><select value={correction} onChange={e=>setCorrection(e.target.value)}><option value="">理由を選ぶ</option>{correctionReasons.map(x=><option key={x}>{x}</option>)}</select></Field>
          {editEntry.kind==='collectionEntries'&&<Money label={editEntry.received<0?'訂正後の返金額':'訂正後の実際受取額'} value={correctedCash} onChange={setCorrectedCash}/>}
          <Button disabled={!correction||busy||editEntry.kind==='collectionEntries'&&correctedCash==null} onClick={async()=>{if(await act(s=>{
            correctCollectionRecord(s,editEntry.kind,editEntry.id,correction);
            if(editEntry.kind==='collectionEntries'&&correctedCash!==0){const cash=editEntry.received<0?-correctedCash:correctedCash;receiveCollection(s,{roundId:editEntry.roundId,buyerId:buyer.id,received:cash,reason:cash<0?'返金がある':cash>collectionPosition(s,editEntry.roundId,buyer.id).balance?'多く受け取ったので次回へ預かる':'一部しか受け取っていない'});}
          },'履歴を保持して誤記録を訂正'))setEditEntry(null);}}>対象記録の訂正を保存</Button><button className="text-action" type="button" onClick={()=>setEditEntry(null)}>戻る</button></div>}
        <ReceivableAdjustment round={round} buyer={buyer}/>
        <Field label="調査メモ（任意）"><input value={memo} onChange={e=>setMemo(e.target.value)}/></Field>
        <div className="actions"><Button secondary disabled={received==null||busy} onClick={async()=>{if(await act(s=>saveCollectionCase(s,{roundId:round.id,buyerId:buyer.id,received,reason,pastDate,memo}),'差額を要確認として保留')){setOpen(false);onDone(buyer.id,false);}}}>要確認として保存</Button><button type="button" className="text-action" onClick={()=>setInvestigate(false)}>受取入力へ戻る</button></div>
      </div>}
      <details className="collection-breakdown"><summary>今回請求の内訳</summary>
        <div className="collection-source-totals">{[['個人注文',row?.normal],['販売用の追加購入',row?.onsite],['おやつ',row?.snack]].filter(([,v])=>v>0).map(([label,v])=><div key={label}><span>{label}</span><strong>{yen(v)}</strong></div>)}</div>
        <small>商品分類ごとの内訳（上記請求に含まれます）</small><div className="collection-categories">{Object.entries(row?.categories||{}).filter(([,v])=>v>0).map(([k,v])=><span key={k}>{k} {yen(v)}</span>)}</div>
        <div className="charge-line heading"><span>商品名</span><span>数量</span><span>金額</span></div>
        {lines.map(l=><div className="charge-line" key={l.key}><span>{productDisplayName(l.name)}</span><span>{l.qty}個</span><strong>{yen(l.amount)}</strong></div>)}
        {row?.snack>0&&<p>おやつ {yen(row.snack)}</p>}
      </details>
      <details className="billing-confirm"><summary>集金袋の金額を確認（現金受取前）</summary>
        <Money label="集金袋へ記載する金額" value={bag??audit?.knownBag??audit?.expected??position.current} onChange={setBag}/>
        <Field label="未確定で進める理由（必要な場合）"><select value={exception} onChange={e=>setException(e.target.value)}><option value="">確定した請求として確認</option><option>単価を確認中</option><option>請求内容を照合中</option></select></Field>
        <Button disabled={busy} onClick={()=>act(s=>confirmBilling(s,round.id,buyer.id,bag??audit?.knownBag??audit?.expected??position.current,{exceptionReason:exception}),'請求内容のみ確認・現金受取なし')}>請求内容だけ確認</Button>
        {audit?.review&&<small>{audit.review.status==='confirmed'?'請求内容確認済み':'請求は未確定'} ／ この操作で受取記録は作成しません。</small>}
      </details>
    </div>}
  </section>;
}
export function RoundCollections({round,rows,sessions={},onDraft,onSource,initialFocus=''}){
  const {state,notify}=useApp(),[focus,setFocus]=useState(initialFocus),[exporting,setExporting]=useState(false),[exception,setException]=useState('');
  const audit=billingAudit(state,round.id);
  const ids=new Set([...Object.keys(round.orders),...rows.map(x=>x.id),...(state.collectionEntries||[]).filter(x=>x.roundId===round.id).map(x=>x.buyerId),...(state.collectionReconciliations||[]).filter(x=>x.roundId===round.id).map(x=>x.buyerId)]);
  for(const buyer of state.buyers)if(collectionPosition(state,round.id,buyer.id).carry)ids.add(buyer.id);
  const sorted=[...ids].sort((a,b)=>(state.buyers.find(x=>x.id===a)?.name||'').localeCompare(state.buyers.find(x=>x.id===b)?.name||'','ja'));
  const go=id=>{setFocus(id);requestAnimationFrame(()=>document.getElementById(`collect-${id}`)?.scrollIntoView({block:'start'}));};
  const next=(id,advance=true)=>{const index=sorted.indexOf(id);setFocus('');if(advance){const next=sorted.slice(index+1).find(b=>collectionPosition(state,round.id,b).balance!==0);if(next)go(next);}};
  const unresolved=audit.issues.length>0;
  const exportBills=async()=>{
    if(exporting)return;if(unresolved&&!exception){notify('未確定の請求があります。下の警告から確認してください。');return;}
    setExporting(true);try{await openPrintPreview({kind:'collections',date:round.date,pending:unresolved,bills:sorted.map(id=>{const p=collectionPosition(state,round.id,id),a=audit.buyers.find(x=>x.buyerId===id);return {name:state.buyers.find(x=>x.id===id)?.name,total:Math.max(0,p.current+p.carry-p.confirmedHistorical),lines:a?.lines||[],carry:p.carry,confirmed:p.confirmedHistorical,received:p.received,balance:p.balance,issues:a?.issues||[],reason:exception};})});}catch(e){notify(e.message);}finally{setExporting(false);}
  };
  return <div className="stack collection-list">
    <section className="billing-audit" aria-label="集金前の自動照合"><h3>集金前の確認</h3>
      {unresolved?<><p role="alert">要確認 {audit.issues.length}件</p>{audit.issues.map((x,i)=><button className="audit-issue" type="button" key={i} onClick={()=>go(x.buyerId)}>{x.name}：{x.message} ›</button>)}</>:<p>注文・受取確定数・単価と今回の請求を照合しました。</p>}
      <details><summary>販売用の入荷・割当を照合</summary>{audit.stocks.map(x=><p key={x.stock.id}>{productDisplayName(x.stock.name)}<small>注文 {x.ordered} ／ 入荷 {x.received} ／ 欠品 {x.ordered-x.received} ／ 振替 {x.moved} ／ 販売先確定 {x.assigned} ／ 販売待ち・残り在庫 {x.remaining} ／ 販売済み・購入者未確認 {x.unconfirmed}</small></p>)}</details>
      {unresolved&&<details><summary>例外：未確定の請求表を作る</summary><Field label="未確定の請求表を作る理由"><select value={exception} onChange={e=>setException(e.target.value)}><option value="">理由を選ぶ</option><option>単価を確認中</option><option>請求内容を照合中</option></select></Field><small>「未確定」と理由を明記します。</small></details>}
      <button className="text-action" type="button" disabled={exporting} onClick={exportBills}>集金袋用の請求表を印刷 ›</button>
    </section>
    {sorted.map(id=>{const buyer=state.buyers.find(x=>x.id===id);return buyer&&<BuyerCollection key={id} round={round} buyer={buyer} row={rows.find(x=>x.id===id)} focus={focus} onDone={next} onOpen={go} session={sessions[id]} onDraft={onDraft} onSource={onSource}/>;})}
    <OpeningFacts round={round}/>
  </div>;
}

function OpeningFacts({round}){
 const {state,save}=useApp();const [buyer,setBuyer]=useState(''),[kind,setKind]=useState('opening'),[date,setDate]=useState(''),[amount,setAmount]=useState(null);
 return <details className="opening-register"><summary>過去未収・預かりだけを登録する</summary><small>現金を受け取る前に、過去分だけ記録する場合。</small>
  <Field label="過去分の購入者"><select value={buyer} onChange={e=>setBuyer(e.target.value)}><option value="">購入者を選ぶ</option>{state.buyers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
  <Field label="過去分の区分"><select value={kind} onChange={e=>setKind(e.target.value)}><option value="opening">過去の未収</option><option value="credit">前回の預かり</option></select></Field>
  <Field label="過去分の対象日" type="date" value={date} max={round.date} onChange={e=>setDate(e.target.value)}/><Money label="過去分の金額" value={amount} onChange={setAmount}/>
  <Button disabled={!buyer||!date||date>=round.date||!amount} onClick={async()=>{if(await save(s=>{
   const list=kind==='opening'?(s.receivableItems??=[]):(s.collectionCredits??=[]);
   if(list.some(x=>x.buyerId===buyer&&x.date===date&&x.amount===amount))throw Error('同じ過去分が登録されています。既存の履歴を確認してください');
   list.push(kind==='opening'?{id:uid(),kind:'opening',buyerId:buyer,date,amount,reason:'未払い / 未受取',note:`${date}分 未受取`}:{id:uid(),buyerId:buyer,roundId:round.id,date,amount,reason:'前回の預かり金'});
  },'過去未収・預かりだけを記録')){setAmount(null);setDate('');setBuyer('');}}}>過去分だけ保存</Button>
 </details>;
}

function ReceivableAdjustment({round,buyer}){
 const {save}=useApp();const [amount,setAmount]=useState(null),[reason,setReason]=useState('');
 return <details><summary>例外：債権残高だけを調整する</summary><small>現金を動かさない処理です。商品・請求の誤りは上の商品選択から確認してください。</small>
  <Money signed label="債権の調整額" value={amount} onChange={setAmount}/><Field label="債権調整の理由"><select value={reason} onChange={e=>setReason(e.target.value)}><option value="">理由を選ぶ</option><option>回収しないことが確定した未収</option><option>以前の債権調整を戻す</option></select></Field>
  <Button disabled={!amount||!reason} onClick={async()=>{if(await save(s=>adjustReceivable(s,{roundId:round.id,buyerId:buyer.id,amount,reason}),'現金を動かさず債権を調整')){setAmount(null);setReason('');}}}>債権調整を保存</Button>
 </details>;
}
