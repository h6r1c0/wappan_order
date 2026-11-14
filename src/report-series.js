export const originOf=(row,state)=>row.type==='その他の販売'?(state.otherSales?.find(s=>s.id===row.id)?.origin||'unknown'):
  row.type==='過去実績'||row.type==='外部販売経費'?'unknown':'wappan';
export function originBreakdown(rows,state){
 const result={wappan:{revenue:0,profit:0},'non-wappan':{revenue:0,profit:0},unknown:{revenue:0,profit:0}};
 for(const row of rows){const bucket=result[originOf(row,state)];bucket.revenue+=row.revenue||0;bucket.profit+=row.profit||0;}
 return result;
}
// A date collision is a possible overlap, not proof that the manual entry
// can be deleted. Keep it available for review and use detail once in totals.
export function effectiveReportRows(rows){
 const detailedDates=new Set(rows.filter(r=>r.type!=='過去実績'&&r.type!=='外部販売経費'&&(r.revenue>0||r.cost>0)).map(r=>r.date));
 const overlaps=rows.filter(r=>r.type==='過去実績'&&detailedDates.has(r.date));
 const overlapIds=new Set(overlaps);
 return {rows:rows.filter(r=>!overlapIds.has(r)),overlaps};
}
export function roundSeries(rows,rounds,state,metric='profit',group='origin'){
 // Manual totals have no trustworthy product or sales-method split. Use the
 // same overlap selection as the annual/monthly report, at date granularity:
 // another sale in the same month does not erase an earlier manual result.
 const {rows:eligible}=effectiveReportRows(rows);
 const dates=[...new Set([...rounds.map(r=>r.date),...eligible.filter(r=>r[metric]!=null).map(r=>r.date)])].sort();
 return dates.map(date=>{
  const matches=eligible.filter(r=>r.date===date);
  const parts={};let total=0;
  for(const row of matches){
   const value=row[metric];if(value==null)continue;
   const other=state.otherSales?.find(s=>s.id===row.id),sale=state.sales?.find(s=>s.id===row.id);
   if(group==='method'&&row.type==='その他の販売'&&other?.qty){
     const personal=(other.allocations||[]).reduce((n,a)=>n+a.qty,0),external=other.paymentStatus==='paid'?other.qty:other.paidExternalQty||0;
     const split=[['個人請求',personal],['支払い済み・外部販売',external],['販売方法未確認',other.qty-personal-external]];
     for(const [key,qty] of split)if(qty)parts[key]=(parts[key]||0)+value*qty/other.qty;
   }else if(row.type!=='過去実績'){
     const key=group==='origin'?originOf(row,state):row.type==='販売用商品'?
       ((sale?.destinationType||(!sale?.paid?'buyer':'external'))==='buyer'?'個人請求':sale?.destinationType==='external'?'支払い済み・外部販売':'販売方法未確認'):
       row.type==='通常販売'?'通常注文・販売用（原価配分未確認）':row.type;
     parts[key]=(parts[key]||0)+value;
   }
   total+=value;
  }
  return {date,total,parts,manual:matches.some(r=>r.type==='過去実績'),unconfirmed:matches.some(r=>r[metric]==null||r.provisional)};
 });
}
