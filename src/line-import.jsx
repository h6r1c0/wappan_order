import React,{useState} from 'react';
import {Modal,Field,Button,Qty,Check,BuyerPicker,useApp} from './ui';
import {parseLineOrder,applyLineOrder} from './line-import';
import {yen,orderAmount} from './domain';
export function LineImport({round,onClose}){
 const {state,save,notify}=useApp();const [text,setText]=useState(''),[parsed,setParsed]=useState(null),[buyer,setBuyer]=useState(''),[mode,setMode]=useState('replace');
 const edit=(i,key,value)=>setParsed({...parsed,products:parsed.products.map((p,j)=>i===j?{...p,[key]:value}:p)});
 let preview=null;
 if(parsed&&buyer){try{const s=structuredClone(state),r=s.rounds.find(r=>r.id===round.id);applyLineOrder(s,r,parsed,buyer,mode);preview=orderAmount(r,r.orders[buyer]);}catch{}}
 return <Modal title="LINE注文を貼り付け" onClose={onClose}><p>一人分の注文を貼り付け、候補を確認してから反映します。LINEへの接続や自動送信は行いません。</p><Field label="注文文章"><textarea rows="6" placeholder={'近藤\nカリカリ1\n黒糖1'} value={text} onChange={e=>{setText(e.target.value);setParsed(null);}} /></Field><Button onClick={()=>{const p=parseLineOrder(text,state,round);setParsed(p);setBuyer(p.buyerId);}}>注文候補を読み取る</Button>{parsed&&<>
 <h3>① 購入者を確認</h3>{parsed.buyers.length>1&&<p className="notice">複数の購入者名があります。一人分ずつに分けてください。</p>}<BuyerPicker value={buyer} onChange={setBuyer} includeTest={round.test}/>
 <h3>② 商品と数量を確認</h3>{parsed.products.map((p,i)=><div className="card" key={i}><Check label={`「${p.raw}」を反映`} checked={p.include} onChange={v=>edit(i,'include',v)}/><Field label={`商品候補 ${i+1}`}><select value={p.productId} onChange={e=>edit(i,'productId',e.target.value)}><option value="">商品を確認して選んでください</option>{round.products.map(x=><option key={x.id} value={x.id}>{x.name}（{yen(x.price)}）</option>)}</select></Field><Qty label={`取込数量 ${i+1}`} value={p.qty} onChange={v=>edit(i,'qty',v)}/></div>)}
 {parsed.unread.map((p,i)=><div className="notice" key={i}>{p.destinationCandidate?.type==='external'?<>登録済み購入者に一致しません：<strong>{p.raw}</strong><br/>外部販売・団体名の候補です。LINE注文には自動登録しません。</>:<>読み取れない行：{p.raw}</>}<Check label="注文ではない行として除外する" checked={p.ignored} onChange={v=>setParsed({...parsed,unread:parsed.unread.map((x,j)=>i===j?{...x,ignored:v}:x)})}/></div>)}
 <Field label="入力済み注文への反映方法"><select value={mode} onChange={e=>setMode(e.target.value)}><option value="replace">読み取った商品の数量を置き換える（他の商品は残す）</option><option value="add">追加注文として数量を足す</option></select></Field><p className="total">反映後の通常注文合計：{yen(preview)}</p><p className="muted">確認した略称を次回の候補に利用します。未確認のまま登録しません。</p><Button disabled={preview==null} onClick={async()=>{if(await save(s=>applyLineOrder(s,s.rounds.find(r=>r.id===round.id),parsed,buyer,mode),'LINE貼付注文を確認して反映'))onClose();}}>この内容で注文へ反映</Button></>}</Modal>;
}
