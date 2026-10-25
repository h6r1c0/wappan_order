import React,{useEffect,useState} from 'react';
import {Modal,Field,Button,useApp} from './ui.jsx';
import {parseBatchOrder,applyBatchOrder,addSpecialProduct,specialSaleReference} from './batch-import.js';
import {candidates} from './line-import.js';
import {productDisplayName} from './product-names.js';

const labels={personal:'個人注文',sales:'販売用',snack:'おやつ用'};
const complete=x=>x.kind&&x.productId&&x.qty>0&&(x.kind!=='personal'||x.buyerId);
export function BatchImport({round,onClose}){
  const {state,save}=useApp();
  const draftKey=`wappan-batch-draft-${round.id}`;
  const draft=()=>{try{return JSON.parse(sessionStorage.getItem(draftKey)||'null');}catch{return null;}};
  const [text,setText]=useState(()=>draft()?.text||''),[rows,setRows]=useState(()=>draft()?.rows||null);
  const [editing,setEditing]=useState({});
  const [special,setSpecial]=useState({});
  const pending=(round.pendingImports||[]).map(x=>{
    const options=candidates(x.productName,round.products,state.aliases?.products);
    return {...x,pendingId:x.id,productId:options.length===1?options[0].id:'',options,held:options.length!==1,ignored:false};
  });
  useEffect(()=>{if(rows?.length||text)sessionStorage.setItem(draftKey,JSON.stringify({text,rows}));else sessionStorage.removeItem(draftKey);},[text,rows,draftKey]);
  const edit=(i,patch)=>setRows(rows.map((x,j)=>i===j?{...x,...patch}:x));
  const showPending=()=>{setText('');setRows(pending);setEditing({});};
  const buyerless=rows?.filter(x=>!x.ignored&&!x.held&&x.kind==='personal'&&!x.buyerId)||[];
  const ready=rows?.some(x=>!x.ignored)&&rows.every(x=>x.ignored||x.held||complete(x));
  const group=x=>`${x.kind||'?'}:${x.buyerId||''}`;
  return <Modal title="注文内容を貼り付け" onClose={onClose}>
    {(round.pendingImports||[]).length>0&&<p className="notice">保留中 {round.pendingImports.length}行。商品を追加した後、この行だけ登録できます。 <button type="button" className="text-action" onClick={showPending}>保留行を確認</button></p>}
    <Field label="LINE・注文文章"><textarea rows="5" value={text} onChange={e=>{setText(e.target.value);setRows(null);}} placeholder={'湯種食パン 1\nメロンパン 2\nガレット 1'} /></Field>
    <Button secondary disabled={!text.trim()} onClick={()=>{setRows(parseBatchOrder(text,state,round).map(x=>({...x,kind:x.kind||'personal',held:!x.productId})));setEditing({});}}>取込内容を確認</Button>
    {rows&&<>
      <h3>登録前の確認</h3>
      {!rows.length&&<p>商品と数量を読み取れませんでした。</p>}
      {buyerless.length>0&&<Field label="この個人注文の購入者"><select value="" onChange={e=>{if(e.target.value)setRows(rows.map(x=>x.kind==='personal'&&!x.buyerId?{...x,buyerId:e.target.value}:x));}}><option value="">購入者を選択</option>{state.buyers.filter(b=>!b.testOnly||round.test).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}
      {rows.map((row,i)=>{
        const previous=rows[i-1],heading=!previous||group(previous)!==group(row);
        const buyer=state.buyers.find(b=>b.id===row.buyerId);
        const matched=round.products.find(p=>p.id===row.productId);
        const reference=specialSaleReference(round,row.productName||'');
        return <React.Fragment key={row.pendingId||i}>
          {heading&&<h4 className="batch-import-group">{labels[row.kind]||'区分を確認'}{row.kind==='personal'&&`・${buyer?.name||'購入者を確認'}`}</h4>}
          <div className="batch-import-row">
            <div className="batch-import-line">
              <span className="batch-import-name">{matched?productDisplayName(matched.name):row.productName||row.raw}</span>
              <span className="batch-import-qty">{row.qty||'—'}個</span>
              <span className="batch-import-state">{row.ignored?'除外':row.held?'保留':complete(row)?'保存対象':'要確認'}</span>
              <button type="button" className="text-action" aria-label={`${row.raw}を編集`} onClick={()=>setEditing({...editing,[i]:!editing[i]})}>{editing[i]?'閉じる':'編集'}</button>
            </div>
            {(editing[i]||!row.held&&!row.ignored&&!complete(row))&&<div className="batch-import-fields">
              <small className="batch-import-original">元の文章：{row.raw}</small>
              <Field label="扱い"><select value={row.ignored?'ignore':row.held?'hold':'save'} onChange={e=>edit(i,{ignored:e.target.value==='ignore',held:e.target.value==='hold'})}><option value="save">注文として保存</option><option value="hold">保留</option><option value="ignore">除外</option></select></Field>
              <Field label="区分"><select value={row.kind} onChange={e=>edit(i,{kind:e.target.value,buyerId:e.target.value==='personal'?row.buyerId:''})}><option value="">未確認</option>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></Field>
              {row.kind==='personal'&&<Field label="購入者"><select value={row.buyerId} onChange={e=>edit(i,{buyerId:e.target.value})}><option value="">未確認</option>{state.buyers.filter(b=>!b.testOnly||round.test).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}
              <Field label="商品"><select value={row.productId} onChange={e=>edit(i,{productId:e.target.value,held:!e.target.value})}><option value="">未登録・未確認</option>{(row.options?.length?row.options:round.products).map(p=><option key={p.id} value={p.id}>{productDisplayName(p.name)}</option>)}</select></Field>
              <Field label="数量"><input className="batch-import-quantity-input" type="number" inputMode="numeric" min="1" step="1" value={row.qty} onChange={e=>edit(i,{qty:Number(e.target.value)})}/></Field>
              {!row.productId&&<div className="batch-import-special"><button type="button" className="text-action" onClick={()=>setSpecial({...special,[i]:!special[i]})}>商品表にない販売単位を追加</button>
                {special[i]&&<>
                  <p className="muted">3個入りと1個入りは別商品です。価格未確認なら空欄で登録し、請求前に決められます。</p>
                  <Field label="商品名（販売単位を含む）"><input value={row.productName||''} onChange={e=>edit(i,{productName:e.target.value})}/></Field>
                  {reference!=null&&<small>この回で確認された販売実績：{reference}円。商品表の正式価格ではありません。</small>}
                  <Field label="今回の販売価格（分かる場合）"><input type="number" inputMode="numeric" min="0" value={(row.specialPrice===undefined?reference:row.specialPrice)??''} onChange={e=>edit(i,{specialPrice:e.target.value===''?null:Number(e.target.value)})}/></Field>
                  <Field label="仕入単価（分かる場合）"><input type="number" inputMode="numeric" min="0" value={row.specialCost??''} onChange={e=>edit(i,{specialCost:e.target.value===''?null:Number(e.target.value)})}/></Field>
                  <Button secondary onClick={async()=>{let id;if(await save(s=>{id=addSpecialProduct(s,round.id,row.productName,row.specialPrice===undefined?reference:row.specialPrice,row.specialCost??null);},'特別な販売単位の商品を追加')){edit(i,{productId:id,held:false});setSpecial({...special,[i]:false});}}}>この注文回に商品を追加</Button>
                </>}
              </div>}
            </div>}
          </div>
        </React.Fragment>;
      })}
      <p className="muted">保存対象 {rows.filter(x=>!x.ignored&&!x.held).length}行／保留 {rows.filter(x=>!x.ignored&&x.held).length}行。保留は発注・請求に入りません。</p>
      <Button disabled={!ready} onClick={async()=>{if(await save(s=>applyBatchOrder(s,round.id,rows),'貼り付け注文と保留行を保存')){sessionStorage.removeItem(draftKey);onClose();}}}>確認した注文と保留を保存</Button>
    </>}
  </Modal>;
}
