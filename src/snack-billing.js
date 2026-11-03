import {receivedQuantity} from './shortages.js';

const sum = values => values.reduce((n,v)=>n+v,0);
export const suggestedSnackPrice = costs => costs.length && costs.every(Number.isSafeInteger)
  ? Math.ceil((sum(costs)/costs.length)/10)*10 : null;

export function snackGroupTarget(state,event,billing,group){
  const ids=new Set(group.lineIds||[]);
  if(!ids.size||ids.size!==(group.lineIds||[]).length||event.lines.filter(l=>ids.has(l.id)).length!==ids.size)
    throw Error('共通単価の対象商品を選んでください');
  if(group.quantities){
    if(Object.keys(group.quantities).some(id=>!ids.has(id)))throw Error('共通単価の商品を確認してください');
    return event.lines.filter(l=>ids.has(l.id)).reduce((n,l)=>{
      const qty=group.quantities[l.id]||0;
      if(!Number.isSafeInteger(qty)||qty<0)throw Error(`${l.name}の共通単価対象数を確認してください`);
      return n+qty;
    },0);
  }
  return event.lines.filter(l=>ids.has(l.id)).reduce((n,l)=>{
    if(!l.usedConfirmed && !(l.used>0))return null;
    const fiscal=(billing.fiscal||[]).find(x=>x.lineId===l.id)?.qty||0;
    const specific=(billing.household||[]).filter(x=>x.lineId===l.id).reduce((v,x)=>v+x.qty,0);
    return n==null?null:n+l.used-fiscal-specific;
  },0);
}

