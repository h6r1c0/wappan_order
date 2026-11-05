import React,{useState,useEffect,useRef} from 'react';
import {useApp,Button,Field,Money,Qty,BuyerPicker} from './ui';
import {BuyerQuantityGrid} from './buyer-quantity-grid.jsx';
import {yen} from './domain';
import {saveSnackSection,confirmSnackPlan,emptySnackPlan,suggestedSnackPrice,suggestedGroupPrice,snackQuantityRows,mergeSnackGroups} from './snack-billing.js';
import {receivedQuantity} from './shortages.js';

const amount=(rows,id)=>rows.filter(x=>x.lineId===id).reduce((n,x)=>n+x.qty,0);
export function SnackBilling({event,onTransfer}){
  const {state,save}=useApp();
  const [draft,setDraft]=useState(()=>{
    const saved=structuredClone(event.snackDraft||event.billing||emptySnackPlan());
    saved.groups=(saved.groups||[]).map(g=>g.unitPrice==null&&g.priceMode!=='manual'
      ? {...g,priceMode:'auto',unitPrice:suggestedGroupPrice(event,g)}:g);
    return saved;
  });
  const [buyer,setBuyer]=useState(''),[quantities,setQuantities]=useState({}),[error,setError]=useState(''),[reason,setReason]=useState('');
  const [saved,setSaved]=useState('');
  const [mergeTarget,setMergeTarget]=useState({});
  const persisted=useRef(JSON.stringify(event.snackDraft||event.billing||emptySnackPlan()));
  useEffect(()=>{
    const next=JSON.stringify(event.snackDraft||event.billing||emptySnackPlan());
    if(next!==persisted.current){
      const previous=persisted.current;
      setDraft(current=>JSON.stringify(current)===previous?structuredClone(event.snackDraft||event.billing||emptySnackPlan()):current);
      persisted.current=next;
    }
  },[event.snackDraft,event.billing]);
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
    if(patch.quantities&&(old.priceMode==='auto'||old.priceMode==null&&old.unitPrice==null)){
      next.priceMode='auto';next.unitPrice=suggestedGroupPrice(event,next);
    }
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
  return <section className="snack-billing">
    <div className="snack-billing-body">
      <p className="muted">{event.billing?'請求確定済み':event.snackDraft?'区分保存済み・請求未確定':'請求未確定'}{unsaved?' ／ 編集中・未保存':''}</p>
      <details className="snack-label"><summary>おやつ名を付ける（任意）</summary><Field label="行事・おやつ名"><input value={draft.label||''} onChange={e=>change({...draft,label:e.target.value})}/></Field><button type="button" className="text-action" onClick={()=>savePart('label',draft.label)}>名前を保存</button></details>
      <h4>財政請求</h4>
      {event.lines.map(l=><div className="snack-billing-row" key={l.id}><span>{l.name}<small>仕入単価 {yen(l.cost)}</small></span>
        <Qty label={`${l.name} 財政分`} value={amount(draft.fiscal,l.id)} max={receivedQuantity(l)} onChange={qty=>editFiscal(l.id,qty)}/></div>)}
      <Button secondary onClick={()=>savePart('fiscal',draft.fiscal)}>財政分を保存</Button>
      <h4>個別請求</h4>
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
          return <details className="snack-direct-buyer" key={id}><summary><strong>{state.buyers.find(b=>b.id===id)?.name}</strong><span>{items.map(item=>`${event.lines.find(l=>l.id===item.lineId)?.name||'商品'} ×${item.qty}`).join('・')}</span><b>{yen(total)}</b></summary>
            <table><thead><tr><th>商品</th><th>数量</th><th>単価</th><th>小計</th><th>操作</th></tr></thead><tbody>{items.map(item=><tr key={item.lineId}>
              <th>{event.lines.find(l=>l.id===item.lineId)?.name}</th><td>{item.qty}個</td><td>{yen(item.unitPrice)}</td><td>{yen(item.qty*item.unitPrice)}</td>
              <td><button type="button" className="text-action" onClick={()=>{setDirectMode('product');setSelectedLine(item.lineId);setDirectPrice(null);requestAnimationFrame(()=>document.querySelector('.snack-billing .product-buyer-assignment')?.scrollIntoView({block:'start'}));}}>編集</button>
                <button type="button" className="text-action" onClick={()=>change({...draft,household:draft.household.filter(x=>x!==item)})}>外す</button></td>
            </tr>)}</tbody></table></details>})}</div>}
      {directMode==='buyer'&&<Button secondary onClick={()=>savePart('direct',direct)}>直接割当を保存</Button>}
      <div className="section-head"><h4>共通単価請求</h4><button type="button" className="text-action" onClick={()=>change({...draft,groups:[...groups,{id:crypto.randomUUID(),label:'共通単価',lineIds:[],quantities:{},unitPrice:null,priceMode:'auto'}]})}>新しい共通単価を追加</button></div>
      {groups.map(g=>{
        const target=Object.values(g.quantities||{}).reduce((n,x)=>n+x,0),assigned=commonAssigned(g.id),suggested=suggestedGroupPrice(event,g);
        const selected=event.lines.filter(l=>(g.quantities?.[l.id]||0)>0),cost=selected.every(l=>l.cost!=null)?selected.reduce((n,l)=>n+(g.quantities[l.id]||0)*l.cost,0):null;
        const difference=target-assigned;
        return <section className="snack-group" key={g.id}>
          <h5>{g.label} {event.snackDraft?.groups.some(x=>x.id===g.id)?'（保存済み）':'（未保存）'}</h5>
          <Field label="請求名"><input value={g.label} onChange={e=>editGroup(g.id,{label:e.target.value})}/></Field>
          <p>対象商品と数量を選んでください。ほかの用途と販売振替の残りを表示します。</p>
          {event.lines.map(l=>{const taken=status.find(x=>x.line.id===l.id),own=g.quantities?.[l.id]||0,available=Math.max(0,taken.unassigned+own);
            return <div className="snack-billing-row" key={l.id}><span>{l.name}<small>この区分に使用可能 {available}個</small></span><Qty label={`${l.name} 共通単価の対象数`} value={own} max={available} onChange={qty=>editGroup(g.id,{quantities:{...g.quantities,[l.id]:qty},lineIds:[...new Set([...g.lineIds,l.id])]})}/>
              {available>0&&own===0&&<button type="button" className="text-action" onClick={()=>editGroup(g.id,{quantities:{...g.quantities,[l.id]:available},lineIds:[...new Set([...g.lineIds,l.id])]})}>残り{available}個を選ぶ</button>}</div>})}
          {target>0&&<>{cost==null?<p role="alert">原価未確定：{selected.filter(l=>l.cost==null).map(l=>l.name).join('、')}。上の仕入単価から登録してください。</p>:
            <p>商品別原価の合計 {yen(cost)} ÷ {target}個。10円単位切り上げの候補 {yen(suggested)}</p>}
            <Money label="1個の共通単価" value={g.unitPrice} onChange={unitPrice=>editGroup(g.id,{unitPrice,priceMode:'manual'})}/></>}
          <p className={difference<0?'notice':''}>対象 {target}個　割当済み {assigned}個　{difference<0?`${-difference}個超過`: `未割当 ${difference}個`}</p>
          <details><summary>購入者と食数{assigned?`（${assigned}個）`:''}</summary>
            <BuyerQuantityGrid buyers={state.buyers} test={event.test} name="共通単価" value={Object.fromEntries(draft.household.filter(x=>x.groupId===g.id).map(x=>[x.buyerId,x.qty]))} max={target}
              onChange={values=>change({...draft,household:[...draft.household.filter(x=>x.groupId!==g.id),...Object.entries(values).filter(([,qty])=>qty>0).map(([buyerId,qty])=>({buyerId,groupId:g.id,lineId:null,qty,unitPrice:g.unitPrice}))]})}/>
            <p className={difference<0?'notice':''}>対象 {target}個　割当済み {assigned}個　{difference<0?`${-difference}個超過`:`未割当 ${difference}個`}</p></details>
          {groups.length>1&&<div className="snack-group-merge"><Field label={`${g.label}を既存グループにまとめる`}><select value={mergeTarget[g.id]||''} onChange={e=>setMergeTarget({...mergeTarget,[g.id]:e.target.value})}><option value="">統合先を選ぶ</option>{groups.filter(x=>x.id!==g.id).map(x=><option key={x.id} value={x.id}>{x.label}（対象 {Object.values(x.quantities||{}).reduce((n,v)=>n+v,0)}個）</option>)}</select></Field>
            <button type="button" className="text-action" disabled={!mergeTarget[g.id]||unsaved} onClick={async()=>{
              if(!confirm('このグループの商品を選んだ既存グループへ移します。元グループに購入者割当がある場合は統合できません。続けますか？'))return;
              try{const probe=structuredClone(state);mergeSnackGroups(probe,event.id,g.id,mergeTarget[g.id]);setError('');
                if(await save(s=>mergeSnackGroups(s,event.id,g.id,mergeTarget[g.id]),'共通単価グループの明示的な統合')){setDraft(structuredClone(probe.events.find(e=>e.id===event.id).snackDraft));setMergeTarget({});setSaved('既存グループへ統合しました。購入者別食数は維持しています。');}
              }catch(e){setError(e.message);}
            }}>選んだグループへ統合</button></div>}
          <button type="button" className="text-action" onClick={()=>{if(!confirm(`「${g.label}」と、このグループの購入者割当を外します。請求へ反映するには保存と確定が必要です。続けますか？`))return;change({...draft,groups:groups.filter(x=>x.id!==g.id),household:draft.household.filter(x=>x.groupId!==g.id)});}}>この共通単価を外す</button>
        </section>;
      })}
      <Button secondary onClick={()=>savePart('common',{groups,household:draft.household.filter(x=>x.groupId)})}>共通単価分を保存</Button>
      <h4>余剰販売</h4>
      {status.filter(x=>x.unassigned>0&&!x.line.sourceStockId).map(x=><button key={x.line.id} type="button" className="text-action" disabled={x.line.cost==null} onClick={()=>onTransfer(x.line)}>{x.line.name}：未振分 {x.unassigned}個から販売用へ振替 ›</button>)}
      <div className="snack-billing-preview" role="region" aria-label="おやつ数量照合表" tabIndex={0}><table><thead><tr>{['商品','未振分','販売振替済','実入荷','発注','用途計','財政','直接','共通'].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{status.map(x=><tr key={x.line.id}><th scope="row">{x.line.name}</th><td>{x.unassigned}</td><td>{x.retail}</td><td>{x.received}</td><td>{x.ordered}</td><td>{x.used}</td><td>{x.fiscal}</td><td>{x.direct}</td><td>{x.common}</td></tr>)}</tbody></table></div>
      {status.filter(x=>x.excess>0||x.unassigned<0||x.used>0&&x.line.cost==null).map(x=><div className="snack-quantity-state" key={x.line.id}><strong>{x.line.name}</strong>：
        {x.excess>0&&<span role="alert">実入荷を{x.excess}個超過　</span>}
        {x.unassigned<0&&<span role="alert">実入荷より用途指定が{-x.unassigned}個超過　</span>}
        {x.used>0&&x.line.cost==null&&<span>原価未確定　</span>}
      </div>)}
      {!event.billing&&<p className="snack-quantity-state">請求未確定{status.some(x=>x.unassigned>0)?'：表の未振分を確認してください':''}</p>}
      {error&&<p role="alert" className="notice">{error}</p>}{saved&&<p role="status">{saved}</p>}
      {unsaved&&event.snackDraft&&<p className="notice">変更した区分を保存してから請求を確定してください。</p>}
      {(event.billing||event.snackDraft&&(unsaved||groups.some(g=>commonAssigned(g.id)>Object.values(g.quantities||{}).reduce((n,x)=>n+x,0))))&&
        <Field label={event.billing?'確定請求を変更する理由':'訂正・確認待ちのメモ（任意）'}><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="例：販売記録の返却待ち・最終精算時に説明"/></Field>}
      {!event.billing&&event.snackDraft&&!unsaved&&reason.trim()&&<button type="button" className="text-action" onClick={()=>savePart('common',{groups,household:draft.household.filter(x=>x.groupId)})}>確認待ちのメモを保存</button>}
      <Button disabled={!event.snackDraft||unsaved||status.some(x=>x.excess>0||x.unassigned!==0)||!!event.billing&&!reason.trim()} onClick={async()=>{
        try{const probe=structuredClone(state);confirmSnackPlan(probe,event.id,reason||'請求先を確定');setError('');
          if(await save(s=>confirmSnackPlan(s,event.id,reason||'請求先を確定'),'おやつ請求を確定')){setSaved('請求先別の内容を確定しました。');setReason('');}}
        catch(e){setError(e.message);}
      }}>保存済みの区分で請求を確定</Button>
      {!!event.billingHistory?.length&&<details><summary>請求の変更履歴</summary>{event.billingHistory.map((x,i)=><p key={i}>{x.at.slice(0,10)} {x.reason}</p>)}</details>}
      {!!event.snackDraftHistory?.length&&<details><summary>仕分けの保存・訂正履歴</summary>{event.snackDraftHistory.map((x,i)=><p key={i}>{x.at.slice(0,10)} {x.reason}</p>)}</details>}
    </div>
  </section>;
}
