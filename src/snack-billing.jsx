import React,{useState} from 'react';
import {useApp,Button,Field,Money,Qty,BuyerPicker} from './ui';
import {BuyerQuantityGrid} from './buyer-quantity-grid.jsx';
import {yen} from './domain';
import {saveSnackSection,confirmSnackPlan,emptySnackPlan,suggestedSnackPrice,suggestedGroupPrice,snackQuantityRows} from './snack-billing.js';
import {receivedQuantity} from './shortages.js';

const amount=(rows,id)=>rows.filter(x=>x.lineId===id).reduce((n,x)=>n+x.qty,0);
export function SnackBilling({event}){
  const {state,save}=useApp();
  const [draft,setDraft]=useState(()=>structuredClone(event.snackDraft||event.billing||emptySnackPlan()));
  const [buyer,setBuyer]=useState(''),[quantities,setQuantities]=useState({}),[error,setError]=useState(''),[reason,setReason]=useState('');
  const [open,setOpen]=useState(false),[saved,setSaved]=useState('');
  const [directMode,setDirectMode]=useState('buyer'),[selectedLine,setSelectedLine]=useState(''),[directPrice,setDirectPrice]=useState(null);
  const direct=draft.household.filter(x=>!x.groupId&&x.lineId),groups=draft.groups||[];
  const change=next=>{setDraft(next);setError('');setSaved('');};
  const savePart=async(section,value)=>{
    try{
      const probe=structuredClone(state);saveSnackSection(probe,event.id,section,value,reason||'おやつの区分を保存');
      setError('');
      if(await save(s=>saveSnackSection(s,event.id,section,value,reason||'おやつの区分を保存'),`${section==='fiscal'?'財政':section==='direct'?'直接割当':section==='common'?'共通単価':'おやつ名'}を保存`)){
        setSaved('この区分を保存しました。請求と集金への反映は「請求を確定」後です。');setReason('');
      }
    }catch(e){setError(e.message);}
  };
  const editFiscal=(lineId,qty)=>change({...draft,fiscal:[...draft.fiscal.filter(x=>x.lineId!==lineId),{lineId,qty}]});
  const editGroup=(id,patch)=>{
    const old=groups.find(g=>g.id===id),next={...old,...patch};
    if(patch.quantities&&old.priceMode==='auto')next.unitPrice=suggestedGroupPrice(event,next);
    const priceChanged=next.unitPrice!==old.unitPrice;
    change({...draft,groups:groups.map(g=>g.id===id?next:g),
      household:priceChanged?draft.household.map(x=>x.groupId===id?{...x,unitPrice:next.unitPrice}:x):draft.household});
  };
  const addBuyer=()=>{
    if(!buyer||!Object.values(quantities).some(x=>x.qty>0)){setError('購入者と商品・数量を選んでください');return;}
    const next=[...draft.household.filter(x=>!(!x.groupId&&x.buyerId===buyer)),...event.lines.filter(l=>quantities[l.id]?.qty>0).map(l=>({buyerId:buyer,lineId:l.id,qty:quantities[l.id].qty,unitPrice:quantities[l.id].unitPrice}))];
    if(next.some(x=>!Number.isSafeInteger(x.unitPrice)||x.unitPrice<0)){setError('請求単価を確認してください');return;}
    change({...draft,household:next});setBuyer('');setQuantities({});
  };
  const status=snackQuantityRows(state,event,draft);
  const commonAssigned=id=>draft.household.filter(x=>x.groupId===id).reduce((n,x)=>n+x.qty,0);
  const line=event.lines.find(l=>l.id===selectedLine);
  const lineItems=direct.filter(x=>x.lineId===selectedLine);
  const directGrid=Object.fromEntries(lineItems.map(x=>[x.buyerId,x.qty]));
  const lineCapacity=line?Math.max(0,receivedQuantity(line)-amount(draft.fiscal,line.id)-groups.reduce((n,g)=>n+(g.quantities?.[line.id]||0),0)-state.stocks.filter(st=>st.eventLineId===line.id).reduce((n,st)=>n+st.qty,0)):0;
  const changeLineGrid=values=>{
    const price=directPrice??lineItems[0]?.unitPrice??suggestedSnackPrice([line.cost]);
    change({...draft,household:[...draft.household.filter(x=>x.groupId||x.lineId!==line.id),
      ...Object.entries(values).filter(([,qty])=>qty>0).map(([buyerId,qty])=>({buyerId,lineId:line.id,qty,unitPrice:lineItems.find(x=>x.buyerId===buyerId)?.unitPrice??price}))]});
  };
  const changeDirectPrice=unitPrice=>{setDirectPrice(unitPrice);change({...draft,household:draft.household.map(x=>!x.groupId&&x.lineId===selectedLine?{...x,unitPrice}:x)});};
  const unsaved=JSON.stringify(draft)!==JSON.stringify(event.snackDraft||event.billing||emptySnackPlan());
  return <details className="snack-billing" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>おやつの用途と請求{event.billing?'（請求確定済み）':event.snackDraft?'（区分保存済み）':''}</summary>
    <div className="snack-billing-body">
      <p className="muted">分かっている区分から保存できます。請求・集金に反映するのは最後の確定後です。</p>
      <Field label="行事・おやつ名（任意）"><input value={draft.label||''} onChange={e=>change({...draft,label:e.target.value})}/></Field>
      <button type="button" className="text-action" onClick={()=>savePart('label',draft.label)}>名前を保存</button>
      <h4>1 財政分</h4>
      {event.lines.map(l=><div className="snack-billing-row" key={l.id}><span>{l.name}<small>仕入単価 {yen(l.cost)}</small></span>
        <Qty label={`${l.name} 財政分`} value={amount(draft.fiscal,l.id)} max={receivedQuantity(l)} onChange={qty=>editFiscal(l.id,qty)}/></div>)}
      <Button secondary onClick={()=>savePart('fiscal',draft.fiscal)}>財政分を保存</Button>
      <h4>2 そのまま割り振れる分</h4>
      <div className="choice-grid" role="group" aria-label="おやつ直接割当の入口"><Button secondary={directMode!=='buyer'} onClick={()=>setDirectMode('buyer')}>購入者から</Button><Button secondary={directMode!=='product'} onClick={()=>setDirectMode('product')}>商品から</Button></div>
      {directMode==='product'&&<><Field label="割り当てる商品"><select value={selectedLine} onChange={e=>{setSelectedLine(e.target.value);setDirectPrice(null);}}><option value="">商品を選ぶ</option>{event.lines.map(l=><option key={l.id} value={l.id}>{l.name}（実入荷 {receivedQuantity(l)}個）</option>)}</select></Field>
        {line&&<div className="product-buyer-assignment"><p>{line.name}：割当済み {lineItems.reduce((n,x)=>n+x.qty,0)}個 ／ 直接割当に使用可能 {lineCapacity}個</p>
          <BuyerQuantityGrid buyers={state.buyers} test={event.test} name={line.name} value={directGrid} onChange={changeLineGrid} max={lineCapacity}/>
          <Money label={`${line.name}の請求単価`} value={directPrice??lineItems[0]?.unitPrice??suggestedSnackPrice([line.cost])} onChange={changeDirectPrice}/>
          <p>選んだ数量 {lineItems.reduce((n,x)=>n+x.qty,0)}個 ／ 残り {lineCapacity-lineItems.reduce((n,x)=>n+x.qty,0)}個</p>
          {lineItems.reduce((n,x)=>n+x.qty,0)>lineCapacity&&<p role="alert">{line.name}の直接割当が{lineItems.reduce((n,x)=>n+x.qty,0)-lineCapacity}個超えています。</p>}
          <Button secondary disabled={lineItems.reduce((n,x)=>n+x.qty,0)>lineCapacity} onClick={()=>savePart('direct',direct)}>この商品の直接割当を保存</Button>
        </div>}</>}
      {directMode==='buyer'&&<>
      <BuyerPicker value={buyer} onChange={setBuyer} includeTest={event.test}/>
      {buyer&&event.lines.map(l=><div className="snack-billing-row" key={l.id}><span>{l.name}</span>
        <Qty label={`${l.name} 割当数量`} value={quantities[l.id]?.qty||0} max={receivedQuantity(l)} onChange={qty=>setQuantities({...quantities,[l.id]:{qty,unitPrice:quantities[l.id]?.unitPrice??suggestedSnackPrice([l.cost])}})}/>
        {(quantities[l.id]?.qty||0)>0&&<Money label={`${l.name} 請求単価`} value={quantities[l.id].unitPrice} onChange={unitPrice=>setQuantities({...quantities,[l.id]:{...quantities[l.id],unitPrice}})}/>}</div>)}
      {buyer&&<Button secondary onClick={addBuyer}>この購入者の商品を追加</Button>}
      </>}
      {!!direct.length&&<div className="snack-direct-summary"><h5>直接割当 {direct.length}件・{direct.reduce((n,x)=>n+x.qty,0)}個</h5>
        {[...new Set(direct.map(x=>x.buyerId))].map(id=>{const items=direct.filter(x=>x.buyerId===id),total=items.reduce((n,x)=>n+x.qty*x.unitPrice,0);
          return <details className="snack-direct-buyer" key={id}><summary><strong>{state.buyers.find(b=>b.id===id)?.name}</strong><span>{items.reduce((n,x)=>n+x.qty,0)}個　請求合計 {yen(total)}</span></summary>
            <table><thead><tr><th>商品</th><th>数量</th><th>単価</th><th>小計</th><th>操作</th></tr></thead><tbody>{items.map(item=><tr key={item.lineId}>
              <th>{event.lines.find(l=>l.id===item.lineId)?.name}</th><td>{item.qty}個</td><td>{yen(item.unitPrice)}</td><td>{yen(item.qty*item.unitPrice)}</td>
              <td><button type="button" className="text-action" onClick={()=>change({...draft,household:draft.household.filter(x=>x!==item)})}>外す</button></td>
            </tr>)}</tbody></table></details>})}</div>}
      {directMode==='buyer'&&<Button secondary onClick={()=>savePart('direct',direct)}>直接割当を保存</Button>}
      <div className="section-head"><h4>3 共通単価を設定した分</h4><button type="button" className="text-action" onClick={()=>change({...draft,groups:[...groups,{id:crypto.randomUUID(),label:'共通単価',lineIds:[],quantities:{},unitPrice:null,priceMode:'auto'}]})}>＋ 共通単価</button></div>
      {groups.map(g=>{
        const target=Object.values(g.quantities||{}).reduce((n,x)=>n+x,0),assigned=commonAssigned(g.id),suggested=suggestedGroupPrice(event,g);
        const selected=event.lines.filter(l=>(g.quantities?.[l.id]||0)>0),cost=selected.every(l=>l.cost!=null)?selected.reduce((n,l)=>n+(g.quantities[l.id]||0)*l.cost,0):null;
        return <section className="snack-group" key={g.id}>
          <Field label="請求名"><input value={g.label} onChange={e=>editGroup(g.id,{label:e.target.value})}/></Field>
          <p>対象商品と数量を選んでください。ほかの用途と販売振替の残りを表示します。</p>
          {event.lines.map(l=>{const taken=status.find(x=>x.line.id===l.id),own=g.quantities?.[l.id]||0,available=Math.max(0,taken.unassigned+own);
            return <div className="snack-billing-row" key={l.id}><span>{l.name}<small>この区分に使用可能 {available}個</small></span><Qty label={`${l.name} 共通単価の対象数`} value={own} max={available} onChange={qty=>editGroup(g.id,{quantities:{...g.quantities,[l.id]:qty},lineIds:[...new Set([...g.lineIds,l.id])]})}/>
              {available>0&&own===0&&<button type="button" className="text-action" onClick={()=>editGroup(g.id,{quantities:{...g.quantities,[l.id]:available},lineIds:[...new Set([...g.lineIds,l.id])]})}>残り{available}個を選ぶ</button>}</div>})}
          {target>0&&<>{cost==null?<p role="alert">原価未確定：{selected.filter(l=>l.cost==null).map(l=>l.name).join('、')}。上の仕入単価から登録してください。</p>:
            <p>商品別原価の合計 {yen(cost)} ÷ {target}個。10円単位切り上げの候補 {yen(suggested)}</p>}
            <Money label="1個の共通単価" value={g.unitPrice} onChange={unitPrice=>editGroup(g.id,{unitPrice,priceMode:'manual'})}/></>}
          <p>商品別対象 合計{target}個 ／ 家庭割当 {assigned}個 ／ 差 {target-assigned}個</p>
          <details><summary>購入者と食数{assigned?`（${assigned}個）`:''}</summary>
            {state.buyers.filter(b=>b.active&&(!b.testOnly||event.test)).map(b=>{
              const item=draft.household.find(x=>x.groupId===g.id&&x.buyerId===b.id);
              return <div className="snack-group-buyer" key={b.id}><span>{b.name}</span>
                <Qty label={`${b.name} 共通単価の食数`} min={0} value={item?.qty||0} max={target} onChange={qty=>change({...draft,household:[...draft.household.filter(x=>x!==item),...(qty?[{buyerId:b.id,groupId:g.id,lineId:null,qty,unitPrice:g.unitPrice}]:[])]})}/></div>;
            })}</details>
          <button type="button" className="text-action" onClick={()=>change({...draft,groups:groups.filter(x=>x.id!==g.id),household:draft.household.filter(x=>x.groupId!==g.id)})}>この共通単価を外す</button>
        </section>;
      })}
      <Button secondary onClick={()=>savePart('common',{groups,household:draft.household.filter(x=>x.groupId)})}>共通単価分を保存</Button>
      <h4>4 販売に回す分</h4><p>上の商品ごとの用途未振分から、必要な余剰だけ販売用へ振り替えられます。</p>
      <p className="snack-scroll-hint">数量表は横に続きます →</p>
      <div className="snack-billing-preview" role="region" aria-label="おやつ数量照合表" tabIndex={0}><table><thead><tr>{['商品','未振分','販売振替済','実入荷','発注','用途計','財政','直接','共通'].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{status.map(x=><tr key={x.line.id}><th scope="row">{x.line.name}</th><td>{x.unassigned}</td><td>{x.retail}</td><td>{x.received}</td><td>{x.ordered}</td><td>{x.used}</td><td>{x.fiscal}</td><td>{x.direct}</td><td>{x.common}</td></tr>)}</tbody></table></div>
      {status.map(x=><div className="snack-quantity-state" key={x.line.id}><strong>{x.line.name}</strong>：
        {x.unassigned>0&&<span>用途未振分 {x.unassigned}個　</span>}
        {x.excess>0&&<span role="alert">実入荷を{x.excess}個超過　</span>}
        {x.unassigned<0&&<span role="alert">実入荷より用途指定が{-x.unassigned}個超過　</span>}
        {x.used>0&&x.line.cost==null&&<span>原価未確定　</span>}
        {!event.billing&&<span>請求未確定</span>}
      </div>)}
      {error&&<p role="alert" className="notice">{error}</p>}{saved&&<p role="status">{saved}</p>}
      {unsaved&&event.snackDraft&&<p className="notice">変更した区分を保存してから請求を確定してください。</p>}
      {event.billing&&<Field label="確定請求を変更する理由"><input value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
      <Button disabled={!event.snackDraft||unsaved||status.some(x=>x.excess>0||x.unassigned!==0)||!!event.billing&&!reason.trim()} onClick={async()=>{
        try{const probe=structuredClone(state);confirmSnackPlan(probe,event.id,reason||'請求先を確定');setError('');
          if(await save(s=>confirmSnackPlan(s,event.id,reason||'請求先を確定'),'おやつ請求を確定')){setSaved('請求先別の内容を確定しました。');setReason('');}}
        catch(e){setError(e.message);}
      }}>保存済みの区分で請求を確定</Button>
      {!!event.billingHistory?.length&&<details><summary>請求の変更履歴</summary>{event.billingHistory.map((x,i)=><p key={i}>{x.at.slice(0,10)} {x.reason}</p>)}</details>}
    </div>
  </details>;
}
