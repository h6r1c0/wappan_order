// A lost response to a successful workspace write must not make the operator
// repeat a sale. Compare immutable sale IDs and the complete other-goods
// distribution on the server before reporting an ambiguous failure.
export function saleIntent(before,after){
  const oldIds=new Set((before.sales||[]).map(x=>x.id));
  const ids=(after.sales||[]).filter(x=>!oldIds.has(x.id)).map(x=>x.id);
  const changed=(after.otherSales||[]).filter(x=>{
    const old=(before.otherSales||[]).find(y=>y.id===x.id);
    return old&&(JSON.stringify(old.allocations||[])!==JSON.stringify(x.allocations||[])||
      (old.paidExternalQty||0)!==(x.paidExternalQty||0));
  }).map(x=>({id:x.id,allocations:x.allocations||[],paidExternalQty:x.paidExternalQty||0}));
  return ids.length||changed.length?{ids,changed}:null;
}
export function savedSaleIntent(state,intent){
  return !!intent&&intent.ids.every(id=>(state.sales||[]).some(x=>x.id===id&&!x.void))&&
    intent.changed.every(x=>{const saved=(state.otherSales||[]).find(y=>y.id===x.id&&!y.void);
      return saved&&(saved.paidExternalQty||0)===x.paidExternalQty&&
        JSON.stringify(saved.allocations||[])===JSON.stringify(x.allocations);});
}
