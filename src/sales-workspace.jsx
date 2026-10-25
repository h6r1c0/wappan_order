import React,{useState,useRef} from 'react';
import {addSale,assignUnknownSale,stockRemaining,stockAllocation,today,yen,normalize} from './domain';
import {useApp,Button,BuyerPicker,Field,Empty,Qty,Money} from './ui';
import {productDisplayName} from './product-names.js';

const pendingFor=(state,stock)=>state.sales.filter(s=>s.stockId===stock.id&&!s.void&&(s.pending||s.destinationType==='unknown'));
const available=(state,stock)=>stockRemaining(state,stock)+pendingFor(state,stock).reduce((n,s)=>n+s.qty,0);
function StockSummary({stock,onHistory,onSelect,children,expanded}){
  const {state}=useApp(),a=stockAllocation(state,stock),names=new Map();
  for(const s of state.sales.filter(x=>x.stockId===stock.id&&!x.void&&!x.pending&&x.destinationType!=='unknown')){
    const name=s.destinationType==='buyer'?(state.buyers.find(b=>b.id===s.buyerId)?.name||s.buyerName):s.destinationName||'外部';
    names.set(name,(names.get(name)||0)+s.qty);
  }
  return <div className="stock-summary" aria-label={`${stock.name}の割当状況`}><div className="stock-summary-head"><strong>{productDisplayName(stock.name)}</strong><span>販売用 {a.received}個 ／ 割当済み {a.assigned}個 ／ 未割当 {available(state,stock)}個</span></div>
    {!!names.size&&<small>{[...names].map(([name,q])=>`${name} ${q}個`).join(' ／ ')}</small>}
    {(a.unconfirmed>0||a.remaining>0&&available(state,stock)===0)&&<small className="stock-facts">{a.unconfirmed>0&&`購入者未確認 ${a.unconfirmed}個`}{a.remaining>0&&available(state,stock)===0&&` ／ 販売待ち ${a.remaining}個`}</small>}
    <div className="actions">{available(state,stock)>0&&<button type="button" className="text-action" aria-expanded={expanded} onClick={onSelect}>{expanded?'割当入力を閉じる':'販売先・数量を入力'}</button>}
      {(!!names.size||available(state,stock)===0)&&<button type="button" className="text-action" onClick={()=>onHistory(stock)}>割当先・履歴</button>}</div>{children}
  </div>;
}
export function SalesWorkspace({stocks,roundId,mode,onHistory}){
  const {state,save}=useApp(),top=useRef(null);
  const [stockId,setStockId]=useState(''),[buyerId,setBuyerId]=useState(''),[destinationType,setDestinationType]=useState('buyer'),[destinationName,setDestinationName]=useState('');
  const [quantities,setQuantities]=useState({}),[category,setCategory]=useState('ALL'),[query,setQuery]=useState(''),[date,setDate]=useState(today()),[lastSaved,setLastSaved]=useState(''),[salePlace,setSalePlace]=useState(''),[prices,setPrices]=useState({}),[saving,setSaving]=useState(false);
  const picked=stocks.filter(s=>quantities[s.id]>0),selected=stocks.find(s=>s.id===stockId);
  const matches=s=>(category==='ALL'||s.category===category)&&normalize(s.name).includes(normalize(query));
  const eligible=stocks.filter(s=>available(state,s)>0),shown=eligible.filter(matches);
  const complete=stocks.filter(s=>available(state,s)===0).filter(matches);
  const select=stock=>{setStockId(stock.id);setQuantities({[stock.id]:quantities[stock.id]||1});setLastSaved('');};
  const unit=stock=>prices[stock.id]??stock.price;
  const chooseBuyer=id=>{setBuyerId(id);setLastSaved('');};
  const saveAssignments=async()=>{
    if(saving)return;setSaving(true);
    try{
      const ok=await save(next=>{
        for(const stock of picked){
          const current=next.stocks.find(x=>x.id===stock.id);let qty=quantities[stock.id];
          if(!Number.isSafeInteger(qty)||qty<1||qty>available(next,current))throw Error('割当数量が未割当数を超えています');
          const destination={destinationType,buyerId,destinationName,paymentStatus:destinationType==='buyer'?'later':'paid',chargeRoundId:roundId,salePlace,marketId:state.markets.find(m=>m.roundId===roundId&&m.name===salePlace)?.id||null};
          for(const sale of pendingFor(next,current)){const take=Math.min(qty,sale.qty);if(take)assignUnknownSale(next,sale.id,take,destination);qty-=take;if(!qty)break;}
          if(qty)addSale(next,current,{...destination,qty,date:date<current.date?current.date:date,price:unit(current)});
        }
      },'販売先と数量を割り当て');
      if(ok){setQuantities({});setPrices({});setStockId('');setLastSaved('割当を保存しました。');}
    }finally{setSaving(false);}
  };
  const destinationFields=<div className="assignment-destination"><h3>販売先</h3><div className="choice-grid" aria-label="販売先種別"><Button secondary={destinationType!=='buyer'} onClick={()=>setDestinationType('buyer')}>個人に請求</Button><Button secondary={destinationType!=='external'} onClick={()=>setDestinationType('external')}>支払い済み</Button></div>
    {destinationType==='buyer'?<BuyerPicker value={buyerId} onChange={chooseBuyer} includeTest={stocks.some(s=>s.test)}/>:<Field label="販売先・団体名（任意）"><input value={destinationName} onChange={e=>setDestinationName(e.target.value)}/></Field>}</div>;
  const saleOptions=<details className="sale-date"><summary>販売日・場所・特別単価（任意）</summary><Field label="販売日" type="date" value={date} onChange={e=>setDate(e.target.value)}/><Field label="販売場所・催し名"><input list="assignment-places" value={salePlace} onChange={e=>setSalePlace(e.target.value)}/></Field><datalist id="assignment-places">{state.markets.filter(m=>m.roundId===roundId).map(m=><option key={m.id} value={m.name}/>)}</datalist>{mode==='product'&&selected&&pendingFor(state,selected).length===0&&<Money label="この販売だけの単価" value={unit(selected)} onChange={v=>setPrices({...prices,[selected.id]:v})}/>}</details>;
  const filters=<><div className="tabs category-tabs" aria-label="販売商品を絞り込む">{[['ALL','すべて'],['パン','パン'],['焼き菓子','焼き菓子']].map(([v,label])=><Button key={v} secondary={category!==v} onClick={()=>setCategory(v)}>{label}</Button>)}</div><Field label="商品名を検索" type="search" value={query} onChange={e=>setQuery(e.target.value)}/></>;
  return <section className="sales-workspace" ref={top} data-unsaved={picked.length>0}>
    <h2>{mode==='buyer'?'購入者からまとめて入力':'商品別一覧'}</h2>
    {lastSaved&&<p role="status" className="sale-saved">{lastSaved}</p>}
    {mode==='buyer'&&destinationFields}
    {(mode==='product'||buyerId||destinationType==='external')&&<>
      {filters}
      {mode==='product'&&<div className="sales-product-list">{shown.map(stock=><StockSummary key={stock.id} stock={stock} expanded={stock.id===stockId} onSelect={()=>stock.id===stockId?(setStockId(''),setQuantities({})):select(stock)} onHistory={onHistory}>{stock.id===stockId&&<div className="inline-assignment"><Qty label={`${stock.name} 割当数量`} min={0} max={available(state,stock)} value={quantities[stock.id]||0} onChange={q=>setQuantities({[stock.id]:q})}/>{destinationFields}{saleOptions}{!!picked.length&&<div className="sales-confirm"><span>{quantities[stock.id]}個 ／ {yen(quantities[stock.id]*unit(stock))}</span><Button disabled={saving||destinationType==='buyer'&&!buyerId} onClick={saveAssignments}>保存</Button></div>}</div>}</StockSummary>)}
        {!!complete.length&&<details className="completed-stocks"><summary>割当済み（{complete.length}商品）</summary>{complete.map(stock=><StockSummary key={stock.id} stock={stock} onHistory={onHistory}/>)}</details>}
        {!eligible.length&&<p>未割当の商品はありません。割当済みの商品から履歴を確認できます。</p>}</div>}
      {mode==='buyer'&&<div className="sales-allocation-list">{shown.map(stock=><div className="assignment-product-row" key={stock.id}><span>{productDisplayName(stock.name)}<small>未割当 {available(state,stock)}個 ／ {yen(stock.price)}</small></span><Qty label={`${stock.name} 割当数量`} min={0} max={available(state,stock)} value={quantities[stock.id]||0} onChange={q=>setQuantities({...quantities,[stock.id]:q})}/></div>)}</div>}
      {mode==='buyer'&&!!picked.length&&<div className="sales-confirm"><span>{picked.length}商品・{picked.reduce((n,s)=>n+quantities[s.id],0)}個 ／ {yen(picked.reduce((n,s)=>n+quantities[s.id]*unit(s),0))}</span><Button disabled={saving||destinationType==='buyer'&&!buyerId} onClick={saveAssignments}>{`この${picked.length}商品の割当を保存`}</Button></div>}
      {mode==='buyer'&&saleOptions}
    </>}
    {!stocks.length&&<Empty>販売用の商品はまだありません。</Empty>}
  </section>;
}
