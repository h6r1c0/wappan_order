import React,{useState,useRef,useEffect} from 'react';
import {collectionPosition,collectionDueItems,today,uid,yen,collections} from './domain';
import {useApp,Button,Field,Money,Qty,copyText,buyerCompare} from './ui';
import {productDisplayName} from './product-names.js';
import {billingAudit,chargeLines,collectionReasons,correctionReasons,confirmBilling,confirmLinePrice,flagMissingCharge,saveCollectionCase,receiveCollection,receiveDueItem,correctCollectionRecord,recordCollectionAllocation,recordHistoricalCredit,adjustReceivable} from './collection-workflow.js';
import {openPrintPreview} from './print-preview.js';

function BuyerCollection({round,buyer,row,focus,onDone,onOpen,session,onDraft,onSource}){
  const {state,save}=useApp();
  const audit=billingAudit(state,round.id).buyers.find(x=>x.buyerId===buyer.id);
  const position=collectionPosition(state,round.id,buyer.id),due=collectionDueItems(state,round.id,buyer.id);
  const pending=(state.collectionCases||[]).find(x=>x.roundId===round.id&&x.buyerId===buyer.id&&x.status==='pending');
  const knownClaim=(state.receivableItems||[]).find(x=>x.kind==='additional'&&x.roundId===round.id&&x.buyerId===buyer.id&&x.reason==='商品請求漏れ');
  const [open,setOpen]=useState(false),[received,setReceived]=useState(session?.received??pending?.received??null),[reason,setReason]=useState(session?.reason||pending?.reason||(knownClaim&&!position.received?'一部しか受け取っていない':''));
  const [pastDate,setPastDate]=useState(session?.pastDate||pending?.pastDate||new Date(Date.parse(round.date)-86400000).toISOString().slice(0,10));
  const [investigate,setInvestigate]=useState(false),[bag,setBag]=useState(null),[exception,setException]=useState('');
  const [lineKey,setLineKey]=useState(''),[qty,setQty]=useState(1),[unitPrice,setUnitPrice]=useState(null),[correction,setCorrection]=useState('');
  const [memo,setMemo]=useState(session?.memo||pending?.memo||''),[busy,setBusy]=useState(false),[editEntry,setEditEntry]=useState(null),[correctedCash,setCorrectedCash]=useState(null),[refund,setRefund]=useState(null),[target,setTarget]=useState(session?.target||'');
  const [allocationEntry,setAllocationEntry]=useState(null),[allocationAmounts,setAllocationAmounts]=useState({});
  const request=useRef(uid());
  useEffect(()=>{if(allocationEntry)requestAnimationFrame(()=>document.querySelector(`#collect-${buyer.id} .allocation-confirmation`)?.scrollIntoView({block:"nearest"}));},[allocationEntry,buyer.id]);
  useEffect(()=>{onDraft?.(buyer.id,{received,reason,pastDate,memo,target});},[received,reason,pastDate,memo,target,buyer.id]);
  const isOpen=focus===buyer.id;
  const lines=chargeLines(state,round.id,buyer.id),line=lines.find(x=>x.key===lineKey);
  const price=line?.unitPrice??unitPrice;
  const missingCandidates=lines.filter(l=>l.qty>0&&(l.unitPrice==null||audit?.knownBag!=null&&l.amount===position.current-audit.knownBag));
  const delta=received==null?null:received-position.balance;
  const knownDestination=knownClaim?.notifiedAmount===received?due.items.filter(x=>x.kind==='round'&&x.roundId===round.id&&x.balance===received):[];
  const receiptTarget=target||((knownDestination.length===1&&knownClaim?.amount===position.current-received)?knownDestination[0].id:'');
  const missingPast=reason===collectionReasons[0]&&delta>0?delta:reason===collectionReasons[1]&&delta<0?-delta:0;
  const dueOptions=due.items.filter(x=>x.balance>0);
  const knownQuick=position.balance>0&&!position.unallocated&&!pending&&!audit?.issues.length&&dueOptions.length>0;
  const currentDue=dueOptions.filter(x=>x.roundId===round.id);
  const pastDue=dueOptions.filter(x=>x.roundId!==round.id);
  const singleQuick=knownQuick&&dueOptions.length===1&&!(position.received===0&&audit?.knownBag!=null&&audit.knownBag!==audit.expected);
  const separateQuick=knownQuick&&currentDue.length===1&&pastDue.length===1;
  const act=async(fn,description)=>{if(busy)return false;setBusy(true);try{return await save(fn,description);}finally{setBusy(false);}};
  const afterSave=()=>{setReceived(null);setReason('');setOpen(false);setInvestigate(false);request.current=uid();onDone(buyer.id);};
  const chooseLine=key=>{setLineKey(key);setQty(1);const l=lines.find(x=>x.key===key);setUnitPrice(l?.unitPrice??l?.candidate??null);};
  const historyRounds=state.rounds.filter(r=>(r.test===round.test||r.collectionLive)&&r.date<=round.date).map(r=>r.id);
  const history=[...(state.collectionEntries||[]).filter(x=>historyRounds.includes(x.roundId)&&x.buyerId===buyer.id).map(x=>({...x,kind:'collectionEntries'})),
    ...(state.collectionReconciliations||[]).filter(x=>historyRounds.includes(x.roundId)&&x.buyerId===buyer.id).map(x=>({...x,kind:'collectionReconciliations'}))];
  const resolved=id=>(state.collectionCorrections||[]).some(x=>x.targetId===id);
  const unallocatedEntries=history.filter(x=>x.kind==='collectionEntries'&&x.received>0&&!x.itemId&&!resolved(x.id)&&!(state.collectionAllocations||[]).some(a=>a.entryId===x.id));
  const allocationMatch=x=>collectionDueItems({...state,collectionEntries:(state.collectionEntries||[]).filter(e=>e.id!==x.id)},x.roundId,buyer.id).items.filter(i=>i.balance>=x.received&&i.amount===x.received);
  const beginAllocation=x=>{
    const options=allocationMatch(x);
    setAllocationEntry(x);setAllocationAmounts(options.length===1?{[options[0].id]:x.received}:{});
  };
  const priceUnknown=audit?.issues.some(x=>x.type==='price'||x.type==='missing-product');
  const entryAmount=priceUnknown?null:position.balance>0?position.balance:position.balance<0?-position.balance:position.received;
  const entryStatus=priceUnknown?'請求未確定':position.balance>0?'集金予定':position.balance<0?'預かり':position.received?'受取済み':'集金不要';
  const context=pending?'差額を確認中':audit?.issues.length?'請求を確認':position.received>0&&position.balance>0?`一部受取 ${yen(position.received)}`:knownClaim?.notifiedAmount!=null?`案内済み ${yen(knownClaim.notifiedAmount)}と請求額に差があります`:position.carry>0?`前回未収 ${yen(position.carry)}を含む`:position.carry<0?`預かり ${yen(-position.carry)}を充当`:'';
  const allocationOptions=allocationEntry?collectionDueItems({...state,collectionEntries:(state.collectionEntries||[]).filter(x=>x.id!==allocationEntry.id)},allocationEntry.roundId,buyer.id).items.filter(x=>x.balance>0):[];
  const splitTotal=Object.values(allocationAmounts).reduce((n,v)=>n+(Number(v)||0),0);
  return <section className="collection-entry" id={`collect-${buyer.id}`} data-buyer={buyer.id}>
    <div className="collection-overview">
      <button type="button" className="collection-open" aria-expanded={isOpen} aria-label={`${buyer.name}、${entryStatus} ${priceUnknown?'':yen(entryAmount)}。請求・受取の詳細を${isOpen?'閉じる':'開く'}`} onClick={()=>{if(isOpen)onDone(buyer.id,false);else onOpen(buyer.id);}}>
        <strong className="collection-buyer-name">{buyer.name}</strong><span className="collection-amount">{position.balance<=0&&!priceUnknown&&<small>{entryStatus}</small>}<strong>{priceUnknown?'金額未確定':yen(entryAmount)}</strong></span><span className="collection-chevron" aria-hidden="true">{isOpen?'⌄':'›'}</span>
      </button>
      {singleQuick&&<Button className="collection-pay" disabled={busy} onClick={async()=>{if(await act(s=>receiveDueItem(s,round.id,buyer.id,dueOptions[0].id),'請求分を受取'))afterSave();}}>{dueOptions[0].roundId===round.id?'全額受取':'未収分受取'}</Button>}
      {separateQuick&&<><Button className="collection-pay" disabled={busy} onClick={async()=>{if(await act(s=>receiveDueItem(s,round.id,buyer.id,currentDue[0].id),'今回分を受取'))afterSave();}}>今回分受取</Button><Button className="collection-pay" disabled={busy} onClick={async()=>{if(await act(s=>receiveDueItem(s,round.id,buyer.id,pastDue[0].id),'未収分を受取'))afterSave();}}>未収分受取</Button></>}
    </div>
    {!isOpen&&context&&<small className={`collection-context ${pending||audit?.issues.length?'needs-check':''}`}>{context}</small>}
    {isOpen&&knownClaim&&<p className="collection-alert">請求漏れ：{productDisplayName(knownClaim.note?.replace(/\s*×.*$/u,'')||'商品')} {knownClaim.qty||''}点 ／ {yen(knownClaim.amount)}{!position.received&&<small>案内済み {yen(knownClaim.notifiedAmount)} ／ 現金は未受取</small>}</p>}
    {isOpen&&!!position.confirmedHistorical&&<p className="collection-alert">過去の支払済み確認 {yen(position.confirmedHistorical)}<small>現金の受取記録とは別の確認です。履歴から内容を調べられます。</small></p>}
    {isOpen&&audit?.issues.map((x,i)=><p className="collection-alert" key={i}>{x.message}</p>)}
    {isOpen&&position.unallocated>0&&<p className="collection-alert">充当先未確認：受取済み {yen(position.unallocated)}{unallocatedEntries.length===1&&allocationMatch(unallocatedEntries[0]).length===1
      ?<button type="button" className="text-action" disabled={busy} onClick={()=>act(s=>recordCollectionAllocation(s,unallocatedEntries[0].id,[{itemId:allocationMatch(unallocatedEntries[0])[0].id,amount:unallocatedEntries[0].received}]),'保存済み受取の充当先を確認')}>{allocationMatch(unallocatedEntries[0])[0].date}分への充当を確認（現金は追加しません）</button>
      :unallocatedEntries.length===1&&<button type="button" className="text-action" onClick={()=>{setInvestigate(true);beginAllocation(unallocatedEntries[0]);}}>受け取った請求分を指定 ›</button>}</p>}
    {isOpen&&<div className="collection-detail">
      <div className="collection-totals"><div><small>今回請求</small><strong>{yen(position.current)}</strong></div>{position.carry!==0&&<div><small>過去未収・預かり</small><strong>{yen(position.carry)}</strong></div>}{position.received>0&&<div><small>受取済み</small><strong>{yen(position.received)}</strong></div>}</div>
      {position.availableCredit>0&&position.received===0&&<button type="button" className="text-action" onClick={()=>{setReceived(0);setReason('返金がある');setRefund(position.availableCredit);}}>預かり金を返金した場合はこちら ›</button>}
      {knownClaim?.notifiedAmount!=null&&!position.received&&received==null&&<button type="button" className="text-action" onClick={()=>setReceived(knownClaim.notifiedAmount)}>案内した {yen(knownClaim.notifiedAmount)} を受取額に入力 ›</button>}
      {reason!=='返金がある'&&<Money label="実際受取額" value={received} onChange={v=>{setReceived(v);setTarget('');}}/>}
      {delta!=null&&<p className="receipt-difference" role="status">{delta===0?'請求残高と一致':`請求残高との差 ${delta>0?'＋':'−'}${yen(Math.abs(delta))}`}{position.received?` ／ 記録済み受取 ${yen(position.received)}`:''}</p>}
      {received>0&&due.items.length>1&&received<position.balance&&<Field label="どの請求分を受け取りましたか"><select value={receiptTarget} onChange={e=>setTarget(e.target.value)}><option value="">充当先を確認して選ぶ</option>{due.items.filter(x=>x.balance>=received).map(x=><option key={x.id} value={x.id}>{x.date} {x.note}（未収 {yen(x.balance)}）</option>)}</select></Field>}
      {received>0&&due.items.length>1&&received<position.balance&&!receiptTarget&&<small>複数の請求をまとめた受取や充当先が不明な場合は、下の履歴から調べて「要確認」で保留できます。</small>}
      {received!=null&&(delta!==0||received<0)&&<Field label="金額が違う理由"><select value={reason} onChange={e=>{setReason(e.target.value);if(e.target.value==='返金がある')setReceived(0);if([collectionReasons[2],collectionReasons[6]].includes(e.target.value))setInvestigate(true);}}><option value="">理由を選んでください</option>{collectionReasons.map(x=><option key={x}>{x}</option>)}</select></Field>}
      {reason==='返金がある'&&<Money label="返金額" value={refund??Math.max(0,-position.balance)} onChange={setRefund}/>}
      {!!missingPast&&<div className="fact-confirmation"><p>{reason===collectionReasons[0]?'未登録の前回不足':'未登録の前回預かり'}候補：{yen(missingPast)}</p><Field label="前回分の対象日" type="date" value={pastDate} max={round.date} onChange={e=>setPastDate(e.target.value)}/><small>確認して受取を保存すると、前回分も一緒に記録します。登録済みの分は残高へ反映済みです。</small></div>}
      <div className="actions"><Button disabled={busy||received==null||(reason==='返金がある'?(refund??Math.max(0,-position.balance))<=0:received<=0)||delta!==0&&!reason||reason===collectionReasons[6]||received>0&&due.items.length>1&&received<position.balance&&!receiptTarget||audit?.lines.some(l=>l.qty>0&&(l.unitPrice==null||l.missingProduct))}
        onClick={async()=>{if(await act(s=>receiveCollection(s,{roundId:round.id,buyerId:buyer.id,received:reason==='返金がある'?-(refund??Math.max(0,-position.balance)):received,reason,pastAmount:missingPast,pastDate,requestId:request.current,caseId:pending?.id,itemId:receiptTarget}),'実際の受取と差額理由を保存'))afterSave();}}>{reason==='返金がある'?'返金を保存':'受取額を保存'}</Button>
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
        {due.items.some(x=>x.balance>0)&&<><h3>請求別の残額{due.unallocated>0?'（充当先未確認分を含む）':''}</h3>{due.items.filter(x=>x.balance>0).map(x=><div className="collection-item" key={x.id}><span>{x.date} {x.note}</span><strong>{yen(x.balance)}</strong>{!due.unallocated&&<button type="button" className="text-action" onClick={()=>{setTarget(x.id);setReceived(x.balance);setReason('一部しか受け取っていない');setInvestigate(false);}}>この未収分を受取額に使う</button>}</div>)}</>}
        <h3>受取・支払済み確認・訂正履歴</h3>
        {history.map(x=><div className="collection-history" key={x.id}><p>{x.date||state.rounds.find(r=>r.id===x.roundId)?.date||round.date} {x.kind==='collectionEntries'?`実際受取 ${yen(x.received)}${x.adjustment?` ／ 過去の調整 ${yen(x.adjustment)}`:''}`:`支払済み確認 ${yen(x.amount)}`} {resolved(x.id)?'（訂正済み・計算対象外）':''}</p><small>{x.note}</small>
          {x.kind==='collectionEntries'&&x.received>0&&!resolved(x.id)&&<><small>{(state.collectionAllocations||[]).find(a=>a.entryId===x.id)?.parts.map(p=>`${p.itemId.startsWith('round:')?state.rounds.find(r=>p.itemId.includes(r.id))?.date||'今回':(state.receivableItems||[]).find(i=>i.id===p.itemId)?.date||'過去'} ${yen(p.amount)}`).join(' ／ ')||(x.itemId?'充当先確認済み':'充当先の確認記録なし')}</small>{!x.itemId&&!(state.collectionAllocations||[]).some(a=>a.entryId===x.id)&&<button type="button" className="text-action" onClick={()=>beginAllocation(x)}>受け取った請求分を指定 ›</button>}</>}
          {!resolved(x.id)&&<button type="button" className="text-action" onClick={()=>{setEditEntry(x);setCorrectedCash(x.received==null?null:Math.abs(x.received));setCorrection('');}}>この記録を確認・訂正 ›</button>}</div>)}
        {!history.length&&<small>この回の受取記録はありません。</small>}
        {allocationEntry&&<div className="fact-confirmation allocation-confirmation"><p>受取 {yen(allocationEntry.received)} の充当先</p>{allocationOptions.map(x=><Money key={x.id} label={`${x.date} ${x.note}（未収 ${yen(x.balance)}）`} value={allocationAmounts[x.id]??null} onChange={v=>setAllocationAmounts(a=>({...a,[x.id]:v}))}/>)}<small>候補が入っている場合も、対象の請求分を確認して保存してください。充当額の合計 {yen(splitTotal)}。現金受取記録は変更しません。</small><Button disabled={busy||splitTotal!==allocationEntry.received} onClick={async()=>{if(await act(s=>recordCollectionAllocation(s,allocationEntry.id,Object.entries(allocationAmounts).filter(([,v])=>v>0).map(([itemId,amount])=>({itemId,amount}))), '受取の充当先を保存')){setAllocationEntry(null);setAllocationAmounts({});}}}>充当先を保存</Button><button type="button" className="text-action" onClick={()=>setAllocationEntry(null)}>戻る</button></div>}
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
      {isOpen&&<OpeningFacts round={round} buyer={buyer}/>}
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
        {audit?.review&&<small>{audit.complete?'請求内容確認済み':'請求は未確定'} ／ この操作で受取記録は作成しません。</small>}
      </details>
    </div>}
  </section>;
}
export function RoundCollections({round,rows,sessions={},onDraft,onSource,initialFocus=''}){
  const {state,notify}=useApp(),[focus,setFocus]=useState(initialFocus),[exporting,setExporting]=useState(false),[exception,setException]=useState('');
  const audit=billingAudit(state,round.id);
  const ids=new Set(state.buyers.map(x=>x.id));
  for(const buyer of state.buyers)if(collectionPosition(state,round.id,buyer.id).carry)ids.add(buyer.id);
  const sorted=[...ids].sort((a,b)=>buyerCompare(state.buyers.find(x=>x.id===a)||{name:a},state.buyers.find(x=>x.id===b)||{name:b}));
  const needsAttention=id=>collectionPosition(state,round.id,id).balance>0||audit.buyers.some(b=>b.buyerId===id&&b.issues.length)||
    (state.collectionCases||[]).some(c=>c.roundId===round.id&&c.buyerId===id&&c.status==='pending');
  const activeIds=sorted.filter(needsAttention),settledIds=sorted.filter(id=>!needsAttention(id));
  const go=id=>{setFocus(id);requestAnimationFrame(()=>document.getElementById(`collect-${id}`)?.scrollIntoView({block:'start'}));};
  const next=(id,advance=true)=>{const index=sorted.indexOf(id);setFocus('');if(advance){const following=sorted.slice(index+1).find(needsAttention);if(following)requestAnimationFrame(()=>document.getElementById(`collect-${following}`)?.scrollIntoView({block:'nearest'}));}};
  const unresolved=audit.issues.length>0;
  const exportBills=async()=>{
    if(exporting)return;if(unresolved&&!exception){notify('未確定の請求があります。下の警告から確認してください。');return;}
    setExporting(true);try{await openPrintPreview({kind:'collections',date:round.date,pending:unresolved,bills:sorted.map(id=>{const p=collectionPosition(state,round.id,id),a=audit.buyers.find(x=>x.buyerId===id);return {name:state.buyers.find(x=>x.id===id)?.name,total:Math.max(0,p.current+p.carry-p.confirmedHistorical),lines:a?.lines||[],carry:p.carry,confirmed:p.confirmedHistorical,received:p.received,balance:p.balance,issues:a?.issues||[],reason:exception};})});}catch(e){notify(e.message);}finally{setExporting(false);}
  };
  const auditDetails=<>
    <details><summary>販売用の入荷・割当を照合</summary>{audit.stocks.map(x=><p key={x.stock.id}>{productDisplayName(x.stock.name)}<small>注文 {x.ordered} ／ 入荷 {x.received} ／ 欠品 {x.ordered-x.received} ／ 振替 {x.moved} ／ 販売先確定 {x.assigned} ／ 販売待ち・残り在庫 {x.remaining} ／ 販売済み・購入者未確認 {x.unconfirmed}</small></p>)}</details>
    {unresolved&&<details><summary>例外：未確定の請求表を作る</summary><Field label="未確定の請求表を作る理由"><select value={exception} onChange={e=>setException(e.target.value)}><option value="">理由を選ぶ</option><option>単価を確認中</option><option>請求内容を照合中</option></select></Field><small>「未確定」と理由を明記します。</small></details>}
    <details className="collection-print"><summary>集金袋に記入する金額の一覧を印刷{unresolved?'（請求未確定）':''}</summary>{unresolved&&<small>未確定の請求があります。警告から確認するか、例外理由を選ぶと未確定と明記した一覧を作れます。</small>}<button className="text-action" type="button" disabled={exporting||unresolved&&!exception} onClick={exportBills}>金額一覧のPDFを開く ›</button></details>
  </>;
  return <div className="stack collection-list">
    {unresolved?<section className="billing-audit" aria-label="集金前の自動照合"><h3>集金前の確認</h3><p role="alert">要確認 {audit.issues.length}件</p>{audit.issues.map((x,i)=><button className="audit-issue" type="button" key={i} onClick={()=>go(x.buyerId)}>{x.name}：{x.message} ›</button>)}{auditDetails}</section>
      :<details className="billing-audit billing-audit-done" aria-label="集金前の自動照合"><summary>請求照合済み <span>販売用・印刷 ›</span></summary><p>注文・受取確定数・単価を照合しました。</p>{auditDetails}</details>}
    <div className="collection-list-heading"><strong>{activeIds.length===sorted.filter(id=>collectionPosition(state,round.id,id).balance>0).length?'未受取':'未受取・要確認'} {activeIds.length}人</strong><small>集金予定額</small></div>
    {activeIds.map(id=>{const buyer=state.buyers.find(x=>x.id===id);return buyer&&<BuyerCollection key={id} round={round} buyer={buyer} row={rows.find(x=>x.id===id)} focus={focus} onDone={next} onOpen={go} session={sessions[id]} onDraft={onDraft} onSource={onSource}/>;})}
    <details className="collection-completed"><summary>受取済み・過去分の登録（{settledIds.length}人）</summary>
      {settledIds.map(id=>{const buyer=state.buyers.find(x=>x.id===id);return buyer&&<BuyerCollection key={id} round={round} buyer={buyer} row={rows.find(x=>x.id===id)} focus={focus} onDone={next} onOpen={go} session={sessions[id]} onDraft={onDraft} onSource={onSource}/>;})}</details>
  </div>;
}

