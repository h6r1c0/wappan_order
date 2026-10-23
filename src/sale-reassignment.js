import {uid,integer,updateSaleDestination} from './domain.js';
export function reassignSale(state,saleId,qty,destination){
  const sale=state.sales.find(x=>x.id===saleId&&!x.void);if(!sale)throw Error('販売記録が見つかりません');
  integer(qty,'変更数量');if(qty<1||qty>sale.qty)throw Error('変更する数量を確認してください');
  const before=structuredClone(sale);let target=sale;
  if(qty<sale.qty){sale.qty-=qty;target={...sale,id:uid(),qty,splitFrom:sale.id};state.sales.push(target);}
  target.assignmentHistory=[...(target.assignmentHistory||[]),{at:new Date().toISOString(),previous:{...before,assignmentHistory:undefined},reason:'販売先・数量を訂正'}];
  return updateSaleDestination(state,target.id,destination);
}