// Billing assignments are separate from physical use and transfers. A saved
// draft replaces the prior assignment; no purchase, stock or sale is created.
export function snackBillingPreview(state,event,billing=event.billing){
  if(!billing)return {fiscal:null,household:0,cost:null,profit:null,discrepancy:0};
  // The event already identifies a record; the optional billing label is only a note.
  const lines=new Map(event.lines.map(l=>[l.id,l]));
  const fiscalItems=billing.fiscal||[], householdItems=billing.household||[], groups=billing.groups||[];
  const groupIds=new Set(),groupLines=new Set();
  for(const group of groups){
    if(!String(group.id||'').trim()||!String(group.label||'').trim()||groupIds.has(group.id))throw Error('共通単価グループの名前・IDを確認してください');
    if(!Number.isSafeInteger(group.unitPrice)||group.unitPrice<0)throw Error('共通請求単価を確認してください');
    groupIds.add(group.id);
    for(const id of group.lineIds||[]){if(groupLines.has(id))throw Error('同じ商品を複数の共通単価グループに入れられません');groupLines.add(id);}
    snackGroupTarget(state,event,billing,group);
  }
  if(new Set(fiscalItems.map(x=>x.lineId)).size!==fiscalItems.length)throw Error('同じ商品の財政請求が重複しています');
  let fiscal=0,household=0;
  for(const item of fiscalItems){
    const line=lines.get(item.lineId);
    if(!line)throw Error('財政請求の商品が見つかりません');
    if(!Number.isSafeInteger(item.qty)||item.qty<0||item.qty>receivedQuantity(line))throw Error('財政請求数を確認してください');
    if(item.qty&&line.cost==null)throw Error(`${line.name}の実際の仕入単価を確認してください`);
    fiscal+=item.qty*(line.cost||0);
  }
  const perLine=new Map(fiscalItems.map(x=>[x.lineId,x.qty]));
  const known=new Map(),unknown=[];
  const seen=new Set();
  for(const item of householdItems){
    const key=JSON.stringify([item.buyerId,item.lineId||null,item.groupId||null]);
    if(seen.has(key))throw Error('同じ行事・購入者・商品のおやつ請求が重複しています');
    seen.add(key);
    if(!state.buyers.some(b=>b.id===item.buyerId))throw Error('請求先の購入者を選んでください');
    if(!Number.isSafeInteger(item.qty)||item.qty<1||!Number.isSafeInteger(item.unitPrice)||item.unitPrice<0)throw Error('おやつ請求の食数・単価を確認してください');
    if(item.lineId&&!lines.has(item.lineId))throw Error('おやつ請求の商品が見つかりません');
    if(item.groupId&&(!groupIds.has(item.groupId)||item.lineId))throw Error('共通単価の請求先を確認してください');
    if(item.groupId&&item.unitPrice!==groups.find(g=>g.id===item.groupId).unitPrice)throw Error('グループ内の共通請求単価を揃えてください');
    household+=item.qty*item.unitPrice;
    if(item.lineId)known.set(item.lineId,(known.get(item.lineId)||0)+item.qty);
    else if(!item.groupId)unknown.push(item);
  }
  const groupSummaries=groups.map(group=>{
    const target=snackGroupTarget(state,event,billing,group);
    const assigned=sum(householdItems.filter(x=>x.groupId===group.id).map(x=>x.qty));
    const groupCost=target!=null&&target>=0&&group.lineIds.every(id=>lines.get(id).cost!=null)
      ? sum(group.lineIds.map(id=>{const l=lines.get(id);return (group.quantities?.[id]??(l.used-(perLine.get(id)||0)-(known.get(id)||0)))*l.cost;})):null;
    return {id:group.id,label:group.label,target,assigned,difference:target==null?null:target-assigned,cost:groupCost};
  });
  const remainder=[];
  for(const line of event.lines){
    const used=perLine.get(line.id)||0, specified=known.get(line.id)||0;
    const common=sum(groups.map(g=>g.quantities?.[line.id]||0));
    const transferred=sum((state.stocks||[]).filter(st=>st.eventLineId===line.id).map(st=>st.qty));
    if(used+specified+common>receivedQuantity(line)-transferred)throw Error(`${line.name}の4区分の合計が振替後の実入荷数を超えています（差 ${used+specified+common-(receivedQuantity(line)-transferred)}個）`);
    // A zero in an older event is not evidence that nothing was eaten.
    if(line.usedConfirmed||line.used>0)remainder.push({line,qty:line.used-used-specified});
  }
  const unknownQty=sum(unknown.map(x=>x.qty));
  const identified=sum([...perLine.values()])+sum([...known.values()])+unknownQty+sum(groupSummaries.map(x=>x.assigned));
  const available=sum(event.lines.map(l=>receivedQuantity(l)))-sum((state.stocks||[]).filter(st=>st.eventId===event.id).map(st=>st.qty));
  if(identified>available)throw Error('請求対象数が販売振替後のおやつ入荷数を超えています');
  const legacyComplete=event.lines.every(l=>l.usedConfirmed||l.used>0) && remainder.every(x=>x.qty>=0) && sum(remainder.map(x=>x.qty))===unknownQty;
  const complete=groups.length ? remainder.every(x=>x.qty>=0) && groupSummaries.every(x=>x.target!=null&&x.difference===0&&x.cost!=null) &&
    event.lines.every(l=>groupLines.has(l.id)||(l.usedConfirmed||l.used>0)&&
      (l.used-(perLine.get(l.id)||0)-(known.get(l.id)||0)===0)) && unknownQty===0 : legacyComplete;
  const cost=complete && event.lines.every(l=>l.used===0||l.cost!=null)
    ? sum(event.lines.map(l=>(l.used-(perLine.get(l.id)||0))*(l.cost||0))) : null;
  const discrepancy=complete?0:identified-sum(event.lines.map(l=>l.used||0));
  return {fiscal,household,cost,profit:cost==null?null:household-cost,discrepancy,complete,groups:groupSummaries};
}

export function replaceSnackBilling(state,eventId,billing,reason='請求先を更新'){
  const event=state.events.find(e=>e.id===eventId);
  if(!event)throw Error('おやつが見つかりません');
  snackBillingPreview(state,event,billing);
  if(billing?.groups?.length && !snackBillingPreview(state,event,billing).complete)throw Error('共通単価の対象数と家庭への割当数を揃え、実使用数を確認してください');
  if(event.billing&&!String(reason||'').trim())throw Error('請求修正・取消の理由を入力してください');
  if(event.billing){
    event.billingHistory??=[];
    event.billingHistory.push({at:new Date().toISOString(),reason,billing:structuredClone(event.billing)});
  }
  event.billing=billing?structuredClone(billing):null;
}

