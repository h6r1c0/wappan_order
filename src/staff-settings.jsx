import React, {useEffect, useState} from 'react';
import {client} from './store';
import {Button, Field} from './ui';

export function StaffSettings({userId}) {
  const [rows,setRows]=useState(null), [email,setEmail]=useState(''), [busy,setBusy]=useState(false), [notice,setNotice]=useState('');
  const refresh=async()=>{
    const {data,error}=await client.rpc('wappan_admin_list');
    if (!error) setRows(data);
    else if (error.code==='42501') setRows(null);
    else setNotice('係一覧を読み込めませんでした');
  };
  useEffect(()=>{refresh();},[userId]);
  const change=async(action,target)=>{
    const label=action==='transfer'?'管理者を交代':'この係の利用を停止';
    if(!confirm(`${label}しますか？`))return;
    setBusy(true);setNotice('');
    const {error}=await client.rpc('wappan_admin_change',{action_arg:action,target_arg:target});
    setNotice(error?(error.message.includes('LAST_ADMIN')?'最後の管理者は利用停止できません':'変更できませんでした'):'変更しました');
    await refresh();setBusy(false);
  };
  if(rows===null) return null;
  return <section className="staff-settings">
    <h2>係・権限管理</h2>
    <form className="staff-invite" onSubmit={async e=>{
      e.preventDefault();setBusy(true);setNotice('');
      const {data,error}=await client.functions.invoke('staff-invite',{body:{email:email.trim()}});
      setNotice(error ? '招待できませんでした。通信状態を確認してください' : data?.error || (data?.result==='already_active'?'すでに登録されています':'係を登録しました。新規の方には招待メールが届きます'));
      if(!error&&!data?.error)setEmail('');
      await refresh();setBusy(false);
    }}>
      <Field label="係をメールで招待" type="email" required value={email} onChange={e=>setEmail(e.target.value)} />
      <Button type="submit" disabled={busy}>招待</Button>
    </form>
    {notice && <p role="status" className="staff-notice">{notice}</p>}
    <div className="staff-list">{rows.map(person=><div className="staff-row" key={person.id}>
      <span>{person.email}<small>{person.active?(person.role==='admin'?'管理者':'係'):'利用停止中'}</small></span>
      {person.active && person.id!==userId && <div className="staff-actions">
        {person.role!=='admin'&&<button type="button" className="text-action" disabled={busy} onClick={()=>change('transfer',person.id)}>管理者を引き継ぐ ›</button>}
        <button type="button" className="text-action" disabled={busy} onClick={()=>change('disable',person.id)}>利用停止 ›</button>
      </div>}
    </div>)}</div>
  </section>;
}
