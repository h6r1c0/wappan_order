import React from 'react';
import {Qty,buyerCompare} from './ui';

// A product is chosen first; show every buyer without a kana tab or a second picker.
export function BuyerQuantityGrid({buyers,test,value,onChange,name,max}){
  return <div className="buyer-quantity-grid" aria-label={`${name}の購入者別数量`}>
    {buyers.filter(b=>b.id in value || (b.testOnly?test:b.active)).slice().sort(buyerCompare).map(b=><div className="buyer-quantity-cell" key={b.id}>
      <span>{b.name}</span><Qty label={`${name} ${b.name}の数量`} min={0} max={max} value={value[b.id]||0} onChange={qty=>onChange({...value,[b.id]:qty})}/>
    </div>)}
  </div>;
}
