import React, { useState } from 'react';
import { collectionPosition, today, uid, yen } from './domain';
import { useApp, Button, Field, Money } from './ui';

function BuyerCollection({ round, buyer, row }) {
  const { state, save } = useApp();
  const position = collectionPosition(state, round.id, buyer.id);
  const [open, setOpen] = useState(false);
  const [received, setReceived] = useState(null);
  const [adjustment, setAdjustment] = useState(0);
  const [note, setNote] = useState('');
  return <section className="collection-entry">
    <div className="collection-person"><span>{buyer.name}</span>
      <span className={`collection-state ${position.balance===0?'is-paid':'is-due'}`}>{position.balance===0?'受取済':'未受取'}</span></div>
    <div className="collection-right"><strong>{yen(position.current)}</strong>
    {position.balance > 0 && !open && <Button className="collection-pay" onClick={async()=>{
      if(await save(next=>{next.collectionEntries??=[];next.collectionEntries.push({id:uid(),roundId:round.id,buyerId:buyer.id,date:today(),received:position.balance,adjustment:0,note:'全額受取'});},'全額の集金を記録'))setOpen(false);
    }}>全額受取</Button>}</div>
    <button type="button" className="text-action collection-edit" onClick={()=>setOpen(!open)} aria-expanded={open}>{open?'閉じる':'› 編集・内訳'}</button>
    {open && row && <details className="collection-breakdown"><summary>種類別・内訳を見る</summary>
      {Object.entries(row.categories || {}).filter(([, amount]) => amount > 0).map(([name, amount]) =>
        <p key={name}>{name} {yen(amount)}</p>)}
      <details><summary>商品明細を見る</summary>{row.lines.map((line, index) =>
        <p key={index}>{line.description}　{yen(line.amount)}</p>)}</details>
    </details>}
    {open && (position.carry !== 0 || position.entries.length > 0) &&
      <p className="collection-balance">前回繰越 {yen(position.carry)} ／ 未精算残高 {yen(position.balance)}</p>}
    {open && <>
      <p>今回請求 {yen(position.current)} ＋ 前回繰越 {yen(position.carry)} ＝ 集金予定 {yen(position.current + position.carry)}</p>
      <Money signed label={`${buyer.name} 実際受取額（返金はマイナス）`} value={received} onChange={setReceived}/>
      <details><summary>返金以外の調整を記録</summary>
        <Money signed label={`${buyer.name} 調整額（残高を減らすときプラス）`} value={adjustment} onChange={setAdjustment}/>
      </details>
      {(received !== null && received !== position.balance || !!adjustment) && <Field label="理由・メモ"><input value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="受取、返金、差額調整など"/></Field>}
      <Button disabled={(received === null && !adjustment) || ((received !== position.balance || !!adjustment) && !note.trim())} onClick={async () => {
        if (await save((next) => {
          next.collectionEntries ??= [];
          next.collectionEntries.push({ id: uid(), roundId: round.id, buyerId: buyer.id,
            date: today(), received: received || 0, adjustment: adjustment || 0, note: note.trim() || '全額受取' });
        }, '集金の受取・調整を記録')) {
          setReceived(null); setAdjustment(0); setNote(''); setOpen(false);
        }
      }}>受取額を保存</Button>
      {position.entries.length > 0 && <details><summary>受取・返金・調整の履歴を見る</summary>
        {position.entries.map((entry) => <p key={entry.id}>{entry.date}　受取 {yen(entry.received)}
          {entry.adjustment ? ` ／ 調整 ${yen(entry.adjustment)}` : ''}　{entry.note}</p>)}
      </details>}
    </>}
  </section>;
}
export function RoundCollections({ round, rows }) {
  const { state } = useApp();
  const buyerIds = new Set([...rows.map((row) => row.id),
    ...(state.collectionEntries || []).filter((entry) => entry.roundId === round.id).map((entry) => entry.buyerId)]);
  for (const earlier of state.rounds.filter((r) => r.test === round.test && r.date < round.date)) {
    for (const row of state.buyers) {
      if (collectionPosition(state, round.id, row.id).carry) buyerIds.add(row.id);
    }
  }
  return <div className="stack collection-list">{[...buyerIds].sort((a,b)=>
    (state.buyers.find(x=>x.id===a)?.name||'').localeCompare(state.buyers.find(x=>x.id===b)?.name||'','ja')).map((id) => {
    const buyer = state.buyers.find((item) => item.id === id);
    return buyer && <BuyerCollection key={id} round={round} buyer={buyer}
      row={rows.find((item) => item.id === id)}/>;
  })}</div>;
}
