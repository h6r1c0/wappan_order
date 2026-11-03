import React,{useState,useRef} from 'react';
import {addSale,assignUnknownSale,stockRemaining,stockAllocation,today,yen,normalize} from './domain';
import {useApp,Button,BuyerPicker,Field,Empty,Qty,Money,buyerCompare} from './ui';
import {productDisplayName} from './product-names.js';
import {OtherSales} from './other-sales.jsx';

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
export function SalesWorkspace({stocks,roundId,mode,onHistory}){
  const {state,save}=useApp(),submitting=useRef(false);
  const [buyerId,setBuyerId]=useState(''),[destinationType,setDestinationType]=useState('buyer'),[destinationName,setDestinationName]=useState('');
  const [quantities,setQuantities]=useState({}),[category,setCategory]=useState('ALL'),[query,setQuery]=useState(''),[date,setDate]=useState(today()),[lastSaved,setLastSaved]=useState(''),[salePlace,setSalePlace]=useState(''),[prices,setPrices]=useState({}),[saving,setSaving]=useState(false);
  const picked=stocks.filter(s=>quantities[s.id]>0);
  const matches=s=>(category==='ALL'||s.category===category)&&normalize(s.name).includes(normalize(query));
  const eligible=stocks.filter(s=>available(state,s)>0),shown=eligible.filter(matches);
  const complete=stocks.filter(s=>available(state,s)===0).filter(matches);
  const unit=stock=>prices[stock.id]??stock.price;
  const invalid=picked.some(stock=>!Number.isSafeInteger(quantities[stock.id])||quantities[stock.id]>available(state,stock));
  const chooseBuyer=id=>{setBuyerId(id);setLastSaved('');};
  const saveAssignments=async()=>{
    if(submitting.current||!picked.length||invalid||destinationType==='buyer'&&!buyerId)return;
    submitting.current=true;setSaving(true);
    try{
      const ok=await save(next=>{
        for(const stock of picked){
          const current=next.stocks.find(x=>x.id===stock.id);let qty=quantities[stock.id];
          if(!current||!Number.isSafeInteger(qty)||qty<1||qty>available(next,current))throw Error('割当数量が未割当数を超えています');
          const destination={destinationType,buyerId,destinationName,paymentStatus:destinationType==='buyer'?'later':'paid',chargeRoundId:roundId,salePlace,marketId:next.markets.find(m=>m.roundId===roundId&&m.name===salePlace)?.id||null};
          for(const sale of pendingFor(next,current)){const take=Math.min(qty,sale.qty);if(take)assignUnknownSale(next,sale.id,take,destination);qty-=take;if(!qty)break;}
          if(qty)addSale(next,current,{...destination,qty,date:date<current.date?current.date:date,price:unit(current)});
        }
      },'販売先と数量を割り当て');
      if(ok){setQuantities({});setPrices({});setLastSaved('割当を保存しました。');}
    }finally{submitting.current=false;setSaving(false);}
  };
  // Keep the positively reviewed buyer-first selector and product/quantity controls unchanged.
  const destinationFields=<div className="assignment-destination"><h3>販売先</h3><div className="choice-grid" aria-label="販売先種別"><Button secondary={destinationType!=='buyer'} onClick={()=>setDestinationType('buyer')}>個人に請求</Button><Button secondary={destinationType!=='external'} onClick={()=>setDestinationType('external')}>支払い済み</Button></div>
    {destinationType==='buyer'?<BuyerPicker value={buyerId} onChange={chooseBuyer} includeTest={stocks.some(s=>s.test)}/>:<Field label="販売先・団体名（任意）"><input value={destinationName} onChange={e=>setDestinationName(e.target.value)}/></Field>}</div>;
  const productDestination=<div className="product-assignment-destination"><Field label="割当先"><select aria-label="割当先" value={destinationType==='external'?'external':buyerId?`buyer:${buyerId}`:''} onChange={e=>{
    if(e.target.value==='external')setDestinationType('external');else{setDestinationType('buyer');chooseBuyer(e.target.value.replace(/^buyer:/,''));}
  }}><option value="">販売先を選ぶ</option><optgroup label="個人に請求">{state.buyers.filter(b=>b.id===buyerId||(b.testOnly?stocks.some(s=>s.test):b.active)).slice().sort(buyerCompare).map(b=><option key={b.id} value={`buyer:${b.id}`}>{b.name}</option>)}</optgroup><option value="external">支払い済み（外部）</option></select></Field>
    {destinationType==='external'&&<Field label="販売先・団体名（任意）"><input value={destinationName} onChange={e=>setDestinationName(e.target.value)}/></Field>}</div>;
  const saleOptions=<details className="sale-date"><summary>販売日・場所・特別単価（任意）</summary><Field label="販売日" type="date" value={date} onChange={e=>setDate(e.target.value)}/><Field label="販売場所・催し名"><input list={`assignment-places-${mode}`} value={salePlace} onChange={e=>setSalePlace(e.target.value)}/></Field><datalist id={`assignment-places-${mode}`}>{state.markets.filter(m=>m.roundId===roundId).map(m=><option key={m.id} value={m.name}/>)}</datalist>{mode==='product'&&picked.filter(stock=>pendingFor(state,stock).length===0).map(stock=><Money key={stock.id} label={`${productDisplayName(stock.name)} この販売だけの単価`} value={unit(stock)} onChange={v=>setPrices({...prices,[stock.id]:v})}/>)}</details>;
  const filters=<><div className="tabs category-tabs" aria-label="販売商品を絞り込む">{[['ALL','すべて'],['パン','パン'],['焼き菓子','焼き菓子'],['その他','その他']].map(([v,label])=><Button key={v} secondary={category!==v} onClick={()=>setCategory(v)}>{label}</Button>)}</div><Field label="商品名を検索" type="search" value={query} onChange={e=>setQuery(e.target.value)}/></>;
  const productFilters=<div className="product-allocation-filters"><Field label="商品名を検索" type="search" placeholder="商品名を検索" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="販売商品の分類" value={category} onChange={e=>setCategory(e.target.value)}><option value="ALL">すべて</option><option value="パン">パン</option><option value="焼き菓子">焼き菓子</option><option value="その他">その他</option></select></div>;
  const quantity=stock=><Qty label={`${stock.name} 割当数量`} min={0} max={available(state,stock)} value={quantities[stock.id]||0} onChange={q=>{setQuantities({...quantities,[stock.id]:q});setLastSaved('');}}/>;
  return <section className={`sales-workspace sales-workspace-${mode}`} data-unsaved={picked.length>0}>
    {lastSaved&&<p role="status" className="sale-saved">{lastSaved}</p>}
    {category==='その他'?null:mode==='buyer'?destinationFields:productDestination}
    {(mode==='product'||buyerId||destinationType==='external')&&<>
      {mode==='buyer'?filters:productFilters}
      {category==='その他'&&<OtherSales round={state.rounds.find(r=>r.id===roundId)} query={query}/>}
      {mode==='product'&&category!=='その他'&&<div className="sales-product-list">{shown.map(stock=><StockSummary key={stock.id} stock={stock} onHistory={onHistory}>{quantity(stock)}</StockSummary>)}
        {!!complete.length&&<details className="completed-stocks"><summary>割当済み（{complete.length}商品）</summary>{complete.map(stock=><StockSummary key={stock.id} stock={stock} onHistory={onHistory}/>)}</details>}
        {!eligible.length&&<p>未割当の商品はありません。割当済みの商品から履歴を確認できます。</p>}</div>}
      {mode==='buyer'&&category!=='その他'&&<div className="sales-allocation-list">{shown.map(stock=><div className="assignment-product-row" key={stock.id}><span>{productDisplayName(stock.name)}<small>未割当 {available(state,stock)}個 ／ {yen(stock.price)}</small></span>{quantity(stock)}</div>)}</div>}
      {!!picked.length&&<div className="sales-confirm"><span>{picked.length}商品・{picked.reduce((n,s)=>n+quantities[s.id],0)}個 ／ {yen(picked.reduce((n,s)=>n+quantities[s.id]*unit(s),0))}</span><Button disabled={saving||invalid||destinationType==='buyer'&&!buyerId} onClick={saveAssignments}>{`この${picked.length}商品の割当を保存`}</Button>{invalid&&<p role="alert">残数が変わりました。割当数量を見直してください。</p>}</div>}
      {saleOptions}
    </>}
    {!stocks.length&&category!=='その他'&&<Empty>販売用の商品はまだありません。</Empty>}
  </section>;
}
