import React,{useEffect,useMemo,useState} from 'react';
import {useApp,Button,Field,copyText} from './ui.jsx';
import {deadlines,guideText,supplierSettings,neededLines,planDispatch,recordDispatch,acceptDispatchCorrection,shortDate,validDate} from './supplier-order.js';
import {today} from './domain.js';
import {extractTemplate,renderSupplierPdf,toBase64} from './supplier-pdf.js';

function CompactSettings(){
  const {state,save,notify}=useApp();
  const current=supplierSettings(state);
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(current);
  return <div className="supplier-compact-setting"><span>注文の連絡先：{current.contact||'未設定'}</span> <button type="button" className="text-action" onClick={()=>{setDraft(current);setEditing(!editing);}}>定型文・基本設定を変更</button>
    {editing&&<div className="supplier-setting-editor">
      <Field label="注文の連絡先"><input value={draft.contact} onChange={e=>setDraft({...draft,contact:e.target.value})}/></Field>
      <Field label="発注書のお客様名"><input value={draft.customer} onChange={e=>setDraft({...draft,customer:e.target.value})}/></Field>
      <Field label="宛名"><input value={draft.addressee} onChange={e=>setDraft({...draft,addressee:e.target.value})}/></Field>
      <Field label="発注書の挨拶"><input value={draft.greeting} onChange={e=>setDraft({...draft,greeting:e.target.value})}/></Field>
      <Field label="案内の定型文（{連絡先}を使用できます）"><textarea rows="3" value={draft.notice} onChange={e=>setDraft({...draft,notice:e.target.value})}/></Field>
      <div className="supplier-setting-days"><Field label="焼き菓子：納品日の何日前"><input type="number" min="0" max="90" value={draft.sweetsDays} onChange={e=>setDraft({...draft,sweetsDays:Number(e.target.value)})}/></Field><Field label="パン：納品日の何日前"><input type="number" min="0" max="90" value={draft.breadDays} onChange={e=>setDraft({...draft,breadDays:Number(e.target.value)})}/></Field></div>
      <small>わっぱんへの正式な発注期限は未確認のため、注文回ごとに必要になってから設定します。</small>
      <Button onClick={async()=>{if(!draft.contact.trim()||!draft.customer.trim()||![draft.sweetsDays,draft.breadDays].every(x=>Number.isSafeInteger(x)&&x>=0&&x<=90)){notify('連絡先・お客様名・締切日数を確認してください');return;}if(await save(s=>{s.supplierOrderSettings={...draft,contact:draft.contact.trim(),customer:draft.customer.trim()};},'発注の基本設定を変更'))setEditing(false);}}>基本設定を保存</Button>
    </div>}</div>;
}
export function OrderGuide({round}){
  const {state,save,notify}=useApp();
  const settings=supplierSettings(state),[selected,setSelected]=useState([round.id]);
  const [editing,setEditing]=useState(false),[schedule,setSchedule]=useState(deadlines(round,settings));
  const [notice,setNotice]=useState(''),[custom,setCustom]=useState('');
  const rounds=state.rounds.filter(r=>selected.includes(r.id));
  const auto=useMemo(()=>rounds.length?guideText(rounds,settings):'', [JSON.stringify(rounds.map(r=>[r.id,r.date,r.orderDeadlines])),JSON.stringify(settings)]);
  const text=custom||`${auto}${notice.trim()?`\n\n${notice.trim()}`:''}`;
  const setDate=(key,value)=>setSchedule({...schedule,[key]:value});
  return <details className="supplier-work"><summary>注文募集の案内文を作る</summary>
    <CompactSettings/>
    {state.rounds.filter(r=>r.test===round.test&&r.date!==round.date).length>0&&<details><summary>複数の納品日をまとめる</summary>{state.rounds.filter(r=>r.test===round.test).sort((a,b)=>a.date.localeCompare(b.date)).map(r=><label key={r.id} className="supplier-round-choice"><input type="checkbox" checked={selected.includes(r.id)} disabled={r.id===round.id} onChange={e=>setSelected(e.target.checked?[...selected,r.id]:selected.filter(x=>x!==r.id))}/>{shortDate(r.date)}着</label>)}</details>}
    <div className="supplier-deadline-short">園内注文〆切：焼き菓子 {shortDate(deadlines(round,settings).sweets)} ／ パン {shortDate(deadlines(round,settings).bread)} <button type="button" className="text-action" onClick={()=>{setSchedule(deadlines(round,settings));setEditing(!editing);}}>変更</button></div>
    {[['焼き菓子',deadlines(round,settings).sweets],['パン',deadlines(round,settings).bread]].filter(([,date])=>date>=today()&&date<=new Date(Date.parse(`${today()}T00:00:00Z`)+3*86400000).toISOString().slice(0,10)).map(([label,date])=><small className="supplier-due" key={label}>{label}の園内締切 {shortDate(date)}が近づいています。</small>)}
    {editing&&<div className="supplier-setting-editor"><Field label="焼き菓子の園内締切"><input type="date" value={schedule.sweets} onChange={e=>setDate('sweets',e.target.value)}/></Field><Field label="パンの園内締切"><input type="date" value={schedule.bread} onChange={e=>setDate('bread',e.target.value)}/></Field>
      {schedule.exceptions.map((x,i)=><div key={i} className="supplier-exception"><Field label="別締切の対象"><input value={x.label} onChange={e=>setSchedule({...schedule,exceptions:schedule.exceptions.map((v,j)=>j===i?{...v,label:e.target.value}:v)})}/></Field><Field label="締切日"><input type="date" value={x.date} onChange={e=>setSchedule({...schedule,exceptions:schedule.exceptions.map((v,j)=>j===i?{...v,date:e.target.value}:v)})}/></Field><button type="button" className="text-action" onClick={()=>setSchedule({...schedule,exceptions:schedule.exceptions.filter((_,j)=>i!==j)})}>削除</button></div>)}
      <button type="button" className="text-action" onClick={()=>setSchedule({...schedule,exceptions:[...schedule.exceptions,{label:'',date:''}]})}>別の締切を追加</button>
      <Field label="わっぱんへの実際の発注期限（確認後に設定・空欄可）"><input type="date" value={schedule.supplier||''} onChange={e=>setDate('supplier',e.target.value)}/></Field>
      <Button onClick={async()=>{if(!validDate(schedule.sweets)||!validDate(schedule.bread)||schedule.supplier&&!validDate(schedule.supplier)||schedule.exceptions.some(x=>!x.label.trim()||!validDate(x.date))){notify('締切日と対象を確認してください');return;}if(await save(s=>{const r=s.rounds.find(x=>x.id===round.id);r.orderDeadlines={...schedule,exceptions:schedule.exceptions.map(x=>({...x,label:x.label.trim()}))};},'注文回の締切を変更'))setEditing(false);}}>締切を保存</Button>
    </div>}
    <Field label="今回だけのお知らせ（任意）"><textarea rows="2" value={notice} onChange={e=>{setNotice(e.target.value);setCustom('');}} placeholder="例：クリスマス限定商品があります"/></Field>
    <Field label="LINEへ送る文章"><textarea rows="10" value={text} onChange={e=>setCustom(e.target.value)}/></Field>
    {custom&&<button type="button" className="text-action" onClick={()=>setCustom('')}>自動文に戻す</button>}
    <Button onClick={async()=>{try{await copyText(text);notify('案内文をコピーしました');}catch{notify('コピーできませんでした');}}}>案内文をコピー</Button>
  </details>;
}

