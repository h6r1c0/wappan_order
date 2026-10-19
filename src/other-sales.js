// Standalone goods never enter supplier orders, bread stock or buyer collections.
const checked=(v,label,min=0)=>{
  if(!Number.isSafeInteger(v)||v<min||v>100000000)throw Error(`${label}を確認してください`);
  return v;
};
export function saveOtherSale(state,entry,{id=null,reason=''}={}){
  const name=String(entry.name||'').trim(),date=String(entry.date||'');
  if(!name||!/^\d{4}-\d{2}-\d{2}$/.test(date)||(Number.isNaN(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date))throw Error('商品名と販売日を確認してください');
  checked(entry.qty,'販売数量',1);checked(entry.unitPrice,'販売単価');checked(entry.unitCost,'原価');
  if(!['paid','unpaid'].includes(entry.paymentStatus))throw Error('現金受取状況を選んでください');
  state.otherSales??=[];
  const old=id?state.otherSales.find(x=>x.id===id):null;
  if(id&&(!old||old.void))throw Error('変更する販売記録が見つかりません');
  if(old&&!String(reason).trim())throw Error('訂正理由を入力してください');
  const next={name,date,qty:entry.qty,unitPrice:entry.unitPrice,unitCost:entry.unitCost,
    paymentStatus:entry.paymentStatus,note:String(entry.note||'').trim(),test:old?.test??Boolean(entry.test)};
  if(old){
    old.history??=[];
    old.history.push({at:new Date().toISOString(),reason,previous:{name:old.name,date:old.date,qty:old.qty,
      unitPrice:old.unitPrice,unitCost:old.unitCost,paymentStatus:old.paymentStatus,note:old.note}});
    Object.assign(old,next);return old;
  }
  const sale={id:crypto.randomUUID(),...next,void:false,history:[]};
  state.otherSales.push(sale);return sale;
}
export function voidOtherSale(state,id,reason){
  const sale=(state.otherSales||[]).find(x=>x.id===id&&!x.void);
  if(!sale||!String(reason||'').trim())throw Error('取消対象と理由を確認してください');
  sale.history.push({at:new Date().toISOString(),reason,previous:{...sale,history:undefined}});
  sale.void=true;
}
