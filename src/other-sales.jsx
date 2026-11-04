import React,{useState} from 'react';
import {useApp,Button,Field,Money,Qty,BuyerPicker} from './ui';
import {today,yen,normalize} from './domain';
import {saveOtherSale,voidOtherSale,replaceOtherAllocations,otherAllocationNeedsReason} from './other-sales.js';

const empty=(date,test)=>({name:'',date:date||today(),qty:1,unitPrice:null,unitCost:0,paymentStatus:'',note:'',test});
export function OtherSales({round,query='',showAllocations=true}){
  const {state,save}=useApp();
  const [editing,setEditing]=useState(null);
  const [draft,setDraft]=useState(null);
  const [reason,setReason]=useState('');
  const [error,setError]=useState('');
  const sales=(state.otherSales||[]).filter(x=>!x.void&&x.test===Boolean(round?.test)&&(!round||x.date===round.date)&&normalize(x.name).includes(normalize(query)))
    .sort((a,b)=>b.date.localeCompare(a.date));
  const choose=(item)=>{setEditing(item?.id||null);setDraft(item?structuredClone(item):empty(round?.date,Boolean(round?.test)));setReason('');setError('');};
  const update=change=>setDraft({...draft,...change});
  const submit=async()=>{
    try{
      // Check the draft before initiating a persistent save.
      const probe={otherSales:editing?[structuredClone(sales.find(x=>x.id===editing))]:[]};
      saveOtherSale(probe,draft,{id:editing,reason});setError('');
      if(await save(s=>saveOtherSale(s,draft,{id:editing,reason}),'その他の販売を保存')){setDraft(null);setEditing(null);}
    }catch(e){setError(e.message);}
  };
  return <details className="other-sales"><summary>その他の商品を登録・編集{sales.length?`（${sales.length}件）`:''}</summary>
    <p className="muted">この回だけ扱う商品を登録します。購入者への割当は上の商品一覧から選べます。</p>
    <button type="button" className="text-action" onClick={()=>choose(null)}>＋ 販売を記録</button>
    {draft&&<div className="other-sales-form">
      <Field label="商品名・内容"><input value={draft.name} onChange={e=>update({name:e.target.value})} placeholder="例：提供されたレモン"/></Field>
      <Field label="販売日"><input type="date" value={draft.date} onChange={e=>update({date:e.target.value})}/></Field>
      <Qty label="販売数量" value={draft.qty} min={0} onChange={qty=>update({qty})}/>
      <Money label="販売単価" value={draft.unitPrice} onChange={unitPrice=>update({unitPrice})}/>
      <Money label="1個あたり原価" value={draft.unitCost} onChange={unitCost=>update({unitCost})}/>
      <Field label="現金の受取状況"><select value={draft.paymentStatus} onChange={e=>update({paymentStatus:e.target.value})}>
        <option value="">選択してください</option><option value="paid">受取済み</option><option value="unpaid">未受取</option>
      </select></Field>
      <Field label="メモ（任意）"><input value={draft.note||''} onChange={e=>update({note:e.target.value})}/></Field>
      {draft.qty>0&&draft.unitPrice!=null&&draft.unitCost!=null&&<p>売上 {yen(draft.qty*draft.unitPrice)} ／ 原価 {yen(draft.qty*draft.unitCost)} ／ 利益 {yen(draft.qty*(draft.unitPrice-draft.unitCost))}</p>}
      {editing&&<Field label="訂正・取消の理由"><input value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
      {error&&<p role="alert" className="notice">{error}</p>}
      <div className="actions"><Button onClick={submit}>保存</Button><button type="button" className="text-action" onClick={()=>setDraft(null)}>閉じる</button>
        {editing&&<button type="button" className="text-action" disabled={!reason.trim()} onClick={async()=>{
          if(confirm('この販売実績を取り消しますか？')&&await save(s=>voidOtherSale(s,editing,reason),'その他の販売を取消'))setDraft(null);
        }}>記録を取り消す</button>}</div>
    </div>}
    {sales.map(x=><div className="other-sale-row" key={x.id}><span>{x.date} {x.name} ×{x.qty}<small>{x.paymentStatus==='paid'?'受取済み':'個人請求へ割当 '+(x.allocations||[]).reduce((n,a)=>n+a.qty,0)+'個 ／ 割当待ち '+(x.qty-(x.allocations||[]).reduce((n,a)=>n+a.qty,0))+'個'}</small></span>
      <strong>{yen(x.qty*(x.unitPrice-x.unitCost))}</strong><button type="button" className="text-action" onClick={()=>choose(x)}>編集 ›</button>
      {showAllocations&&x.paymentStatus==='unpaid'&&round&&<OtherAllocation key={x.id} sale={x} round={round}/>}</div>)}
  </details>;
}

function OtherAllocation({sale,round}){
  const {state,save}=useApp(),[rows,setRows]=useState(()=>structuredClone(sale.allocations||[]));
  const [buyerId,setBuyerId]=useState(''),[qty,setQty]=useState(1),[reason,setReason]=useState(''),[error,setError]=useState(''),[saved,setSaved]=useState('');
  const count=rows.reduce((n,x)=>n+x.qty,0);
  return <details className="other-allocation"><summary>購入者へ割り当てる</summary>
    <p>{sale.name}：割当済み {count}個 ／ 残り {sale.qty-count}個。売上は販売実績に一度だけ計上します。</p>
    {rows.map(x=><div className="snack-billing-row" key={x.buyerId}>
      <span>{state.buyers.find(b=>b.id===x.buyerId)?.name}</span>
      <Qty label={`${sale.name} ${state.buyers.find(b=>b.id===x.buyerId)?.name}の数量`} min={0} max={sale.qty} value={x.qty} onChange={n=>{setRows(n?rows.map(a=>a===x?{...a,qty:n}:a):rows.filter(a=>a!==x));setSaved('');}}/>
    </div>)}
    <BuyerPicker key={rows.length} value={buyerId} onChange={setBuyerId} includeTest={round.test}/>
    {buyerId&&<div className="snack-billing-row"><Qty label="追加する数量" min={1} max={sale.qty-count+(rows.find(x=>x.buyerId===buyerId)?.qty||0)} value={qty} onChange={setQty}/>
      <Button secondary onClick={()=>{setRows([...rows.filter(x=>x.buyerId!==buyerId),{buyerId,qty,chargeRoundId:round.id}]);setBuyerId('');setQty(1);setSaved('');}}>この購入者を追加</Button></div>}
    {count>sale.qty&&<p role="alert">販売済み数量を{count-sale.qty}個超えています。</p>}
    {otherAllocationNeedsReason(sale,rows)&&<Field label="割当を訂正する理由"><input value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
    {error&&<p className="notice" role="alert">{error}</p>}{saved&&<p role="status">{saved}</p>}
    <Button disabled={count>sale.qty||otherAllocationNeedsReason(sale,rows)&&!reason.trim()||JSON.stringify(rows)===JSON.stringify(sale.allocations||[])} onClick={async()=>{
      try{const probe=structuredClone(state);replaceOtherAllocations(probe,sale.id,rows,reason||'購入者へ割当');setError('');
        if(await save(s=>replaceOtherAllocations(s,sale.id,rows,reason||'購入者へ割当'),'その他商品を個人請求へ割当')){setSaved('個人請求への割当を保存しました。');setReason('');}}
      catch(e){setError(e.message);}
    }}>この購入者への割当をまとめて保存</Button>
  </details>;
}
