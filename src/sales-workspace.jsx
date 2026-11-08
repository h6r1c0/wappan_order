import React,{useState,useRef} from 'react';
import {addSale,assignUnknownSale,stockRemaining,stockAllocation,today,yen,normalize} from './domain';
import {useApp,Button,BuyerPicker,Field,Empty,Qty,Money,buyerCompare} from './ui';
import {productDisplayName} from './product-names.js';
import {OtherSales} from './other-sales.jsx';
import {BuyerQuantityGrid} from './buyer-quantity-grid.jsx';
import {replaceOtherAllocations,otherAllocationNeedsReason} from './other-sales.js';

const pendingFor=(state,stock)=>state.sales.filter(s=>s.stockId===stock.id&&!s.void&&(s.pending||s.destinationType==='unknown'));
const available=(state,stock)=>stockRemaining(state,stock)+pendingFor(state,stock).reduce((n,s)=>n+s.qty,0);
function StockSummary({stock,onHistory,children}){
  const {state}=useApp(),a=stockAllocation(state,stock),names=new Map();
  for(const s of state.sales.filter(x=>x.stockId===stock.id&&!x.void&&!x.pending&&x.destinationType!=='unknown')){
    const name=s.destinationType==='buyer'?(state.buyers.find(b=>b.id===s.buyerId)?.name||s.buyerName):s.destinationName||'外部';
    names.set(name,(names.get(name)||0)+s.qty);
  }
  return <div className="stock-summary" aria-label={`${stock.name}の割当状況`}>
    <div className="stock-summary-line"><div className="stock-summary-head"><strong>{productDisplayName(stock.name)}</strong><span>未割当 {available(state,stock)}個</span></div>{children}</div>
    <details className="stock-breakdown"><summary>数量の内訳・履歴</summary>
      <p>販売用 {a.received}個 ／ 割当済み {a.assigned}個</p>
      {(a.unconfirmed>0||a.remaining>0)&&<p>購入者未確認 {a.unconfirmed}個 ／ 販売待ち {a.remaining}個</p>}
      {!!a.moved&&<p>振替 {a.moved}個</p>}
      {!!names.size&&<p>{[...names].map(([name,q])=>`${name} ${q}個`).join(' ／ ')}</p>}
      <button type="button" className="text-action" onClick={()=>onHistory(stock)}>割当先・履歴</button>
    </details>
  </div>;
}

