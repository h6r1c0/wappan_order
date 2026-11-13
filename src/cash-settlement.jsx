import React,{useRef,useState} from 'react';
import {useApp,Button,Field,Money} from './ui';
import {today,uid,yen} from './domain';
import {externalCashPosition,recordExternalCash,correctExternalCash,supplierPosition,supplierCashEstimate,saveSupplierPlan,recordSupplierPayment,correctSupplierPayment} from './cash-settlement.js';

export function ExternalCash({round}){
 const {state,save}=useApp(),position=externalCashPosition(state,round);
 const [value,setValue]=useState(null),[note,setNote]=useState(''),[date,setDate]=useState(today()),[reason,setReason]=useState('');
 const request=useRef(uid());
 return <details className="cash-work-section"><summary>外部販売の現金引渡し <span className="status-pill">{position.remaining?`未回収 ${yen(position.remaining)}`:'回収済'}</span></summary>
  <p>登録売上 {yen(position.sales)} ／ 担当者への引渡し {yen(position.received)} ／ 未回収 {yen(position.remaining)}</p>
  <small>購入者の支払済みと、係への現金引渡しは別です。個人の未収や売上は増減しません。</small>
  {position.remaining>0&&<div className="cash-work-form"><Money label="今回受け取った現金" value={value??position.remaining} onChange={setValue}/><Field label="受取日" type="date" value={date} onChange={e=>setDate(e.target.value)}/><Field label="引渡し元・メモ（任意）"><input value={note} onChange={e=>setNote(e.target.value)} placeholder="必要なときだけ入力"/></Field>
   <Button disabled={!(value??position.remaining)||(value??position.remaining)>position.remaining} onClick={async()=>{if(await save(s=>recordExternalCash(s,round.id,value??position.remaining,note,date,request.current),'外部販売の現金引渡しを記録')){request.current=uid();setValue(null);setNote('');}}}>現金引渡しを保存</Button></div>}
  {!!(state.externalCashReceipts||[]).some(x=>x.roundId===round.id)&&<details><summary>引渡し・訂正履歴</summary>{(state.externalCashReceipts||[]).filter(x=>x.roundId===round.id).map(x=>{const corrected=(state.externalCashCorrections||[]).find(c=>c.targetId===x.id);return <div className="cash-history" key={x.id}>{x.date} {yen(x.amount)} ／ {x.note} {corrected?'（訂正済み）':<><Field label={`${x.date}の受渡しの訂正理由`}><input value={reason} onChange={e=>setReason(e.target.value)}/></Field><button type="button" className="text-action" disabled={!reason.trim()} onClick={async()=>{if(await save(s=>correctExternalCash(s,x.id,reason),'現金受渡しを理由付きで訂正'))setReason('');}}>この記録を取り消す</button></>}</div>;})}</details>}
 </details>;
}

export function SupplierPayment({round}){
 const {state,save}=useApp(),position=supplierPosition(state,round),cash=supplierCashEstimate(state,round);
 const [planned,setPlanned]=useState(position.planned),[dueDate,setDueDate]=useState(position.dueDate),[reason,setReason]=useState(''),
  [amount,setAmount]=useState(null),[paidDate,setPaidDate]=useState(today()),[note,setNote]=useState(''),[correction,setCorrection]=useState('');
 const request=useRef(uid()),deadline=position.dueDate<today();
 const status=position.complete?'振込済':cash.ready?'振込できる金額が集まりました':deadline?'期限超過・未振込':position.planned==null?'支払額を確認':'未振込';
 return <details className="cash-work-section supplier-payment"><summary>仕入代金の振込 <span className={`status-pill ${cash.ready?'ready':''}`}>{status}</span></summary>
  <p>納品日 {round.date} ／ 支払期限 {position.dueDate}{position.provisional?'（翌月末・仮）':''}</p>
  {position.legacy?<p className="cash-history">10月16日納品分までの支払い完了は本人確認済みです。個別の振込日・実額は未記録です。</p>:<p>支払予定 {yen(position.planned)} ／ 記録済み振込 {yen(position.paid)} ／ 残り {yen(position.remaining)}</p>}
  {position.reference!=null&&<small>納品書の税込合計 {yen(position.reference)}。支払予定額は照合して確定してください。</small>}
  {!position.complete&&<p className="cash-work-estimate">今回分に明示的に紐づく受取と外部販売の引渡しから、記録済み振込を除いた額 {yen(cash.known)}。{cash.uncertain?'預かり・返金・充当先不明などがあり、振込可能か判定できません。':'ほかの注文回の現金は含みません。実際の手元現金も確認してください。'}</p>}
  <details><summary>支払予定額・期限を設定／訂正</summary><Money label="仕入先への支払予定額" value={planned} onChange={setPlanned}/><Field label="支払期限" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/><Field label="設定・訂正理由"><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="例：納品書を確認"/></Field>
   <Button disabled={!planned||!dueDate||!reason.trim()} onClick={async()=>{if(await save(s=>saveSupplierPlan(s,round.id,{amount:planned,dueDate},reason),'仕入先への支払予定を保存'))setReason('');}}>予定を保存</Button></details>
  <details><summary>実際の振込を記録</summary><small>銀行への送金は行いません。本人が実際に振り込んだ内容だけ登録してください。</small><Money label="実際の振込額" value={amount} onChange={setAmount}/><Field label="振込日" type="date" value={paidDate} onChange={e=>setPaidDate(e.target.value)}/><Field label="振込内容"><input value={note} onChange={e=>setNote(e.target.value)} placeholder="例：仕入先へ振込"/></Field>
   <Button disabled={!amount||!note.trim()} onClick={async()=>{if(await save(s=>recordSupplierPayment(s,round.id,amount,paidDate,note,request.current),'仕入代金の振込を記録')){request.current=uid();setAmount(null);setNote('');}}}>振込を保存</Button></details>
  {!!(state.supplierPayments||[]).some(x=>x.roundId===round.id)&&<details><summary>振込・訂正履歴</summary>{(state.supplierPayments||[]).filter(x=>x.roundId===round.id).map(x=>{const voided=(state.supplierPaymentCorrections||[]).find(c=>c.targetId===x.id);return <div className="cash-history" key={x.id}>{x.date} {yen(x.amount)} ／ {x.note} {voided?'（訂正済み）':<><Field label={`${x.date}の振込の訂正理由`}><input value={correction} onChange={e=>setCorrection(e.target.value)}/></Field><button type="button" className="text-action" disabled={!correction.trim()} onClick={async()=>{if(await save(s=>correctSupplierPayment(s,x.id,correction),'振込履歴を理由付きで訂正'))setCorrection('');}}>この記録を取り消す</button></>}</div>;})}</details>}
  {position.plan?.history?.length>0&&<details><summary>支払予定の変更履歴</summary>{position.plan.history.map((h,i)=><p key={i}>{h.at?.slice(0,10)} {yen(h.amount)} ／ 期限 {h.dueDate}：{h.reason}</p>)}</details>}
 </details>;
}
