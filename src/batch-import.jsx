import React,{useState} from 'react';
import {Modal,Field,Button,Check,useApp} from './ui.jsx';
import {parseBatchOrder,applyBatchOrder} from './batch-import.js';
import {productDisplayName} from './product-names.js';

const labels={personal:'個人注文',sales:'販売用',snack:'おやつ用'};
export function BatchImport({round,onClose}){
  const {state,save}=useApp();
  const [text,setText]=useState(''),[rows,setRows]=useState(null);
  const edit=(i,patch)=>setRows(rows.map((x,j)=>i===j?{...x,...patch}:x));
  const ready=rows?.some(x=>!x.ignored)&&rows.every(x=>x.ignored||x.kind&&x.productId&&x.qty>0&&(x.kind!=='personal'||x.buyerId));
  return <Modal title="注文内容を貼り付け" onClose={onClose}>
    <p className="muted">購入者名と商品・数量を改行で分けます。販売用・おやつ用は区分名を行に書いてください。</p>
    <Field label="LINE・注文文章"><textarea rows="7" value={text} onChange={e=>{setText(e.target.value);setRows(null);}} placeholder={'堀\nツイストドーナツ2個入り ×2\n佐々木\nカリカリ 1\n販売用\nカリカリ 2\nおやつ用\n黒糖 3'} /></Field>
    <Button secondary disabled={!text.trim()} onClick={()=>setRows(parseBatchOrder(text,state,round))}>取込内容を確認</Button>
    {rows&&<>
      <h3>登録前の確認</h3>
      {!rows.length&&<p>商品と数量を読み取れませんでした。</p>}
      {rows.map((row,i)=><div className="batch-import-row" key={i}>
        <Check label={`「${row.raw}」を登録`} checked={!row.ignored} onChange={v=>edit(i,{ignored:!v})}/>
        {!row.ignored&&<div className="batch-import-fields">
          <Field label="区分"><select value={row.kind} onChange={e=>edit(i,{kind:e.target.value,buyerId:e.target.value==='personal'?row.buyerId:''})}><option value="">確認して選択</option>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></Field>
          {row.kind==='personal'&&<Field label="購入者"><select value={row.buyerId} onChange={e=>edit(i,{buyerId:e.target.value})}><option value="">確認して選択</option>{state.buyers.filter(b=>!b.testOnly||round.test).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}
          <Field label="商品"><select value={row.productId} onChange={e=>edit(i,{productId:e.target.value})}><option value="">確認して選択</option>{(row.options.length?row.options:round.products).map(p=><option key={p.id} value={p.id}>{productDisplayName(p.name)}</option>)}</select></Field>
          <Field label="数量"><input type="number" inputMode="numeric" min="1" step="1" value={row.qty} onChange={e=>edit(i,{qty:Number(e.target.value)})}/></Field>
        </div>}
      </div>)}
      <p className="muted">未確認の行は保存しません。同じ商品が登録済みの場合は止めて確認します。</p>
      <Button disabled={!ready} onClick={async()=>{if(await save(s=>applyBatchOrder(s,round.id,rows),'貼り付け注文を区分別に保存'))onClose();}}>確認した注文を保存</Button>
    </>}
  </Modal>;
}