const otherRemaining=s=>s.qty-(s.allocations||[]).reduce((n,x)=>n+x.qty,0);
export function SalesWorkspace({stocks,roundId,mode,onHistory}){
 const {state,save}=useApp(),busy=useRef(false),round=state.rounds.find(r=>r.id===roundId);
 const [buyerId,setBuyerId]=useState(''),[category,setCategory]=useState('ALL'),[query,setQuery]=useState('');
 const [destinationType,setDestinationType]=useState('buyer'),[destinationName,setDestinationName]=useState(''),[externalQty,setExternalQty]=useState(0);
 const [picked,setPicked]=useState(''),[buyerDrafts,setBuyerDrafts]=useState({}),[grids,setGrids]=useState({});
 const [reason,setReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
 const [date,setDate]=useState(round?.date||today()),[prices,setPrices]=useState({});
 const others=(state.otherSales||[]).filter(s=>!s.void&&s.paymentStatus==='unpaid'&&round&&s.date===round.date&&s.test===round.test);
 const items=[...stocks.map(s=>({key:'stock:'+s.id,name:s.name,category:s.category||'パン',stock:s,left:available(state,s)})),
  ...others.map(s=>({key:'other:'+s.id,name:s.name,category:'その他',other:s,left:otherRemaining(s)}))];
 const buyerKey=destinationType==='external'?'external':buyerId,personalDraft=buyerDrafts[buyerKey]||{};
 const buyerDraft=Object.fromEntries(items.map(x=>{
  if(destinationType==='buyer'&&buyerId&&x.stock)return [x.key,grids[x.key]?.[buyerId]||0];
  if(destinationType==='buyer'&&buyerId&&x.other&&grids[x.key]){
   const saved=x.other.allocations?.find(a=>a.buyerId===buyerId)?.qty||0;
   return [x.key,Math.max(0,(grids[x.key][buyerId]||0)-saved)];
  }
  return [x.key,personalDraft[x.key]||0];
 }));
 const matches=x=>(category==='ALL'||category===x.category)&&normalize(x.name).includes(normalize(query));
 const shown=items.filter(x=>matches(x)&&x.left>0),current=items.find(x=>x.key===picked);
 const grid=grids[picked]||{},total=Object.values(grid).reduce((n,q)=>n+(q||0),0);
 const rows=current?.other?Object.entries(grid).filter(([,qty])=>qty>0).map(([buyerId,qty])=>({buyerId,qty})):null;
 const correction=current?.other&&otherAllocationNeedsReason(current.other,rows);
 const otherChanged=current?.other&&(rows.length!==(current.other.allocations||[]).length||rows.some(x=>(current.other.allocations||[]).find(a=>a.buyerId===x.buyerId)?.qty!==x.qty));
 const choose=key=>{setPicked(key===picked?'':key);setError('');setNotice('');const x=items.find(item=>item.key===key);
  if(x?.other&&!grids[key])setGrids(prev=>({...prev,[key]:Object.fromEntries([
   ...(x.other.allocations||[]).map(a=>[a.buyerId,a.qty]),
   ...Object.entries(buyerDrafts).filter(([id,v])=>id!=='external'&&v[key]>0).map(([id,v])=>[id,(x.other.allocations||[]).find(a=>a.buyerId===id)?.qty+v[key]||v[key]])
  ])}));};
 const applyStock=(next,stock,qty,id)=>{
  const s=next.stocks.find(x=>x.id===stock.id);
  if(!s||!Number.isSafeInteger(qty)||qty<1||qty>available(next,s))throw Error(stock.name+'の未割当数を超えています');
  const destination={destinationType:id?'buyer':'external',buyerId:id||null,destinationName,paymentStatus:id?'later':'paid',chargeRoundId:roundId};
  for(const pending of pendingFor(next,s)){const take=Math.min(qty,pending.qty);if(take)assignUnknownSale(next,pending.id,take,destination);qty-=take;if(!qty)break;}
  if(qty)addSale(next,s,{...destination,qty,date:date<s.date?s.date:date,price:prices['stock:'+s.id]??s.price});
 };
 const applyOther=(next,sale,updates,replace)=>{
  const s=next.otherSales.find(x=>x.id===sale.id);
  if(!s)throw Error(sale.name+'の販売記録が見つかりません');
  const all=replace?updates:[...(s.allocations||[]),...updates];
  replaceOtherAllocations(next,s.id,all,otherAllocationNeedsReason(s,all)?reason:'新しい購入者への追加割当');
 };
 const commit=async(product,external=false)=>{
  if(busy.current)return;
  const selection=shown.filter(x=>buyerDraft[x.key]>0);
  if(product?(!current||external&&(!current.stock||!externalQty||externalQty>current.left)||!external&&current.stock&&!(total+externalQty)||!external&&current.other&&!otherChanged||!external&&current.stock&&total+externalQty>current.left||!external&&current.other&&total>current.other.qty||correction&&!reason.trim()):((destinationType==='buyer'&&!buyerId)||!selection.length||destinationType==='external'&&selection.some(x=>x.other)))return;
  const action=next=>{
   if(product){if(external)applyStock(next,current.stock,externalQty,null);
    else if(current.stock){for(const [id,qty] of Object.entries(grid))if(qty>0)applyStock(next,current.stock,qty,id);if(externalQty)applyStock(next,current.stock,externalQty,null);}
    else applyOther(next,current.other,rows,true);
   }else for(const x of selection){const qty=buyerDraft[x.key];if(qty>x.left)throw Error(x.name+'の残数が変わりました');
    if(x.stock)applyStock(next,x.stock,qty,destinationType==='buyer'?buyerId:null);else applyOther(next,x.other,[{buyerId,qty}],false);}
  };
  busy.current=true;setSaving(true);setError('');
  try{action(structuredClone(state));if(await save(action,'販売先と数量をまとめて割り当て')){
   if(product){if(external)setExternalQty(0);else {
    if(current.stock)setExternalQty(0);
    setGrids(v=>({...v,[picked]:current.other?Object.fromEntries(rows.map(x=>[x.buyerId,x.qty])):{}}));
    if(current.other)setBuyerDrafts(v=>Object.fromEntries(Object.entries(v).map(([id,d])=>[id,{...d,[picked]:0}])));
   }}else{
    setBuyerDrafts(v=>({...v,[buyerKey]:{...v[buyerKey],...Object.fromEntries(selection.map(x=>[x.key,0]))}}));
    if(destinationType==='buyer')setGrids(v=>Object.fromEntries(Object.entries(v).map(([key,values])=>{
     const x=selection.find(item=>item.key===key);
     return [key,x?.stock?{...values,[buyerId]:0}:x?.other?{...values,[buyerId]:(x.other.allocations||[]).find(a=>a.buyerId===buyerId)?.qty+buyerDraft[key]||buyerDraft[key]}:values];
    })));
   }
   setReason('');setNotice('割当を保存しました。');
  }}catch(e){setError(e.message);}finally{busy.current=false;setSaving(false);}
 };
 const productEditor=current&&<section className="product-buyer-assignment">
     <p>割当済み {current.other?(current.other.qty-current.left):stockAllocation(state,current.stock).assigned}個 ／ 未割当 {current.left}個</p>
     <>
       <BuyerQuantityGrid buyers={state.buyers} test={round?.test} value={grid} onChange={v=>{setGrids({...grids,[picked]:v});setNotice('');}} name={current.name} max={current.other?current.other.qty:current.left}/>
       {current.stock&&<div className="external-in-product"><Qty label="支払い済み・外部販売" value={externalQty} min={0} max={Math.max(0,current.left-total)} onChange={setExternalQty}/><Field label="販売先・団体名（任意）"><input value={destinationName} onChange={e=>setDestinationName(e.target.value)}/></Field></div>}
       <p>今回の入力 {total+ (current.stock?externalQty:0)}個 ／ 保存後の残り {current.other?current.other.qty-total:current.left-total-externalQty}個</p>
       {correction&&<Field label="保存済みの割当を訂正・取消する理由"><input value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
       {(current.stock&&total+externalQty>current.left||current.other&&total>current.other.qty)&&<p role="alert">在庫・販売数量を超えています。</p>}
       <Button disabled={saving||current.stock&&!(total+externalQty)||current.other&&!otherChanged||current.stock&&total+externalQty>current.left||current.other&&total>current.other.qty||correction&&!reason.trim()} onClick={()=>commit(true)}>この商品の割当をまとめて保存</Button>
     </>
     {current.stock&&<details><summary>販売日と単価（任意）</summary><Field label="販売日" type="date" value={date} onChange={e=>setDate(e.target.value)}/><Money label="この販売だけの単価" value={prices[picked]??current.stock.price} onChange={v=>setPrices({...prices,[picked]:v})}/></details>}
     {current.stock&&<button type="button" className="text-action" onClick={()=>onHistory(current.stock)}>保存済みの割当・履歴</button>}
    </section>;
 return <section className={'sales-workspace sales-workspace-'+mode} data-unsaved={externalQty>0||Object.values(buyerDrafts).some(d=>Object.values(d).some(Boolean))||Object.entries(grids).some(([key,v])=>key.startsWith('other:')?(()=>{const sale=others.find(x=>'other:'+x.id===key);return sale&&Object.entries(v).some(([id,qty])=>qty!==((sale.allocations||[]).find(a=>a.buyerId===id)?.qty||0))})():Object.values(v).some(Boolean))}>
  {notice&&<p role="status">{notice}</p>}
  {mode==='buyer'&&<><h3>販売先から割当</h3><div className="choice-grid" aria-label="販売先種別"><Button secondary={destinationType!=='buyer'} onClick={()=>setDestinationType('buyer')}>個人に請求</Button><Button secondary={destinationType!=='external'} onClick={()=>setDestinationType('external')}>支払い済み</Button></div>{destinationType==='buyer'?<BuyerPicker value={buyerId} onChange={setBuyerId} includeTest={round?.test}/>:<Field label="販売先・団体名（任意）"><input value={destinationName} onChange={e=>setDestinationName(e.target.value)}/></Field>}</>}
  {(mode==='product'||buyerId||destinationType==='external')&&<>
   <div className="tabs category-tabs" aria-label="販売商品を絞り込む">{[['ALL','すべて'],['パン','パン'],['焼き菓子','焼き菓子'],['その他','その他']].map(([v,label])=><Button key={v} secondary={category!==v} onClick={()=>setCategory(v)}>{label}</Button>)}</div>
   <Field label="商品名を検索" type="search" value={query} onChange={e=>setQuery(e.target.value)}/>
   {mode==='product'?<><div className="sales-product-list">{shown.map(x=><React.Fragment key={x.key}><button type="button" className={'assignment-product-choice '+(picked===x.key?'selected':'')} key={x.key} onClick={()=>choose(x.key)}>{productDisplayName(x.name)} <small>未割当 {x.left}個</small></button>{picked===x.key&&productEditor}</React.Fragment>)}
    {!!items.filter(x=>matches(x)&&!x.left).length&&<details className="completed-stocks"><summary>割当済みの商品</summary>{items.filter(x=>matches(x)&&!x.left).map(x=><React.Fragment key={x.key}><button type="button" className="assignment-product-choice" key={x.key} onClick={()=>choose(x.key)}>{x.name}　割当済み</button>{picked===x.key&&productEditor}</React.Fragment>)}</details>}</div>
    </>:<div className="sales-allocation-list">{shown.map(x=><div className="assignment-product-row" key={x.key}><span>{productDisplayName(x.name)}<small>未割当 {x.left}個 ／ {yen(x.stock?.price??x.other?.unitPrice)}</small></span>
     <Qty label={x.name+' 割当数量'} min={0} max={x.left} value={buyerDraft[x.key]||0} onChange={q=>{
      if(destinationType==='buyer'&&buyerId&&(x.stock||grids[x.key]))setGrids(v=>({...v,[x.key]:{...v[x.key],[buyerId]:x.other?(x.other.allocations||[]).find(a=>a.buyerId===buyerId)?.qty+q||q:q}}));
      else setBuyerDrafts(v=>({...v,[buyerKey]:{...v[buyerKey],[x.key]:q}}));
     }}/></div>)}
     {shown.some(x=>buyerDraft[x.key]>0)&&<Button disabled={saving||destinationType==='external'&&shown.some(x=>x.other&&buyerDraft[x.key]>0)} onClick={()=>commit(false)}>選んだ商品をまとめて保存</Button>}{destinationType==='external'&&shown.some(x=>x.other&&buyerDraft[x.key]>0)&&<p role="alert">その他商品は個人請求先を選んでください。</p>}</div>}
   {error&&<p role="alert" className="notice">{error}。入力済みの数量は保持しています。</p>}
   {!shown.length&&!current&&<p>未割当の商品はありません。</p>}
  </>}
  <OtherSales round={round} query={query} showAllocations={false}/>
  {!items.length&&<Empty>販売用の商品はまだありません。</Empty>}
 </section>;
}
