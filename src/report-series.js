export const originOf=(row,state)=>row.type==='その他の販売'?(state.otherSales?.find(s=>s.id===row.id)?.origin||'unknown'):
  row.type==='過去実績'||row.type==='外部販売経費'?'unknown':'wappan';
export function originBreakdown(rows,state){
 const result={wappan:{revenue:0,profit:0},'non-wappan':{revenue:0,profit:0},unknown:{revenue:0,profit:0}};
 for(const row of rows){const bucket=result[originOf(row,state)];bucket.revenue+=row.revenue||0;bucket.profit+=row.profit||0;}
 return result;
}
export function roundSeries(rows,rounds,state,metric='profit',group='origin'){
 const dates=[...new Set(rounds.map(r=>r.date))].sort();
 return dates.map(date=>{
  const matches=rows.filter(r=>r.date===date);
  const parts={};let total=0;
  for(const row of matches){
   const value=row[metric];if(value==null)continue;
   const other=state.otherSales?.find(s=>s.id===row.id),sale=state.sales?.find(s=>s.id===row.id);
   if(group==='method'&&row.type==='その他の販売'&&other?.qty){
     const personal=(other.allocations||[]).reduce((n,a)=>n+a.qty,0),external=other.paymentStatus==='paid'?other.qty:other.paidExternalQty||0;
     const split=[['個人請求',personal],['支払い済み・外部販売',external],['販売方法未確認',other.qty-personal-external]];
     for(const [key,qty] of split)if(qty)parts[key]=(parts[key]||0)+value*qty/other.qty;
   }else{
     const key=group==='origin'?originOf(row,state):row.type==='販売用商品'?
       ((sale?.destinationType||(!sale?.paid?'buyer':'external'))==='buyer'?'個人請求':sale?.destinationType==='external'?'支払い済み・外部販売':'販売方法未確認'):
       row.type==='通常販売'?'通常注文・販売用（原価配分未確認）':row.type;
     parts[key]=(parts[key]||0)+value;
   }
   total+=value;
  }
  return {date,total,parts,unconfirmed:matches.some(r=>r[metric]==null||r.provisional)};
 });
}
