// A lost RPC response is not proof of a failed cash receipt. Compare the
// persisted operation ID and its immutable facts before allowing a retry.
export function receiptIntent(before,after){
 const existing=new Set((before.collectionEntries||[]).map(e=>e.id));
 const added=(after.collectionEntries||[]).filter(e=>!existing.has(e.id)&&e.received!==0);
 return added.length===1?added[0]:null;
}
export function savedReceipt(state,intent){
 if(!intent)return false;
 return (state.collectionEntries||[]).some(e=>e.requestId===intent.requestId&&
   e.roundId===intent.roundId&&e.buyerId===intent.buyerId&&
   e.received===intent.received&&e.itemId===intent.itemId);
}
