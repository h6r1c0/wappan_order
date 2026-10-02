import React, {useState} from 'react';
import {shortageRecipients, fairAllocation, applyShortage, shortageMessage, updateDeliveryStatus} from './shortages';
import {deliveryTotals} from './commerce';
import {useApp, Button, Field, Qty, copyText} from './ui';

export function Shortage({round:r}) {
  const {state,save,notify}=useApp();
  const [productId,setProductId]=useState(''), [received,setReceived]=useState(null);
  const [method,setMethod]=useState('manual'), [allocations,setAllocations]=useState({}), [review,setReview]=useState(false);
  const rows=productId ? shortageRecipients(state,r,productId) : [];
  const ordered=rows.reduce((n,p)=>n+p.qty,0), allocated=rows.reduce((n,p)=>n+(allocations[p.key]||0),0);
  const reset=id=>{setProductId(id);setReceived(null);setAllocations({});setReview(false);setMethod('manual');};
  const valid=received!=null && received<ordered && allocated===received;
  const latest=[...new Map((r.shortages||[]).map(x=>[x.productId,x])).values()];
  return <section className="shortage-check">
    <h3>欠品確認</h3>
    <div className="segmented" role="group" aria-label="欠品確認">
      {[['none','なし'],['yes','あり']].map(([value,label])=><button type="button" key={value}
        aria-pressed={r.shortageConfirmation===value} className={r.shortageConfirmation===value?'selected':''}
        disabled={value==='none' && latest.length>0}
        onClick={()=>save(s=>{const round=s.rounds.find(x=>x.id===r.id);round.shortageConfirmation=value;
          round.shortageReviewComplete=value==='none';updateDeliveryStatus(round);},'欠品確認')}>{label}</button>)}
    </div>
    {!r.shortageConfirmation && <small className="required-check">なし／ありを選んでください</small>}
    {r.shortageConfirmation==='yes' && <div className="shortage-editor">
      <Field label="欠品商品"><select value={productId} onChange={e=>reset(e.target.value)}>
        <option value="">商品を選ぶ</option>{deliveryTotals(state,r).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select></Field>
      {productId && <>
        <div className="shortage-arrival"><span>注文 <strong>{ordered}個</strong></span>
          <Field label="実入荷数"><input aria-label="実入荷数" type="number" inputMode="numeric" min="0" max={ordered-1} step="1" value={received??''}
            onChange={e=>{setReceived(e.target.value===''?null:Math.max(0,Math.min(ordered-1,Math.floor(Number(e.target.value)||0))));setReview(false);setAllocations({});}}/></Field>
          <span>不足 <strong>{received==null?'—':ordered-received}個</strong></span></div>
        {received!=null && <>
          {!review && <div className="segmented" role="group" aria-label="配分方法">
            <button type="button" className={method==='manual'?'selected':''} onClick={()=>setMethod('manual')}>手動で配分</button>
            <button type="button" className={method==='lottery'?'selected':''} onClick={()=>{setMethod('lottery');setAllocations({});}}>公平抽選</button>
          </div>}
          <h4>{review?'配分結果を確認':'実渡し数'}</h4>
          {rows.map(p=><div className="shortage-recipient" key={p.key}><span>{p.name}<small>注文 {p.qty}個</small></span>
            {review ? <strong>{allocations[p.key]||0} / {p.qty}個</strong> :
              method==='manual'||p.kind!=='buyer' ? <Qty label={`${p.name} 実渡し数`} value={allocations[p.key]||0}
                max={Math.min(p.qty,received-allocated+(allocations[p.key]||0))}
                onChange={n=>setAllocations({...allocations,[p.key]:n})}/> : <span>抽選対象</span>}
          </div>)}
          {method==='lottery'&&!review && <Button disabled={allocated>received||received-allocated>rows.filter(p=>p.kind==='buyer').reduce((n,p)=>n+p.qty,0)}
            onClick={()=>{setAllocations({...allocations,...fairAllocation(rows.filter(p=>p.kind==='buyer'),received-allocated)});setReview(true);}}>抽選して結果を確認</Button>}
          {method==='manual'&&!review && <Button disabled={!valid} onClick={()=>setReview(true)}>配分結果を確認</Button>}
          <p className="shortage-total">配分 {allocated}個 ／ 実入荷 {received}個</p>
          {review && <div className="actions"><button type="button" className="text-action" onClick={()=>{setReview(false);setMethod('manual');}}>配分を編集 ›</button>
            <Button disabled={!valid||r.status==='入力中'} onClick={async()=>{
              const complete=Object.fromEntries(rows.map(p=>[p.key,allocations[p.key]||0]));
              if(await save(s=>applyShortage(s,r.id,productId,received,complete,method,rows),'欠品配分を確定'))reset('');
            }}>この配分で確定</Button></div>}
        </>}
      </>}
      {latest.map(record=><details className="shortage-result" key={record.id} open>
        <summary>{record.product.name}　入荷{record.received}／注文{record.ordered}</summary>
        {record.allocations.map(p=><div className="shortage-recipient" key={p.key}><span>{p.name}</span><span>実渡し {p.delivered} ／ 欠品 {p.shortage}</span></div>)}
        <details><summary>欠品連絡文</summary>{record.allocations.filter(p=>p.kind==='buyer'&&p.shortage>0).map(p=><div key={p.key} className="shortage-message">
          <textarea aria-label={`${p.name}への欠品連絡文`} readOnly value={shortageMessage(record,p)}/>
          <button type="button" className="text-action" onClick={async()=>{try{await copyText(shortageMessage(record,p));notify('連絡文をコピーしました');}catch(e){notify(e.message);}}}>コピー</button>
        </div>)}</details>
      </details>)}
      {latest.length>0&&!r.shortageReviewComplete && <Button secondary onClick={()=>save(s=>{const round=s.rounds.find(x=>x.id===r.id);round.shortageReviewComplete=true;updateDeliveryStatus(round);},'欠品確認完了')}>すべての欠品処理を確認</Button>}
    </div>}
  </section>;
}
