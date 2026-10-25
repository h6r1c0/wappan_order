import {candidates,looksLikePersonalName} from './line-import.js';
import {salesOrderQuantities,setSalesOrderQuantities,snackOrderQuantities,setSnackOrderQuantities} from './commerce.js';

const clean=x=>String(x||'').normalize('NFKC').trim();
const section=line=>/^(?:【|\[)?(?:個人注文|個人分)(?:】|\])?$/.test(line)?'personal':
  /^(?:【|\[)?(?:販売用|園内販売用)(?:】|\])?$/.test(line)?'sales':
  /^(?:【|\[)?(?:おやつ用|おやつ)(?:】|\])?$/.test(line)?'snack':null;
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
      rows.push({raw:line,kind:'personal',buyerId:'',productId:'',qty:0,options:[],ignored:false});
      continue;
    }
    const qty=match?Number(match[2]):1;
    rows.push({raw:clean(rawLine),kind:kind||'',buyerId:kind==='personal'?buyerId:'',productId:options.length===1?options[0].id:'',qty,options,ignored:false});
  }
  return rows;
}
export function applyBatchOrder(state,roundId,rows){
  const round=state.rounds.find(r=>r.id===roundId);
  if(!round)throw Error('注文回が見つかりません');
  if(round.status!=='入力中')throw Error('確定済みの注文は各工程の訂正操作から変更してください');
  const included=rows.filter(x=>!x.ignored);if(!included.length)throw Error('取り込む商品がありません');
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
  if((round.pasteImports||[]).includes(fingerprint))throw Error('同じ注文内容は取込済みです');
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
  round.pasteImports??=[];round.pasteImports.push(fingerprint);
  return included.length;
}
