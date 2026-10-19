import React,{useState} from 'react';
import {useApp,Button,Field,Money,Qty} from './ui';
import {yen} from './domain';
import {replaceSnackBilling,snackBillingPreview,suggestedSnackPrice,snackGroupTarget} from './snack-billing.js';
import {receivedQuantity} from './shortages.js';

export function SnackBilling({event}){
  const {state,save}=useApp();
  const [draft,setDraft]=useState(()=>structuredClone(event.billing||{label:'',fiscal:[],household:[],groups:[]}));
  const [reason,setReason]=useState('');
  const [open,setOpen]=useState(false);
  const fiscalQty=id=>draft.fiscal.find(x=>x.lineId===id)?.qty||0;
  const updateFiscal=(lineId,qty)=>setDraft({...draft,fiscal:[...draft.fiscal.filter(x=>x.lineId!==lineId),{lineId,qty}]});
  const updateHousehold=(index,change)=>setDraft({...draft,household:draft.household.map((x,i)=>i===index?{...x,...change}:x)});
  const suggestion=lineId=>suggestedSnackPrice(lineId
    ? [event.lines.find(l=>l.id===lineId)?.cost]
    : event.lines.map(l=>l.cost));
  const groups=draft.groups||[];
  const addGroup=()=>{
    const id=crypto.randomUUID();
    setDraft({...draft,groups:[...groups,{id,label:'大人用おやつ',lineIds:[],unitPrice:null}]});
  };
  const updateGroup=(id,change)=>setDraft({...draft,groups:groups.map(g=>g.id===id?{...g,...change}:g),
    household:change.unitPrice==null?draft.household:draft.household.map(x=>x.groupId===id?{...x,unitPrice:change.unitPrice}:x)});
  const toggleBuyer=(group,buyerId)=>{
    const existing=draft.household.find(x=>x.groupId===group.id&&x.buyerId===buyerId);
    setDraft({...draft,household:existing?draft.household.filter(x=>x!==existing):
      [...draft.household,{buyerId,groupId:group.id,lineId:null,qty:1,unitPrice:group.unitPrice}]});
  };
  const preview=(()=>{try{return {value:snackBillingPreview(state,event,draft),error:''};}catch(e){return {value:null,error:e.message};}})();
  const dirty=JSON.stringify(draft)!==JSON.stringify(event.billing||{label:'',fiscal:[],household:[],groups:[]});
  const hasClaim=draft.fiscal.some(x=>x.qty>0)||draft.household.length>0;
  const prior=event.billing;
  return <details className="snack-billing" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>請求先を分ける{prior?'（登録済み）':''}</summary>
    <div className="snack-billing-body">
      <Field label="行事・おやつ名"><input value={draft.label} placeholder="例：運動会リハのおやつ" onChange={e=>setDraft({...draft,label:e.target.value})}/></Field>
      <h4>職員分を財政へ</h4>
      {event.lines.map(line=><div className="snack-billing-row" key={line.id}>
        <span>{line.name}<small>原価 {yen(line.cost)}</small></span>
        <Qty label={`${line.name} 財政請求数`} value={fiscalQty(line.id)} max={receivedQuantity(line)} onChange={n=>updateFiscal(line.id,n)}/>
      </div>)}
      <div className="section-head"><h4>共通単価でまとめる</h4><button type="button" className="text-action" onClick={addGroup}>＋ グループ</button></div>
      {groups.map(group=>{
        let target=null;
        try{target=snackGroupTarget(state,event,draft,group);}catch{ /* selecting products */ }
        const summary=preview.value?.groups?.find(x=>x.id===group.id);
        const selected=new Set(draft.household.filter(x=>x.groupId===group.id).map(x=>x.buyerId));
        return <section className="snack-group" key={group.id}>
          <div className="section-head"><Field label="請求名"><input value={group.label} onChange={e=>updateGroup(group.id,{label:e.target.value})}/></Field>
            <button type="button" className="text-action" onClick={()=>setDraft({...draft,groups:groups.filter(g=>g.id!==group.id),household:draft.household.filter(x=>x.groupId!==group.id)})}>削除</button></div>
          <small>共通単価の対象商品</small>
          <div className="snack-group-products">{event.lines.map(line=><label key={line.id}><input type="checkbox" checked={group.lineIds.includes(line.id)} disabled={!group.lineIds.includes(line.id)&&groups.some(g=>g.id!==group.id&&g.lineIds.includes(line.id))} onChange={e=>{
            const lineIds=e.target.checked?[...group.lineIds,line.id]:group.lineIds.filter(id=>id!==line.id);
            updateGroup(group.id,{lineIds,unitPrice:suggestedSnackPrice(event.lines.filter(l=>lineIds.includes(l.id)).map(l=>l.cost))});
          }}/>{line.name} {line.usedConfirmed?`${line.used}個`:'使用数未確認'}</label>)}</div>
          <div className="snack-group-summary"><span>家庭対象 {target==null?'使用数待ち':`${target}個`}</span>
            <Money label="共通請求単価" value={group.unitPrice} onChange={unitPrice=>updateGroup(group.id,{unitPrice})}/></div>
          <details><summary>請求する家庭をまとめて選ぶ{selected.size?`（${selected.size}家庭）`:''}</summary>
            <div className="snack-group-buyers">{state.buyers.filter(b=>b.active&&(!b.testOnly||event.test)).map(b=><div className="snack-group-buyer" key={b.id}>
              <label><input type="checkbox" checked={selected.has(b.id)} disabled={!selected.has(b.id)&&group.unitPrice==null} onChange={()=>toggleBuyer(group,b.id)}/>{b.name}</label>
              {selected.has(b.id)&&<Qty label={`${b.name} 食数`} value={draft.household.find(x=>x.groupId===group.id&&x.buyerId===b.id).qty} min={0}
                onChange={qty=>setDraft({...draft,household:qty===0?draft.household.filter(x=>!(x.groupId===group.id&&x.buyerId===b.id)):draft.household.map(x=>x.groupId===group.id&&x.buyerId===b.id?{...x,qty}:x)})}/>}
            </div>)}</div>
          </details>
          <div className="snack-group-summary"><strong>対象 {summary?.target??target??'—'}個 ／ 割当 {summary?.assigned??selected.size}個 ／ 未割当 {summary?.difference??'—'}個</strong>
            <small>家庭請求 {yen(draft.household.filter(x=>x.groupId===group.id).reduce((n,x)=>n+x.qty*x.unitPrice,0))} ／ 原価 {yen(summary?.cost)} ／ 利益 {yen(summary?.cost==null?null:draft.household.filter(x=>x.groupId===group.id).reduce((n,x)=>n+x.qty*x.unitPrice,0)-summary.cost)}</small></div>
        </section>;
      })}
      <div className="section-head"><h4>家庭へ請求</h4><button type="button" className="text-action" onClick={()=>{
        const lineId=event.lines.length===1?event.lines[0].id:event.lines[0]?.id||'';
        setDraft({...draft,household:[...draft.household,{buyerId:'',lineId,qty:1,unitPrice:suggestion(lineId)}]});
      }}>＋ 請求先</button></div>
      {(draft.household||[]).map((item,i)=>item.groupId?null:<div className="snack-household" key={i}>
        <Field label="購入者"><select value={item.buyerId} onChange={e=>updateHousehold(i,{buyerId:e.target.value})}>
          <option value="">選択してください</option>{state.buyers.filter(b=>b.active&&(!b.testOnly||event.test)).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select></Field>
        {event.lines.length>1&&<Field label="食べた商品"><select value={item.lineId||''} onChange={e=>updateHousehold(i,{lineId:e.target.value||null,unitPrice:suggestion(e.target.value||null)})}>
          {event.lines.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
          {!groups.length&&<option value="">商品内訳不明・共通単価</option>}
        </select></Field>}
        <div className="snack-household-amount"><Qty label="食数" value={item.qty} min={0} onChange={qty=>updateHousehold(i,{qty})}/>
          <Money label="請求単価" value={item.unitPrice} onChange={unitPrice=>updateHousehold(i,{unitPrice})}/></div>
        <button type="button" className="text-action" onClick={()=>setDraft({...draft,household:draft.household.filter((_,n)=>n!==i)})}>この請求先を外す</button>
      </div>)}
      {draft.household.some(x=>!x.lineId&&!x.groupId)&&<small>以前の共通単価請求はそのまま保持します。新しくまとめる場合は上のグループで対象商品を選んでください。</small>}
      <div className="snack-billing-preview"><span>財政 {yen(preview.value?.fiscal)} ／ 家庭 {yen(preview.value?.household)}</span>
        <small>家庭分の利益 {yen(preview.value?.profit)}{preview.value&&!preview.value.complete?'（実使用数との照合待ち）':''}</small></div>
      {preview.error&&<p className="notice" role="alert">{preview.error}</p>}
      {preview.value&&!preview.value.complete&&hasClaim&&<p className="muted">請求数と実際の使用数に差があります。使用数・振替・未使用数を確認してください。在庫は変更されません。</p>}
      {prior&&<Field label="修正・取消の理由"><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="例：請求数を訂正"/></Field>}
      <div className="actions"><Button disabled={!dirty||!hasClaim||!draft.label.trim()||!!preview.error||(groups.length>0&&!preview.value?.complete)||(!!prior&&!reason.trim())}
        onClick={async()=>{if(await save(s=>replaceSnackBilling(s,event.id,draft,reason||'請求を登録'),'おやつ請求を保存'))setReason('');}}>確認した請求を保存</Button>
        {prior&&<button type="button" className="text-action" disabled={!reason.trim()} onClick={async()=>{
          if(confirm('この行事の家庭・財政請求を取り消しますか？')&&await save(s=>replaceSnackBilling(s,event.id,null,reason),'おやつ請求を取消')){setDraft({label:'',fiscal:[],household:[],groups:[]});setReason('');}
        }}>請求を取り消す</button>}</div>
      <small>画面上の計算だけでは集金に加算しません。保存後に反映されます。</small>
      {!!event.billingHistory?.length&&<details><summary>請求の変更履歴</summary>{event.billingHistory.map((x,i)=><p key={i}>{x.at.slice(0,10)} {x.reason}</p>)}</details>}
    </div>
  </details>;
}
