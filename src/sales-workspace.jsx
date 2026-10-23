import React,{useState,useRef} from 'react';
import {addSale,assignUnknownSale,stockRemaining,stockAllocation,today,yen,normalize} from './domain';
import {useApp,Button,BuyerPicker,Field,Empty,Qty,Money} from './ui';
import {productDisplayName} from './product-names.js';

const pendingFor=(state,stock)=>state.sales.filter(s=>s.stockId===stock.id&&!s.void&&(s.pending||s.destinationType==='unknown'));
const available=(state,stock)=>stockRemaining(state,stock)+pendingFor(state,stock).reduce((n,s)=>n+s.qty,0);
function StockSummary({stock,onHistory,onSelect}){
  const {state}=useApp(),a=stockAllocation(state,stock),names=new Map();
  for(const s of state.sales.filter(x=>x.stockId===stock.id&&!x.void&&!x.pending&&x.destinationType!=='unknown')){
    const name=s.destinationType==='buyer'?(state.buyers.find(b=>b.id===s.buyerId)?.name||s.buyerName):s.destinationName||'外部';
    names.set(name,(names.get(name)||0)+s.qty);
  }
  return <div className="stock-summary" aria-label={`${stock.name}の割当状況`}><div className="stock-summary-head"><strong>{productDisplayName(stock.name)}</strong><span>{available(state,stock)>0?`未割当 ${available(state,stock)}個`:'割当済み'}</span></div>
    <small>{[...names].map(([name,q])=>`${name} ${q}個`).join(' ／ ')||'販売先の割当なし'}</small>
    <div className="stock-facts"><span>販売待ち・在庫 {a.remaining}個</span><span>販売済み・購入者未確認 {a.unconfirmed}個</span></div>
    <div className="actions">{available(state,stock)>0&&<button type="button" className="text-action" onClick={onSelect}>この商品を割り当てる ›</button>}
      <button type="button" className="text-action" onClick={()=>onHistory(stock)}>履歴を確認・修正 ›</button></div>
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
      if(ok){setQuantities({});setPrices({});setStockId('');setBuyerId('');setLastSaved('割当を保存しました。次の商品・購入者を選べます。');requestAnimationFrame(()=>top.current?.scrollIntoView({block:'start'}));}
    }finally{setSaving(false);}
  };
  const destinationFields=<div className="assignment-destination"><h3>販売先</h3><div className="choice-grid" aria-label="販売先種別"><Button secondary={destinationType!=='buyer'} onClick={()=>setDestinationType('buyer')}>個人に請求</Button><Button secondary={destinationType!=='external'} onClick={()=>setDestinationType('external')}>支払い済み</Button></div>
    {destinationType==='buyer'?<BuyerPicker value={buyerId} onChange={chooseBuyer} includeTest={stocks.some(s=>s.test)}/>:<Field label="販売先・団体名（任意）"><input value={destinationName} onChange={e=>setDestinationName(e.target.value)}/></Field>}</div>;
  const filters=<><div className="tabs category-tabs" aria-label="販売商品を絞り込む">{[['ALL','すべて'],['パン','パン'],['焼き菓子','焼き菓子']].map(([v,label])=><Button key={v} secondary={category!==v} onClick={()=>setCategory(v)}>{label}</Button>)}</div><Field label="商品名を検索" type="search" value={query} onChange={e=>setQuery(e.target.value)}/></>;
  return <section className="sales-workspace" ref={top} data-unsaved={picked.length>0}>
    <h2>{mode==='buyer'?'購入者から入力':'商品別の割当・販売履歴'}</h2>
    {lastSaved&&<p role="status" className="sale-saved">{lastSaved}</p>}
    {mode==='buyer'&&destinationFields}
    {(mode==='product'||buyerId||destinationType==='external')&&<>
      {filters}
      {mode==='product'&&!selected&&<div className="sales-product-list">{shown.map(stock=><StockSummary key={stock.id} stock={stock} onSelect={()=>select(stock)} onHistory={onHistory}/>)}
        {!!complete.length&&<details className="completed-stocks"><summary>割当済みの商品・販売履歴（{complete.length}件）</summary>{complete.map(stock=><StockSummary key={stock.id} stock={stock} onHistory={onHistory}/>)}</details>}
        {!eligible.length&&<p>未割当の商品はありません。割当済みの商品から履歴を確認できます。</p>}</div>}
      {mode==='product'&&selected&&<><div className="assignment-product-row"><strong>{productDisplayName(selected.name)}</strong><Qty label={`${selected.name} 割当数量`} min={0} max={available(state,selected)} value={quantities[selected.id]||0} onChange={q=>setQuantities({[selected.id]:q})}/></div>
        <p>未割当 {available(state,selected)}個 ／ 1個 {yen(selected.price)}</p>{destinationFields}<button type="button" className="text-action" onClick={()=>{setStockId('');setQuantities({});}}>割当せず一覧へ戻る</button></>}
      {mode==='buyer'&&<div className="sales-allocation-list">{shown.map(stock=><div className="assignment-product-row" key={stock.id}><span>{productDisplayName(stock.name)}<small>未割当 {available(state,stock)}個 ／ {yen(stock.price)}</small></span><Qty label={`${stock.name} 割当数量`} min={0} max={available(state,stock)} value={quantities[stock.id]||0} onChange={q=>setQuantities({...quantities,[stock.id]:q})}/></div>)}</div>}
      {!!picked.length&&<div className="sales-confirm"><span>{picked.length}商品・{picked.reduce((n,s)=>n+quantities[s.id],0)}個 ／ {yen(picked.reduce((n,s)=>n+quantities[s.id]*unit(s),0))}</span><Button disabled={saving||destinationType==='buyer'&&!buyerId} onClick={saveAssignments}>{mode==='product'?`この${quantities[selected?.id]||0}個の割当を保存`:`この${picked.length}商品の割当を保存`}</Button></div>}
      <details className="sale-date"><summary>販売日・場所・特別単価（任意）</summary><Field label="販売日" type="date" value={date} onChange={e=>setDate(e.target.value)}/><Field label="販売場所・催し名"><input list="assignment-places" value={salePlace} onChange={e=>setSalePlace(e.target.value)}/></Field><datalist id="assignment-places">{state.markets.filter(m=>m.roundId===roundId).map(m=><option key={m.id} value={m.name}/>)}</datalist>{mode==='product'&&selected&&pendingFor(state,selected).length===0&&<Money label="この販売だけの単価" value={unit(selected)} onChange={v=>setPrices({...prices,[selected.id]:v})}/>}</details>
    </>}
    {!stocks.length&&<Empty>販売用の商品はまだありません。</Empty>}
  </section>;
}
