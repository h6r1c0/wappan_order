import React,{useState} from 'react';
import {useApp,Button,Field,Money,Qty} from './ui';
import {today,yen} from './domain';
import {saveOtherSale,voidOtherSale} from './other-sales.js';

const empty=(date,test)=>({name:'',date:date||today(),qty:1,unitPrice:null,unitCost:0,paymentStatus:'',note:'',test});
export function OtherSales({round}){
  const {state,save}=useApp();
  const [editing,setEditing]=useState(null);
  const [draft,setDraft]=useState(null);
  const [reason,setReason]=useState('');
  const [error,setError]=useState('');
  const sales=(state.otherSales||[]).filter(x=>!x.void&&x.test===Boolean(round?.test))
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
  return <details className="other-sales"><summary>その他の販売{sales.length?`（${sales.length}件）`:''}</summary>
    <p className="muted">寄付品など、通常の商品マスター・発注に含まれない販売の実績。</p>
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
    {sales.map(x=><div className="other-sale-row" key={x.id}><span>{x.date} {x.name} ×{x.qty}<small>{x.paymentStatus==='paid'?'受取済み':'未受取（個人請求には含めません）'}</small></span>
      <strong>{yen(x.qty*(x.unitPrice-x.unitCost))}</strong><button type="button" className="text-action" onClick={()=>choose(x)}>編集 ›</button></div>)}
  </details>;
}
