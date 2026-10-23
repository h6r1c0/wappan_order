export function validateCollectionWorkflow(s){
  const amount=(n,signed=false)=>Number.isSafeInteger(n)&&Math.abs(n)<=100000000&&(signed||n>=0);
  for(const key of ['collectionCredits','collectionCases','collectionCorrections','billingReviews']){
    if(s[key]==null)continue;
    if(!Array.isArray(s[key])||new Set(s[key].map(x=>x.id)).size!==s[key].length)throw Error('集金確認の記録が不正です');
    for(const x of s[key]){
      if(!x.id||!s.buyers.some(b=>b.id===x.buyerId)||!s.rounds.some(r=>r.id===x.roundId))throw Error('集金確認の対象が見つかりません');
      if(key==='collectionCredits'&&(!amount(x.amount)||x.amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||x.date>=s.rounds.find(r=>r.id===x.roundId).date))throw Error('預かり金の記録が不正です');
      if(key==='collectionCases'&&(!amount(x.received,true)||!['pending','resolved'].includes(x.status)))throw Error('要確認の記録が不正です');
      if(key==='collectionCorrections'&&(!['collectionEntries','collectionReconciliations'].includes(x.kind)||!s[x.kind]?.some(e=>e.id===x.targetId&&e.buyerId===x.buyerId&&e.roundId===x.roundId)||!x.reason))throw Error('訂正対象が不正です');
      if(key==='billingReviews'&&(!amount(x.bagAmount)||!amount(x.total)||!['confirmed','pending'].includes(x.status)||!Array.isArray(x.lines)||!Array.isArray(x.history)))throw Error('請求確認が不正です');
    }
  }
  if(new Set((s.collectionCorrections||[]).map(x=>x.kind+':'+x.targetId)).size!==(s.collectionCorrections||[]).length)throw Error('同じ履歴を二重に訂正できません');
  for(const key of ['billingReviews','collectionCredits','collectionCases']){
    const items=(s[key]||[]).filter(x=>key!=='collectionCases'||x.status==='pending');
    const keys=items.map(x=>key==='collectionCredits'?`${x.buyerId}:${x.date}:${x.amount}`:`${x.buyerId}:${x.roundId}`);
    if(new Set(keys).size!==keys.length)throw Error('同じ集金確認の二重登録です');
  }
  const requests=(s.collectionEntries||[]).map(x=>x.requestId).filter(Boolean);
  if(new Set(requests).size!==requests.length)throw Error('受取の二重登録です');
}
