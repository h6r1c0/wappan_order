import React, { useState } from 'react';
import { collectionDueItems, collectionPosition, today, uid, yen } from './domain';
import { useApp, Button, Field, Money } from './ui';

const reasons=['未払い / 未受取','商品請求漏れ','お釣り / 過不足','金額入力間違い','返金','その他'];
function BuyerCollection({round,buyer,row}) {
  const {state,save}=useApp();
  const position=collectionPosition(state,round.id,buyer.id);
  const {items}=collectionDueItems(state,round.id,buyer.id);
  const prior=items.filter(x=>x.roundId!==round.id&&x.balance>0);
  const added=items.filter(x=>x.kind==='additional'&&x.roundId===round.id&&x.balance>0);
  const [open,setOpen]=useState(false),[received,setReceived]=useState(null);
  const [adjustment,setAdjustment]=useState(0),[note,setNote]=useState('');
  const [target,setTarget]=useState('');
  const unresolved=row?.unpriced||[];
  const canFull=position.balance>0&&!unresolved.length;
  const record=async(amount,change,memo,itemId='')=>{
    if(await save(next=>{next.collectionEntries??=[];next.collectionEntries.push({id:uid(),roundId:round.id,buyerId:buyer.id,date:today(),received:amount,adjustment:change,note:memo,...(itemId?{itemId}:{})});},'集金の受取・調整を記録')){
      setReceived(null);setAdjustment(0);setNote('');setTarget('');setOpen(false);
    }
  };
  return <section className="collection-entry">
    <div className="collection-person"><span>{buyer.name}</span><span className={`collection-state ${position.balance===0?'is-paid':'is-due'}`}>{position.balance===0?'受取済':'未受取'}</span></div>
    <div className="collection-right"><strong>{unresolved.length?'請求総額 未確定':yen(position.balance===0?position.current:position.balance)}</strong>
      <div className="collection-actions"><button type="button" className="text-action collection-edit" onClick={()=>setOpen(!open)} aria-expanded={open}>{open?'閉じる':'編集・内訳 ›'}</button>
      {canFull&&!open&&<Button className="collection-pay" onClick={()=>record(position.balance,0,'全額受取')}>全額受取</Button>}</div>
    </div>
    {added.map(x=><p key={x.id} className="collection-alert">⚠ 追加請求 {yen(x.balance)}<small>{x.note}{x.notifiedAmount!=null?` ／ 当初案内済み ${yen(x.notifiedAmount)}`:''}</small></p>)}
    {prior.length>0&&<p className="collection-alert">⚠ 過去未収 {yen(prior.reduce((a,x)=>a+x.balance,0))}<small>{prior.map(x=>`${x.date.slice(5).replace('-','/')} ${x.note} ${yen(x.balance)}`).join(' ／ ')}</small></p>}
    {unresolved.length>0&&<p className="collection-alert">⚠ 販売価格未確認：{unresolved.map(x=>`${x.name} ×${x.qty}`).join('、')}<small>確定済み金額 {yen(position.current)}。請求総額を確定する前に価格を登録してください。</small></p>}
    {open&&<div className="collection-detail">
      <div className="collection-totals"><span>今回請求 {yen(position.current)}</span><span>過去繰越 {yen(position.carry)}</span><strong>集金予定 {yen(position.current+position.carry)}</strong><span>この回の受取 {yen(position.received)}</span></div>
      {row&&<div className="collection-breakdown">
        <h3>内訳</h3><div className="collection-categories">{Object.entries(row.categories||{}).filter(([,v])=>v>0).map(([k,v])=><span key={k}>{k} {yen(v)}</span>)}</div>
        <div className="collection-lines"><div className="collection-line heading"><span>商品名</span><span>数量</span><span>金額</span></div>
        {row.lines.map((line,i)=>{const m=line.description.match(/^(?:\d{4}-\d{2}-\d{2} )?(.*?) ×(\d+)(.*)$/);
          return <div className="collection-line" key={i}><span>{m?.[1]||line.description}{m?.[3]||''}</span><span>{m?.[2]||'—'}</span><span>{line.unpriced?'未確認':yen(line.amount)}</span></div>;})}</div>
      </div>}
      {items.length>0&&<div className="collection-items"><h3>未収・追加請求の内訳</h3>{items.map(x=><div className="collection-item" key={x.id}><span>{x.date.slice(5).replace('-','/')} {x.reason}：{x.note}</span><strong>{x.balance?yen(x.balance):'精算済み'}</strong></div>)}</div>}
      <Field label="支払い対象"><select value={target} onChange={e=>{setTarget(e.target.value);setReceived(null);}}><option value="">古い未収から順に充当</option>
        {items.filter(x=>x.balance>0).map(x=><option value={x.id} key={x.id}>{x.date.slice(5)} {x.note}（残 {yen(x.balance)}）</option>)}</select></Field>
      <Money signed label="実際受取額（返金はマイナス）" value={received} onChange={setReceived}/>
      <details><summary>返金以外の調整</summary><Money signed label="調整額" value={adjustment} onChange={setAdjustment}/></details>
      <Field label="理由・メモ"><input value={note} onChange={e=>setNote(e.target.value)} placeholder="一部受取、返金など"/></Field>
      <Button disabled={(received===null&&!adjustment)||!!unresolved.length||!!target&&((received||0)+(adjustment||0)>items.find(x=>x.id===target)?.balance||received<0)||
        ((received!==position.balance||!!adjustment||!!target)&&!note.trim())}
        onClick={()=>record(received||0,adjustment||0,note.trim()||'全額受取',target)}>受取額を保存</Button>
      {position.entries.length>0&&<details><summary>受取・返金・調整の履歴</summary>{position.entries.map(e=><p key={e.id}>{e.date}　受取 {yen(e.received)}{e.adjustment?` ／ 調整 ${yen(e.adjustment)}`:''}　{e.note}</p>)}</details>}
    </div>}
  </section>;
}
export function RoundCollections({round,rows}) {
  const {state,save}=useApp();
  const [adding,setAdding]=useState(false),[buyerId,setBuyerId]=useState(''),[date,setDate]=useState(''),[amount,setAmount]=useState(null),[reason,setReason]=useState(reasons[0]),[memo,setMemo]=useState('');
  const buyerIds=new Set([...rows.map(x=>x.id),...(state.collectionEntries||[]).filter(x=>x.roundId===round.id).map(x=>x.buyerId)]);
  for(const buyer of state.buyers) if(collectionPosition(state,round.id,buyer.id).carry) buyerIds.add(buyer.id);
  return <div className="stack collection-list">
    {[...buyerIds].sort((a,b)=>(state.buyers.find(x=>x.id===a)?.name||'').localeCompare(state.buyers.find(x=>x.id===b)?.name||'','ja')).map(id=>{
      const buyer=state.buyers.find(x=>x.id===id);
      return buyer&&<BuyerCollection key={id} round={round} buyer={buyer} row={rows.find(x=>x.id===id)}/>;
    })}
    {(!round.test||round.collectionLive)&&<div className="opening-register"><button type="button" className="text-action" onClick={()=>setAdding(!adding)}>＋ アプリ導入前の未収を登録 {adding?'⌃':'›'}</button>
      {adding&&<div className="collection-detail"><Field label="購入者"><select value={buyerId} onChange={e=>setBuyerId(e.target.value)}><option value="">選択してください</option>{state.buyers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      <Field label="対象日" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
      <Money label="未収額" value={amount} onChange={setAmount}/>
      <Field label="理由区分"><select value={reason} onChange={e=>setReason(e.target.value)}>{reasons.map(x=><option key={x}>{x}</option>)}</select></Field>
      <Field label="短いメモ"><input value={memo} onChange={e=>setMemo(e.target.value)} placeholder="例：7/24分 未受取"/></Field>
      <Button disabled={!buyerId||!date||date>round.date||!amount||!memo.trim()} onClick={async()=>{
        if(await save(s=>{s.receivableItems??=[];s.receivableItems.push({id:uid(),kind:'opening',buyerId,date,amount,reason,note:memo.trim()});},'アプリ導入前の未収を登録')){
          setAdding(false);setBuyerId('');setDate('');setAmount(null);setMemo('');
        }
      }}>過去未収を登録</Button></div>}</div>}
  </div>;
}