export function SupplierOrder({round}){
  const {state,save,notify}=useApp();
  const [busy,setBusy]=useState(false),[chosen,setChosen]=useState(''),[templateDraft,setTemplateDraft]=useState(null);
  const [selected,setSelected]=useState(null),[mappings,setMappings]=useState({}),[units,setUnits]=useState({}),[notice,setNotice]=useState(''),[prepared,setPrepared]=useState(null);
  const [pdfUrl,setPdfUrl]=useState('');
  useEffect(()=>()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl);},[pdfUrl]);
  const templates=(state.supplierTemplates||[]).filter(x=>!x.month||x.month===round.date.slice(0,7));
  const template=templates.find(x=>x.id===chosen)||templates[0];
  const needed=neededLines(state,round);
  const defaults=template?needed.filter(x=>template.kind==='sweets'?(round.products.find(p=>p.id===x.id)?.category==='焼き菓子'):round.products.find(p=>p.id===x.id)?.category!=='焼き菓子').map(x=>x.id):[];
  const ids=selected??defaults;
  const activeTemplate=template?{...template,units:{...template.units,...units}}:null;
  const plan=template?planDispatch(state,round,activeTemplate,ids,{...template.mappings,...mappings}):null;
  const previous=(state.supplierDispatches||[]).filter(x=>x.roundId===round.id);
  const supplierDue=deadlines(round,supplierSettings(state)).supplier;
  const importFile=async file=>{if(!file)return;setBusy(true);try{const t=await extractTemplate(file);setTemplateDraft(t);}catch(e){notify(e.message);}finally{setBusy(false);}};
  const generate=async()=>{if(!template||!plan||plan.issues.length){notify(plan?.issues.join('／')||'用紙を選んでください');return;}
    setBusy(true);try{
      const font=await fetch(new URL('./assets/fonts/NotoSansJP-Regular.ttf',import.meta.url)).then(r=>{if(!r.ok)throw Error('日本語フォントを取得できません');return r.arrayBuffer();});
      const settings=supplierSettings(state);
      const orderDate=new Date().toISOString().slice(0,10);
      const bytes=await renderSupplierPdf(template,plan,settings,round.date,{fontBytes:font,notice,orderDate});
      const file=new File([bytes],[round.date,template.name.replace(/\.pdf$/i,''),'発注書.pdf'].join('_'),{type:'application/pdf'});
      if(pdfUrl)URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(file));
      setPrepared({id:crypto.randomUUID(),roundId:round.id,templateId:template.id,templateName:template.name,createdAt:new Date().toISOString(),sentAt:null,lines:plan.lines.map(x=>({productId:x.id,name:x.name,qty:x.qty,orderedBefore:x.ordered})),placements:plan.placements,notes:plan.notes,notice,issues:[],pdf:toBase64(bytes),file});
    }catch(e){notify(e.message);setPrepared(null);}finally{setBusy(false);}
  };
  return <section className="supplier-work supplier-dispatch"><h3>わっぱんへの発注書</h3>
    <small>発注書を作るだけでは発注済みになりません。実際に送付した後で記録します。</small>
    {supplierDue&&needed.length>0&&supplierDue>=today()&&supplierDue<=new Date(Date.parse(`${today()}T00:00:00Z`)+3*86400000).toISOString().slice(0,10)&&<small className="supplier-due">わっぱんへの発注期限 {shortDate(supplierDue)}が近づいています。</small>}
    <div className="supplier-compact-setting">今回必要：{needed.filter(x=>x.qty>0).length}商品{needed.some(x=>x.qty<0)?' ／ 減数連絡あり':''}。送付済み履歴がない過去回は未発注と断定しません。</div>
    {needed.some(x=>x.qty<0)&&<p className="notice">減数・取消は先方へ連絡が必要です。発注済み数量は自動で減らしません。</p>}
    <Field label="使用するわっぱんの注文書"><select value={template?.id||''} onChange={e=>{setChosen(e.target.value);setSelected(null);setMappings({});setUnits({});setPrepared(null);}}><option value="">用紙を選ぶ</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
    <details><summary>今月の注文書PDFを取り込む</summary><Field label="わっぱん提供の注文書PDF"><input type="file" accept="application/pdf" onChange={e=>importFile(e.target.files[0])}/></Field>
      {templateDraft&&<><p>{templateDraft.name}：{templateDraft.rows.length}商品行を読み取りました。{templateDraft.month&&`対象 ${templateDraft.month}`}</p><details><summary>読み取った商品欄を確認</summary>{templateDraft.rows.map(x=><small key={x.id} className="supplier-row">{x.name}</small>)}</details><Button onClick={async()=>{if(await save(s=>{s.supplierTemplates??=[];if(s.supplierTemplates.some(x=>x.name===templateDraft.name&&x.month===templateDraft.month))throw Error('同じ用紙名を登録済みです。過去の用紙を上書きしません');s.supplierTemplates.push(templateDraft);},'わっぱん注文書PDFを登録')){setChosen(templateDraft.id);setTemplateDraft(null);}}}>この用紙を登録</Button></>}
    </details>
    {template&&<><div className="supplier-lines"><strong>今回の発注内容</strong>{needed.map(x=><label key={x.id} className="supplier-line"><input type="checkbox" checked={ids.includes(x.id)} onChange={e=>{setSelected(e.target.checked?[...ids,x.id]:ids.filter(id=>id!==x.id));setPrepared(null);}}/><span>{x.name}</span><b>{x.qty>0?`＋${x.qty}`:x.qty} 注文単位</b><small>送付済み {x.ordered}</small></label>)}</div>
      {plan?.placements.length>0&&<p>{plan.placements.length}商品を注文欄へ記入。{plan.notes.length}件を通信欄または別紙へ記入します。</p>}
      {plan?.issues.length>0&&<p role="alert" className="notice">{plan.issues.join('／')}</p>}
      <details><summary>注文欄の対応を確認・修正</summary><small>通常は自動判定します。似た商品・異なる注文単位は、該当商品だけ選んでください。</small>{needed.filter(x=>ids.includes(x.id)).map(x=><Field key={x.id} label={x.name}><select value={mappings[x.id]??template.mappings?.[x.id]??''} onChange={e=>{setMappings({...mappings,[x.id]:e.target.value});setPrepared(null);}}><option value="">自動判定</option><option value="notes">注文欄なし・通信欄へ</option>{template.rows.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>)}
        {needed.filter(x=>units[x.id]!=null||template.units?.[x.id]!=null||plan?.issues.some(issue=>issue.startsWith(`${x.name}：注文単位が不明`))).map(x=><Field key={`unit:${x.id}`} label={`${x.name}の発注単位（例：1袋）`}><input value={units[x.id]??template.units?.[x.id]??''} onChange={e=>{setUnits({...units,[x.id]:e.target.value});setPrepared(null);}}/></Field>)}
        {(Object.keys(mappings).length>0||Object.keys(units).length>0)&&<Button secondary onClick={async()=>{if(await save(s=>{const t=s.supplierTemplates.find(x=>x.id===template.id);t.mappings={...t.mappings,...mappings};t.units={...t.units,...units};},'注文書の商品欄・注文単位を保存')){setMappings({});setUnits({});}}}>今回の対応を保存</Button>}
      </details>
      {plan?.notes.length>0&&<details><summary>通信欄の内容</summary>{plan.notes.map((x,i)=><p key={i}>{x}</p>)}</details>}
      <Field label="今回だけの連絡事項（任意）"><textarea rows="2" value={notice} onChange={e=>{setNotice(e.target.value);setPrepared(null);}}/></Field>
      <Button disabled={busy||!!plan?.issues.length} onClick={generate}>{busy?'準備中…':'発注書PDFを作成して確認'}</Button>
    </>}
    {prepared&&pdfUrl&&<div className="supplier-preview-result"><p>作成した内容を確認してください。発注済みにはまだ記録していません。</p><a href={pdfUrl} target="_blank" rel="noopener noreferrer">PDFを開く ›</a>　<a href={pdfUrl} download={prepared.file.name}>PDFを保存 ›</a>{navigator.canShare?.({files:[prepared.file]})&&<button type="button" className="text-action" onClick={()=>navigator.share({files:[prepared.file],title:prepared.file.name}).catch(()=>{})}>PDFを共有・印刷 ›</button>}
      <Button secondary onClick={async()=>{if(!confirm('実際にこの発注書を送付しましたか？作成・印刷だけでは記録しません。'))return;setBusy(true);try{const entry={...prepared};delete entry.file;entry.sentAt=new Date().toISOString();if(await save(s=>recordDispatch(s,entry),'送付済み発注書を記録')){setPrepared(null);notify('この発注書の数量を送付済みとして記録しました');}}finally{setBusy(false);}}}>実際に送付した後、発注済みとして記録</Button></div>}
    {previous.length>0&&<details><summary>送付済みの発注書（{previous.length}件）</summary>{previous.map(p=><SentPdf key={p.id} item={p} onAccept={async()=>{if(!confirm('わっぱんが減数・取消を了承した事実を確認しましたか？'))return;await save(s=>acceptDispatchCorrection(s,p.id),'発注減数の了承を記録');}}/>)}</details>}
  </section>;
}
function SentPdf({item,onAccept}){
  const [url,setUrl]=useState('');
  useEffect(()=>{const next=URL.createObjectURL(new Blob([Uint8Array.from(atob(item.pdf),c=>c.charCodeAt(0))],{type:'application/pdf'}));setUrl(next);return()=>URL.revokeObjectURL(next);},[item.id,item.pdf]);
  return <div className="supplier-sent"><strong>{item.templateName} ／ {new Date(item.sentAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</strong><small>{item.lines.map(x=>`${x.name} ${x.qty>0?'+':''}${x.qty}`).join('、')}</small>{url&&<a href={url} target="_blank" rel="noopener noreferrer">送付時のPDFを見る ›</a>}{item.lines.some(x=>x.qty<0)&&(item.acceptedAt?<small>減数了承済み</small>:<button type="button" className="text-action" onClick={onAccept}>先方の減数了承を記録</button>)}</div>;
}