function OpeningFacts({round,buyer}){
 const {save,state}=useApp();const [kind,setKind]=useState('opening'),[date,setDate]=useState(''),[amount,setAmount]=useState(null);
 const credits=(state.collectionCredits||[]).filter(x=>x.buyerId===buyer.id&&x.roundId===round.id);
 return <details className="opening-register"><summary>過去未収・預かりを登録</summary>
  {credits.map(x=><p key={x.id}>預かり {yen(x.amount)} ／ {x.appliedTo?'今回請求へ充当済み':'充当先を確認'}{x.date?`（${x.date}分）`:'（元の受取日不明）'}</p>)}
  <Field label="過去分の区分"><select value={kind} onChange={e=>setKind(e.target.value)}><option value="opening">過去の未収</option><option value="credit">前回の預かり</option></select></Field>
  <Field label={kind==='credit'?'元の受取日（不明なら空欄）':'過去分の対象日'} type="date" value={date} max={round.date} onChange={e=>setDate(e.target.value)}/><Money label="過去分の金額" value={amount} onChange={setAmount}/>
  {kind==='credit'&&!date&&<small>今回請求への充当として記録します。今回の現金受取は作りません。</small>}
  <Button disabled={(kind==='opening'&&!date)||!!date&&date>=round.date||!amount} onClick={async()=>{if(await save(s=>{
   if(kind==='credit'&&!date){recordHistoricalCredit(s,{roundId:round.id,buyerId:buyer.id,amount,appliedTo:`round:${round.id}:${buyer.id}`});return;}
   const list=kind==='opening'?(s.receivableItems??=[]):(s.collectionCredits??=[]);
   if(list.some(x=>x.buyerId===buyer.id&&x.date===date&&x.amount===amount))throw Error('同じ過去分が登録されています。既存の履歴を確認してください');
   list.push(kind==='opening'?{id:uid(),kind:'opening',buyerId:buyer.id,date,amount,reason:'未払い / 未受取',note:`${date}分 未受取`}:{id:uid(),buyerId:buyer.id,roundId:round.id,date,amount,reason:'前回の預かり金'});
  },'過去未収・預かりを記録')){setAmount(null);setDate('');}}}>保存</Button>
 </details>;
}

function ReceivableAdjustment({round,buyer}){
 const {save}=useApp();const [amount,setAmount]=useState(null),[reason,setReason]=useState('');
 return <details><summary>例外：債権残高だけを調整する</summary><small>現金を動かさない処理です。商品・請求の誤りは上の商品選択から確認してください。</small>
  <Money signed label="債権の調整額" value={amount} onChange={setAmount}/><Field label="債権調整の理由"><select value={reason} onChange={e=>setReason(e.target.value)}><option value="">理由を選ぶ</option><option>回収しないことが確定した未収</option><option>以前の債権調整を戻す</option></select></Field>
  <Button disabled={!amount||!reason} onClick={async()=>{if(await save(s=>adjustReceivable(s,{roundId:round.id,buyerId:buyer.id,amount,reason}),'現金を動かさず債権を調整')){setAmount(null);setReason('');}}}>債権調整を保存</Button>
 </details>;
}
