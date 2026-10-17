import React, { useState } from 'react';
import { addSale, assignUnknownSale, stockRemaining, stockAllocation, today, yen, normalize } from './domain';
import { bundleUsed } from './commerce';
import { useApp, Button, BuyerPicker, Field, Empty, Qty } from './ui';
import {productDisplayName} from './product-names.js';

const pendingFor = (state, stock) => state.sales.filter((sale) =>
  sale.stockId === stock.id && !sale.void &&
  (sale.pending || sale.destinationType === 'unknown'));

function StockStatus({ stock }) {
  const { state } = useApp();
  const sales = state.sales.filter((sale) => sale.stockId === stock.id && !sale.void);
  const groups = new Map();
  for (const sale of sales) {
    const name = sale.destinationType === 'unknown' || sale.pending ? '販売先未割当' :
      sale.destinationType === 'buyer' ? sale.buyerName :
      sale.paymentStatus === 'paid'
        ? (sale.destinationName === '外部販売（名称未入力）' ? '支払い済み' : `支払い済み：${sale.destinationName || sale.buyerName}`)
        : (sale.destinationName === '外部販売（名称未入力）' ? '入金未確認' : `入金未確認：${sale.destinationName || sale.buyerName}`);
    groups.set(name, (groups.get(name) || 0) + sale.qty);
  }
  const inSets = bundleUsed(state, stock.id);
  if (inSets) groups.set('セット販売', inSets);
  groups.delete('販売先未割当');
  const allocation = stockAllocation(state, stock);
  return <div className="sale-status" aria-label={`${stock.name}の割当状況`}>
    <strong>{productDisplayName(stock.name)}</strong>
    <span className="allocation-remaining">未割当 <strong>{allocation.remaining + allocation.unconfirmed}個</strong></span>
    <details className="allocation-detail"><summary>数量の内訳</summary><small>販売用注文 {allocation.ordered} ／ 販売先確定 {allocation.assigned} ／ 販売待ち {allocation.remaining}{allocation.unconfirmed ? ` ／ 既存の販売先未割当 ${allocation.unconfirmed}` : ''}{allocation.moved ? ` ／ 振替 ${allocation.moved}` : ''}</small></details>
    {groups.size > 0 && <div className="assignment-chips">{[...groups].map(([name, qty]) =>
      <span key={name}>{name} {qty}</span>)}</div>}
  </div>;
}

