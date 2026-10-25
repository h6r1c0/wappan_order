import {candidates,looksLikePersonalName} from './line-import.js';
import {salesOrderQuantities,setSalesOrderQuantities,snackOrderQuantities,setSnackOrderQuantities} from './commerce.js';
import {uid,snapshot} from './domain.js';
import {productDisplayName,productImportIdentity} from './product-names.js';

const clean=x=>String(x||'').normalize('NFKC').trim();
const section=line=>{
  const heading=line.replace(/^[【\[]|[】\]]$/g,'').trim();
  if(/^(?:個人注文|個人分)$/.test(heading))return 'personal';
  if(/^(?:販売|販売用|園内販売用)(?:[・･／/]\s*.+)?$/.test(heading))return 'sales';
  if(/^(?:おやつ|おやつ用)(?:[・･／/]\s*.+)?$/.test(heading))return 'snack';
  return null;
};
export function parseBatchOrder(text,state,round){
  let kind=null,buyerId='';const rows=[];
  for(const rawLine of String(text).split(/\r?\n/)){
    let line=clean(rawLine).replace(/^[・●]\s*/,'').replace(/[。！!]+$/,'');if(!line)continue;
    const next=section(line);if(next){kind=next;buyerId='';continue;}
    const inline=line.match(/^([^:：]+)[:：]\s*(.+)$/);
    if(inline&&(kind==='personal'||!kind)){
      const names=candidates(inline[1].replace(/(?:さん|様)$/,'').trim(),state.buyers.filter(b=>!b.testOnly||round.test),state.aliases?.buyers);
      if(names.length===1){kind='personal';buyerId=names[0].id;line=inline[2].trim();}
      else {buyerId='';kind='personal';}
    }
    const name=line.replace(/^(?:購入者|お名前|名前)\s*[:：]\s*/,'').replace(/(?:さん|様)$/,'').trim();
    const people=candidates(name,state.buyers.filter(b=>!b.testOnly||round.test),state.aliases?.buyers);
    if((kind==='personal'||!kind)&&people.length===1&&(!/\d/.test(name)||/^\w+$/.test(name))){kind='personal';buyerId=people[0].id;continue;}
    const match=line.match(/^(.+?)\s*(?:[×x✕*]\s*)?(\d+)\s*(?:個|袋|本|点)?\s*$/);
    const productName=match?.[1]?.replace(/[×x✕*]\s*$/,'').trim()||line;
    const options=candidates(productName,round.products,state.aliases?.products);
    if((kind==='personal'||!kind)&&!match&&!options.length&&looksLikePersonalName(name)){
      kind='personal';buyerId='';
      rows.push({raw:line,productName:line,kind:'personal',buyerId:'',productId:'',qty:0,options:[],ignored:false});
      continue;
    }
    const qty=match?Number(match[2]):1;
    rows.push({raw:clean(rawLine),productName,kind:kind||'',buyerId:kind==='personal'?buyerId:'',productId:options.length===1?options[0].id:'',qty,options,ignored:false});
  }
  return rows;
}
export function applyBatchOrder(state,roundId,rows){
  const round=state.rounds.find(r=>r.id===roundId);
  if(!round)throw Error('注文回が見つかりません');
  if(round.status!=='入力中')throw Error('確定済みの注文は各工程の訂正操作から変更してください');
  const signature=x=>JSON.stringify([x.raw,x.kind,x.buyerId||'',x.productId,x.qty]);
  const included=rows.filter(x=>!x.ignored&&!x.held&&!(round.pasteRows||[]).includes(signature(x)));
  const held=rows.filter(x=>x.held&&!x.ignored);
  if(!included.length&&!held.length)throw Error('同じ注文内容は取込済みです');
  for(const row of held)if(!String(row.raw||'').trim()||!Number.isSafeInteger(row.qty)||row.qty<0||row.qty>100000000)
    throw Error(`「${row.raw}」の保留内容を確認してください`);
  const totals=new Map();
  for(const row of included){
    if(!['personal','sales','snack'].includes(row.kind)||
      row.kind==='personal'&&!state.buyers.some(b=>b.id===row.buyerId)||
      !round.products.some(p=>p.id===row.productId)||
      !Number.isSafeInteger(row.qty)||row.qty<=0||row.qty>100000000)
      throw Error(`「${row.raw}」の区分・購入者・商品・数量を確認してください`);
    const key=`${row.kind}:${row.buyerId||''}:${row.productId}`;
    totals.set(key,(totals.get(key)||0)+row.qty);
  }
  const resolved=[...totals].sort((a,b)=>a[0].localeCompare(b[0]));
  const fingerprint=JSON.stringify(resolved);
  if(included.length&&(round.pasteImports||[]).includes(fingerprint))throw Error('同じ注文内容は取込済みです');
  const sales={...salesOrderQuantities(state,roundId)},snack={...snackOrderQuantities(state,roundId)};
  for(const [key,qty] of resolved){
    const [kind,buyerId,productId]=key.split(':');
    if(kind==='personal'){
      const b=state.buyers.find(b=>b.id===buyerId),old=round.orders[buyerId];
      if((old?.quantities?.[productId]||0)>0)throw Error(`${b.name}の${round.products.find(p=>p.id===productId).name}は登録済みです。注文画面で確認してください`);
      const fixed=Object.fromEntries((b.fixed||[]).filter(x=>round.products.some(p=>p.id===x.productId)).map(x=>[x.productId,x.qty]));
      round.orders[buyerId]={name:b.name,quantities:{...fixed,...(old?.quantities||{}),[productId]:qty},...(old?.cutQuantities?{cutQuantities:old.cutQuantities}:{})};
    }else if(kind==='sales'){
      if((sales[productId]||0)>0)throw Error('販売用の同じ商品は登録済みです。販売用の注文で確認してください');
      sales[productId]=qty;
    }else{
      if((snack[productId]||0)>0)throw Error('おやつ用の同じ商品は登録済みです。おやつ用の注文で確認してください');
      snack[productId]=qty;
    }
  }
  setSalesOrderQuantities(state,roundId,sales);
  setSnackOrderQuantities(state,roundId,snack);
  round.pasteImports??=[];if(included.length)round.pasteImports.push(fingerprint);
  round.pasteRows??=[];for(const row of included)round.pasteRows.push(signature(row));
  round.pendingImports??=[];
  const processed=new Set(rows.filter(x=>x.pendingId).map(x=>x.pendingId));
  round.pendingImports=round.pendingImports.filter(x=>!processed.has(x.id));
  for(const row of held){
    const record={id:row.pendingId||uid(),raw:String(row.raw).slice(0,1000),productName:String(row.productName||row.raw).slice(0,300),qty:row.qty,kind:row.kind||'',buyerId:row.buyerId||'',at:new Date().toISOString()};
    if(!round.pendingImports.some(x=>x.raw===record.raw&&x.kind===record.kind&&x.buyerId===record.buyerId&&x.qty===record.qty))round.pendingImports.push(record);
  }
  return included.length;
}
export function addSpecialProduct(state,roundId,rawName,sellingPrice,cost=null){
  const round=state.rounds.find(r=>r.id===roundId),name=productDisplayName(rawName);
  if(!round||round.status!=='入力中')throw Error('入力中の注文回を選んでください');
  if(!name||!/(?:\d+個)/.test(name))throw Error('商品名と1個・3個などの販売単位を確認してください');
  if(sellingPrice!=null&&(!Number.isSafeInteger(sellingPrice)||sellingPrice<0))throw Error('販売価格を確認してください');
  if(cost!=null&&(!Number.isSafeInteger(cost)||cost<0))throw Error('仕入単価を確認してください');
  const key=productImportIdentity(name).normalize('NFKC').replace(/[\s　・･]/g,'');
  const existing=state.products.find(p=>!p.retiredDuplicate&&productImportIdentity(p.name).normalize('NFKC').replace(/[\s　・･]/g,'')===key);
  if(existing){
    if(round.products.some(p=>p.id===existing.id))throw Error('同じ販売単位の商品はこの注文回に登録済みです');
    const item=snapshot(existing,{snackOnly:true});
    if(sellingPrice!=null){item.price=sellingPrice;item.priceSource='manual';}
    round.products.push(item);return existing.id;
  }
  const p={id:uid(),name,sourceName:String(rawName).trim(),gross:null,manual:sellingPrice,mode:sellingPrice==null?'auto':'manual',priceSource:sellingPrice==null?'unknown':'manual',cost,category:'パン',active:true,lifecycle:'once',roundId,importMonth:round.date.slice(0,7),start:'',end:''};
  state.products.push(p);round.products.push(snapshot(p,{snackOnly:true}));
  return p.id;
}
