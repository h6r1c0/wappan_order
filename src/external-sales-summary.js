export function externalSalesSummary(state,round){
 const stocks=new Map((state.stocks||[]).map(x=>[x.id,x]));
 const lines=(state.sales||[]).filter(x=>!x.void&&x.destinationType==='external'&&x.paymentStatus==='paid'&&
   (x.chargeRoundId===round.id||!x.chargeRoundId&&stocks.get(x.stockId)?.roundId===round.id))
   .map(x=>({name:stocks.get(x.stockId)?.name||'販売商品',qty:x.qty,unitPrice:x.price,place:x.destinationName||'',amount:x.qty*x.price}));
 for(const x of state.otherSales||[])if(!x.void&&x.paymentStatus==='paid'&&x.date===round.date&&x.test===round.test)
   lines.push({name:x.name,qty:x.qty,unitPrice:x.unitPrice,place:x.place||x.destinationName||'',amount:x.qty*x.unitPrice});
 return {total:lines.reduce((sum,x)=>sum+x.amount,0),lines};
}