export function SalesWorkspace({ stocks, roundId, mode }) {
  const { state, save } = useApp();
  const [stockId, setStockId] = useState('');
  const [dirty,setDirty]=useState(false);
  const [buyerId, setBuyerId] = useState('');
  const [destinationType, setDestinationType] = useState('buyer');
  const [destinationName, setDestinationName] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('unconfirmed');
  const [quantities, setQuantities] = useState({});
  const [touchedIds, setTouchedIds] = useState([]);
  const [lastSaved, setLastSaved] = useState('');
  const [category, setCategory] = useState(mode === 'buyer' ? '閉じる' : 'パン');
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(today());
  const [salePlace,setSalePlace]=useState('');
  const selectedStock = stocks.find((stock) => stock.id === stockId);
  const shown = stocks.filter((stock) =>
    (mode === 'product' ? stock.id === stockId : true) &&
    (Number(quantities[stock.id]) > 0 || (category !== '閉じる' &&
      (query.trim() || category === 'ALL' || stock.category === category) && normalize(stock.name).includes(normalize(query)))));
  const eligible = stocks.filter((stock) => stockRemaining(state, stock) +
    pendingFor(state, stock).reduce((n, sale) => n + sale.qty, 0) > 0);
  const picked = stocks.filter((stock) => Number(quantities[stock.id]) > 0);
  const destination = {
    destinationType,
    buyerId,
    destinationName,
    paymentStatus: destinationType === 'buyer' ? 'later' : paymentStatus,
    chargeRoundId: roundId,
    salePlace: salePlace.trim(),
    marketId: state.markets.find(m=>m.roundId===roundId&&m.name===salePlace.trim())?.id||null,
  };
  const saveAssignments = async () => {
    const ok = await save((next) => {
      for (const stock of picked) {
        const current = next.stocks.find((item) => item.id === stock.id);
        let qty = Number(quantities[stock.id]);
        const pending = pendingFor(next, current);
        const available = stockRemaining(next, current) + pending.reduce((n, sale) => n + sale.qty, 0);
        if (!Number.isSafeInteger(qty) || qty < 1 || qty > available ||
          (destinationType === 'unknown' && qty > stockRemaining(next, current)))
          throw Error(`${stock.name}の割当数量が残数を超えています`);
        if (destinationType !== 'unknown') {
          for (const sale of pending) {
            const take = Math.min(qty, sale.qty);
            if (take) assignUnknownSale(next, sale.id, take, destination);
            qty -= take;
            if (!qty) break;
          }
        }
        if (qty) addSale(next, current, {
          date: date < current.date ? current.date : date,
          qty, price: current.price, destinationType,
          paymentStatus: destination.paymentStatus,
          buyerId: destinationType === 'buyer' ? buyerId : null,
          destinationName: destinationType === 'external' ? destinationName : '',
          chargeRoundId: destinationType === 'buyer' ? (roundId || current.roundId || null) : null,
          salePlace: destination.salePlace, marketId: destination.marketId, note: '',
        });
      }
    }, '販売先と数量を割り当て');
    if (ok) {
      setDirty(false);
      setLastSaved('登録しました');
      setTouchedIds((ids) => [...new Set([...ids, ...picked.map((stock) => stock.id)])]);
      setQuantities({});
      if (mode === 'product') requestAnimationFrame(() =>
        document.querySelector('.sales-workspace .sale-status')?.scrollIntoView({block:'start'}));
    }
  };
  const destinationFields = <>
      <div className="choice-grid" aria-label="販売先種別">
        <Button secondary={destinationType !== 'buyer'} onClick={() => {setDestinationType('buyer');setDirty(true);}}>個人に請求</Button>
        <Button secondary={destinationType !== 'external'} onClick={() => {setDestinationType('external');setPaymentStatus('paid');setDirty(true);}}>支払い済み</Button>
        <Button secondary={destinationType !== 'unknown'} onClick={() => {setDestinationType('unknown');setDirty(true);}}>未確認</Button>

      </div>
      {destinationType === 'buyer' && <BuyerPicker value={buyerId} onChange={id=>{setBuyerId(id);setDirty(true);}}
        includeTest={stocks.some((stock) => stock.test)}/>}
      {destinationType === 'external' && <>
        <Field label="販売先・団体名（任意）"><input list="sales-destinations" value={destinationName}
          onChange={(e) => {setDestinationName(e.target.value);setDirty(true);}}/></Field>
        <datalist id="sales-destinations">{state.externalDestinations.map((name) =>
          <option key={name} value={name}/>)}</datalist>
      </>}
  </>;
  return <section className="work-section sales-workspace" data-unsaved={dirty && picked.length > 0}>
    <h2>{mode === 'buyer' ? '購入者から入力' : '商品から入力'}</h2>
    {mode === 'product' && <>
      <div className="tabs category-tabs" aria-label="販売商品を絞り込む">
        {['パン', '焼き菓子', 'ALL'].map((item) =>
          <Button key={item} secondary={category !== item} onClick={() => setCategory(item)}>{item==='ALL'?'すべて':item}</Button>)}
      </div>
      <Field label="商品名を検索" type="search" placeholder="商品名を検索" value={query} onChange={(e) => setQuery(e.target.value)}/>
      {!selectedStock && <div className="sales-product-list">{stocks.filter((stock) =>
        (query.trim() || category === 'ALL' || stock.category === category) && normalize(stock.name).includes(normalize(query)))
        .map((stock) => <Button key={stock.id} secondary onClick={() => { setStockId(stock.id); setDirty(false); setQuantities({[stock.id]:1}); }}>
          <span>{productDisplayName(stock.name)}</span><small>未割当 {pendingFor(state, stock).reduce((n, sale) => n + sale.qty, 0)+stockRemaining(state,stock)}個</small>
        </Button>)}</div>}
      {selectedStock && <Button secondary onClick={() => { setStockId(''); setDirty(false); setQuantities({}); setLastSaved(''); }}>別の商品を選ぶ</Button>}
    </>}
    {(mode === 'buyer' || selectedStock) && <>
      {mode === 'buyer' && <>
      {destinationFields}
      </>}
      {mode === 'product' && <div className="sales-allocation-list">
        {selectedStock && <StockStatus stock={selectedStock}/>}
        {lastSaved && <p className="sale-saved" role="status">{lastSaved}</p>}
      </div>}
      {mode === 'product' && <div className="sales-allocation-list">
        {selectedStock && (() => {
          const pending = pendingFor(state, selectedStock).reduce((n, sale) => n + sale.qty, 0);
          const max = stockRemaining(state, selectedStock) + (destinationType === 'unknown' ? 0 : pending);
          return max > 0 && <div className="assignment-quantity"><span>割当数量</span><Qty label={`${selectedStock.name} 割当数量`} min={0} max={max}
            value={Number(quantities[selectedStock.id])||0} onChange={n=>{setDirty(true);setLastSaved('');setQuantities({[selectedStock.id]:n});}}/></div>;
        })()}
      </div>}
      {mode === 'product' && selectedStock &&
        stockRemaining(state, selectedStock) + pendingFor(state, selectedStock).reduce((n, sale) => n + sale.qty, 0) > 0 && <>
      {destinationFields}
      </>}
      {mode === 'buyer' && <>
      <div className="tabs category-tabs" aria-label="販売商品を絞り込む">
        {(category === '閉じる' ? ['商品を選ぶ', 'パン', '焼き菓子'] : ['閉じる', 'パン', '焼き菓子', 'ALL'])
          .map((item) => <Button key={item} secondary={item === '閉じる' ||
            (item !== '商品を選ぶ' && category !== item)}
            onClick={() => setCategory(item === '商品を選ぶ' ? 'パン' : item)}>{item==='ALL'?'すべて':item}</Button>)}
      </div>
      {category !== '閉じる' && <Field label="商品名を検索" type="search" placeholder="商品名を検索" value={query}
        onChange={(e) => setQuery(e.target.value)}/>}
      <div className="sales-allocation-list">
        {shown.filter((stock) => touchedIds.includes(stock.id) ||
          eligible.some((x) => x.id === stock.id)).map((stock) => {
          const pending = pendingFor(state, stock).reduce((n, sale) => n + sale.qty, 0);
          const max = stockRemaining(state, stock) + (destinationType === 'unknown' ? 0 : pending);
          return <div className="card sales-allocation" key={stock.id}>
            <StockStatus stock={stock}/>
            {max > 0 && <Qty label={`${stock.name} 割当数量`} max={max} value={Number(quantities[stock.id])||0}
              onChange={n=>{setDirty(true);setQuantities({...quantities,[stock.id]:n});}}/>}

          </div>;
        })}
        {!stocks.length && <Empty>販売用の在庫はまだありません。</Empty>}
      </div>
      </>}
      {picked.length > 0 && <>
        <details className="sale-date"><summary>販売場所を記録（任意）</summary><Field label="販売場所・催し名"><input list="sales-place-options" value={salePlace} onChange={e=>setSalePlace(e.target.value)}/></Field><datalist id="sales-place-options">{state.markets.filter(m=>m.roundId===roundId&&m.active!==false).map(m=><option key={m.id} value={m.name}/>)}</datalist></details>
        <details className="sale-date"><summary>販売日を変更</summary><Field label="販売日"><input type="date" value={date} onChange={(e) => setDate(e.target.value)}/></Field></details>
        <div className="sales-confirm"><span>{picked.length}商品・{picked.reduce((n, stock) => n + Number(quantities[stock.id]), 0)}個</span>
          <Button disabled={destinationType === 'buyer' && !buyerId} onClick={saveAssignments}>
            {mode === 'product' && selectedStock ? `この${quantities[selectedStock.id]}個を${destinationType === 'external' ? '支払い済み' : destinationType === 'buyer' ? '個人に請求' : '未確認'}として確定` : `この${picked.length}商品の割当を確定`}
          </Button></div>
      </>}
      {mode === 'buyer' && lastSaved && <p className="sale-saved" role="status">{lastSaved}</p>}
    </>}
  </section>;
}