export const emptySnackPlan=()=>({label:'',fiscal:[],household:[],groups:[]});
export function saveSnackSection(state,eventId,section,value,reason='区分を保存'){
  const event=state.events.find(e=>e.id===eventId);
  if(!event||!['fiscal','direct','common','label'].includes(section))throw Error('保存するおやつ区分を確認してください');
  const plan=structuredClone(event.snackDraft||event.billing||emptySnackPlan());
  const rows=event.lines;
  if(section==='label')plan.label=String(value||'');
  if(section==='fiscal'){
    if(!Array.isArray(value)||new Set(value.map(x=>x.lineId)).size!==value.length||value.some(x=>
      !rows.some(l=>l.id===x.lineId)||!Number.isSafeInteger(x.qty)||x.qty<0))throw Error('財政分の商品・数量を確認してください');
    plan.fiscal=value;
  }
  if(section==='direct'){
    if(!Array.isArray(value)||value.some(x=>!rows.some(l=>l.id===x.lineId)||
      !state.buyers.some(b=>b.id===x.buyerId)||!Number.isSafeInteger(x.qty)||x.qty<1||
      !Number.isSafeInteger(x.unitPrice)||x.unitPrice<0))throw Error('そのまま割り振る商品の購入者・数量・単価を確認してください');
    plan.household=[...plan.household.filter(x=>x.groupId||!x.lineId),...value];
  }
  if(section==='common'){
    if(!Array.isArray(value?.groups)||!Array.isArray(value?.household))throw Error('共通単価の商品・数量・購入者を確認してください');
    plan.groups=value.groups;
    plan.household=[...plan.household.filter(x=>!x.groupId),...value.household];
    for(const group of plan.groups){
      snackGroupTarget(state,event,plan,group);
      if(!Number.isSafeInteger(group.unitPrice)||group.unitPrice<0)throw Error('共通単価を確認してください');
    }
    if(plan.household.some(x=>x.groupId&&(!state.buyers.some(b=>b.id===x.buyerId)||
      !plan.groups.some(g=>g.id===x.groupId&&g.unitPrice===x.unitPrice)||!Number.isSafeInteger(x.qty)||x.qty<1)))
      throw Error('共通単価の購入者・数量を確認してください');
  }
  // A partial save is allowed; overlap is surfaced when the allocation is confirmed.
  if(event.snackDraft){
    event.snackDraftHistory??=[];
    event.snackDraftHistory.push({at:new Date().toISOString(),section,reason,
      previous:structuredClone(event.snackDraft)});
  }
  event.snackDraft=plan;
  return plan;
}
export function confirmSnackPlan(state,eventId,reason='請求を確定'){
  const event=state.events.find(e=>e.id===eventId),plan=event?.snackDraft;
  if(!event||!plan)throw Error('保存済みのおやつ区分を確認してください');
  const copy=structuredClone(event);
  for(const line of copy.lines){
    const fiscal=plan.fiscal.filter(x=>x.lineId===line.id).reduce((n,x)=>n+x.qty,0);
    const direct=plan.household.filter(x=>x.lineId===line.id).reduce((n,x)=>n+x.qty,0);
    const common=plan.groups.reduce((n,g)=>n+(g.quantities?.[line.id]||0),0);
    const allocated=fiscal+direct+common;
    const moved=state.stocks.filter(st=>st.eventLineId===line.id).reduce((n,st)=>n+st.qty,0);
    if(allocated<line.used)throw Error(`${line.name}：記録済み使用 ${line.used}個に対し用途指定 ${allocated}個。差 ${line.used-allocated}個の用途を選んでください`);
    if(allocated>receivedQuantity(line)-moved)throw Error(`${line.name}：実入荷から販売振替を引いた残数を${allocated-(receivedQuantity(line)-moved)}個超えています`);
    line.used=allocated;line.usedConfirmed=true;
  }
  const preview=snackBillingPreview(state,copy,plan);
  if(!preview.complete)throw Error('共通単価の商品別対象数と家庭への割当数を確認してください');
  if(preview.cost==null)throw Error('使用した商品の実際の仕入単価を確認してください');
  // Validate the whole replacement before touching the live state. A rejected
  // correction must leave both physical use and the former invoice intact.
  const candidate={...state,events:state.events.map(e=>e.id===eventId?copy:e)};
  replaceSnackBilling(candidate,eventId,plan,reason);
  event.lines=copy.lines;
  event.billing=copy.billing;
  if(copy.billingHistory)event.billingHistory=copy.billingHistory;
  // Keep saved section drafts for subsequent independent corrections.
  return preview;
}
