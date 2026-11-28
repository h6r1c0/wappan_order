import {deliveryTotals} from './commerce.js';
import {productImportIdentity} from './product-names.js';

const datePattern=/^\d{4}-\d{2}-\d{2}$/;
export const validDate=value=>datePattern.test(value||'')&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
export function offsetDate(date,days){
  if(!validDate(date))throw Error('納品日を確認してください');
  const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
export const shortDate=date=>`${Number(date.slice(5,7))}/${Number(date.slice(8))}（${'日月火水木金土'[new Date(`${date}T00:00:00Z`).getUTCDay()]}）`;
export const defaultDeadlines=(date,settings=defaultSettings)=>({sweets:offsetDate(date,-settings.sweetsDays),bread:offsetDate(date,-settings.breadDays),supplierSweets:offsetDate(date,-(settings.supplierSweetsDays??14)),supplierBread:offsetDate(date,-(settings.supplierBreadDays??7)),exceptions:[]});
export const deadlines=(round,settings=defaultSettings)=>{
  const saved=round.orderDeadlines||{};
  const normal=defaultDeadlines(round.date,settings);
  // The earlier draft had one optional supplier deadline. Preserve a date that was
  // explicitly entered, while an empty draft inherits the newly confirmed defaults.
  const legacy=saved.supplier&&validDate(saved.supplier)?saved.supplier:null;
  return {...normal,...saved,
    supplierSweets:saved.supplierSweets||legacy||normal.supplierSweets,
    supplierBread:saved.supplierBread||legacy||normal.supplierBread,
    exceptions:saved.exceptions||[]};
};
export const defaultSettings={contact:'花房母',customer:'おひさま保育園 父母の会',addressee:'わっぱん ご担当者様',greeting:'いつもありがとうございます。下記のとおりお願いいたします。',notice:'税込価格の1円台を切り捨てた額で販売します。\n欲しい方は品名と数量を{連絡先}までご連絡ください。',sweetsDays:16,breadDays:9,supplierSweetsDays:14,supplierBreadDays:7};
export const supplierSettings=state=>({...defaultSettings,...state.supplierOrderSettings});
export function guideText(rounds,settings=supplierSettings({})){
  if(!rounds.length)throw Error('納品日を選んでください');
  const ordered=[...rounds].sort((a,b)=>a.date.localeCompare(b.date));
  const header=ordered.length===1?`${Number(ordered[0].date.slice(5,7))}月のわっぱん\n${shortDate(ordered[0].date)}到着`:`${[...new Set(ordered.map(r=>Number(r.date.slice(5,7))))].join('・')}月のわっぱん（${ordered.map(r=>shortDate(r.date)).join('、')}到着）`;
  const blocks=ordered.map(round=>{
    const d=deadlines(round,settings);
    const entries=[['焼き菓子',d.sweets],...d.exceptions.map(x=>[x.label,x.date]),[d.breadLabel|| (d.exceptions.length?'パン（別締切の商品を除く）':'パン'),d.bread]];
    return `${ordered.length>1?`\n${shortDate(round.date)}到着分\n`:''}注文〆切日\n${entries.map(([label,date])=>`${label}　${shortDate(date)}`).join('\n')}`;
  });
  return `${header}\n\n${blocks.join('\n\n')}\n\n${settings.notice.replaceAll('{連絡先}',settings.contact).trim()}`;
}

export const productKey=name=>productImportIdentity(name||'').normalize('NFKC').replace(/[\s　・･]/g,'').toLowerCase();
export const productFamily=name=>productKey(name).replace(/【スライス】/g,'').replace(/\d+(?:個|本)(?:入り)?/g,'').replace(/約\d+(?:g|㎝|cm)/g,'').replace(/\(冷\)/g,'');
export const packSize=name=>{const match=productKey(name).match(/(\d+)個(?:入り)?/);return match?Number(match[1]):null;};
export function neededLines(state,round){
  const sent=new Map();
  for(const doc of state.supplierDispatches||[]){if(doc.roundId!==round.id||doc.status!=='sent')continue;
    for(const line of doc.lines)if(line.qty>0||doc.acceptedAt)sent.set(line.productId,(sent.get(line.productId)||0)+line.qty);
  }
  const current=deliveryTotals(state,round);
  return current.map(line=>({...line,qty:line.qty-(sent.get(line.id)||0),ordered:sent.get(line.id)||0}))
    .concat([...sent].filter(([id])=>!current.some(p=>p.id===id)).map(([id,qty])=>({id,name:round.products.find(p=>p.id===id)?.name||'過去の発注商品',qty:-qty,ordered:qty})))
    .filter(line=>line.qty!==0);
}
export function planDispatch(state,round,template,selectedIds=null,mappingOverrides={}){
  if(!template||!Array.isArray(template.rows)||!template.pdf)throw Error('この納品日に使う注文書PDFを選んでください');
  if(template.month&&template.month!==round.date.slice(0,7)&&template.kind==='bread')throw Error('注文書の対象月と納品月が一致しません');
  const all=neededLines(state,round);
  const lines=all.filter(x=>selectedIds?selectedIds.includes(x.id):template.kind==='sweets'?round.products.find(p=>p.id===x.id)?.category==='焼き菓子':round.products.find(p=>p.id===x.id)?.category!=='焼き菓子');
  const issues=[],placements=[],notes=[];
  if(template.kind==='sweets'&&all.some(x=>x.qty>0&&round.products.find(p=>p.id===x.id)?.category!=='焼き菓子'))notes.push(`パンは後日あらためて注文します。${round.date.replaceAll('-','/')}納品分としてお願いいたします。`);
  for(const line of lines){
    const same=template.rows.filter(row=>productFamily(row.name)===productFamily(line.name));
    const exact=same.filter(row=>packSize(row.name)===packSize(line.name));
    const override=mappingOverrides[line.id];
    if(override&&override!=='notes'&&!template.rows.some(x=>x.id===override)){issues.push(`${line.name}：選択した注文欄が見つかりません`);continue;}
    if(!override&&same.length>1&&exact.length!==1){issues.push(`${line.name}：注文欄が複数あり対応先を確定できません`);continue;}
    const row=override==='notes'?null:override?template.rows.find(x=>x.id===override):exact.length===1?exact[0]:same.length===1?same[0]:null;
    if(!row&&!override&&template.rows.some(x=>{const family=productFamily(x.name),wanted=productFamily(line.name);return wanted.length>=4&&family.length>=4&&(family.includes(wanted)||wanted.includes(family));})){
      issues.push(`${line.name}：似た商品欄があります。記入先を確認してください`);continue;
    }
    const actual=packSize(line.name),listed=row?packSize(row.name):null;
    if(line.qty<0){
      if((state.supplierDispatches||[]).some(d=>d.roundId===round.id&&d.status==='sent'&&!d.acceptedAt&&d.lines.some(x=>x.productId===line.id&&x.qty<0)))issues.push(`${line.name}：減数の連絡を送付済みです。先方の回答を記録してください`);
      notes.push(`${line.name}：送付済み${line.ordered}注文単位から${-line.qty}注文単位の減数・取消をご相談します。`);continue;
    }
    if(line.ordered>0)notes.push(`先日注文しました${line.name}${line.ordered}注文単位に加え、${line.qty}注文単位を追加でお願いいたします。合計${line.ordered+line.qty}注文単位です。`);
    const sliced=/【スライス】/.test(line.name);
    if(sliced&&(!row||row.kind!=='bread-left'||row.y>=160)){issues.push(`${line.name}：スライス用の注文欄を確定できません`);continue;}
    if(row&&(actual===listed||actual==null&&listed==null)){placements.push({productId:line.id,rowId:row.id,qty:line.qty,sliced});continue;}
    if(row&&actual===1&&listed>1&&line.ordered===0&&!lines.some(other=>other.id!==line.id&&productFamily(other.name)===productFamily(line.name)&&packSize(other.name)===listed)){
      placements.push({productId:line.id,rowId:row.id,qty:line.qty,packCorrection:'1個入り'});
      notes.push(`${line.name}は1個入りでお願いいたします。`);continue;
    }
    const unit=actual!=null?`${actual}個入り`:(template.units?.[line.id]||'');
    if(!unit){issues.push(`${line.name}：注文単位が不明です。商品欄の対応か注文単位を確認してください`);continue;}
    notes.push(`${line.name}（${unit}）を${line.qty}注文単位${row?'追加で':''}お願いいたします。`);
  }
  const seen=new Set();for(const p of placements){const key=`${p.rowId}:${p.sliced?'slice':'normal'}`;if(seen.has(key))issues.push('同じ注文欄に異なる商品が重なっています');seen.add(key);}
  if(!lines.length)issues.push('今回発注する商品がありません');
  return {lines,placements,notes,issues};
}

export function recordDispatch(state,entry){
  if(state.supplierDispatches?.some(x=>x.id===entry.id))throw Error('この発注書は送付済みです');
  if(!state.rounds.some(r=>r.id===entry.roundId))throw Error('注文回が見つかりません');
  if(!entry.pdf||!entry.lines?.length||entry.issues?.length)throw Error('未確認の発注書は送付済みにできません');
  if(entry.lines.some(x=>!Number.isSafeInteger(x.qty)||!x.productId))throw Error('発注数量を確認してください');
  // A second device may have saved a different dispatch after this PDF was made.
  // Keep the exact sent snapshot, but never add it twice against a newer baseline.
  const ordered=new Map();
  for(const doc of state.supplierDispatches||[])if(doc.roundId===entry.roundId&&doc.status==='sent')
    for(const line of doc.lines)if(line.qty>0||doc.acceptedAt)
      ordered.set(line.productId,(ordered.get(line.productId)||0)+line.qty);
  if(entry.lines.some(x=>x.orderedBefore!=null&&x.orderedBefore!==(ordered.get(x.productId)||0)))
    throw Error('別の発注書が先に送付済みです。最新の発注済み数量と、この用紙を照合してください');
  state.supplierDispatches??=[];
  state.supplierDispatches.push({...structuredClone(entry),status:'sent'});
}
export function acceptDispatchCorrection(state,id){
  const item=(state.supplierDispatches||[]).find(x=>x.id===id);
  if(!item||!item.lines.some(x=>x.qty<0)||item.acceptedAt)throw Error('減数連絡の記録を確認してください');
  item.acceptedAt=new Date().toISOString();
  item.acceptanceHistory=[...(item.acceptanceHistory||[]),{at:item.acceptedAt,description:'先方の減数了承を記録'}];
}
