export function validateCollectionWorkflow(s){
  const amount=(n,signed=false)=>Number.isSafeInteger(n)&&Math.abs(n)<=100000000&&(signed||n>=0);
  for(const key of ['collectionCredits','collectionCases','collectionCorrections','billingReviews']){
    if(s[key]==null)continue;
    if(!Array.isArray(s[key])||new Set(s[key].map(x=>x.id)).size!==s[key].length)throw Error('集金確認の記録が不正です');
    for(const x of s[key]){
      if(!x.id||!s.buyers.some(b=>b.id===x.buyerId)||!s.rounds.some(r=>r.id===x.roundId))throw Error('集金確認の対象が見つかりません');
      if(key==='collectionCredits'){
        const round=s.rounds.find(r=>r.id===x.roundId);
        if(!amount(x.amount)||x.amount<=0||!(x.date===null&&x.appliedTo&&/^\d{4}-\d{2}-\d{2}T/.test(x.recordedAt)||/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&x.date<round.date))throw Error('預かり金の記録が不正です');
        if(x.appliedTo){
          const id=`round:${round.id}:${x.buyerId}`;
          if(x.appliedTo!==id||!round.orders[x.buyerId])throw Error('預かり金の充当先が不正です');
        }
      }
      if(key==='collectionCases'&&(!amount(x.received,true)||!['pending','resolved'].includes(x.status)))throw Error('要確認の記録が不正です');
      if(key==='collectionCorrections'&&(!['collectionEntries','collectionReconciliations'].includes(x.kind)||!s[x.kind]?.some(e=>e.id===x.targetId&&e.buyerId===x.buyerId&&e.roundId===x.roundId)||!x.reason))throw Error('訂正対象が不正です');
      if(key==='billingReviews'&&(!amount(x.bagAmount)||!amount(x.total)||!['confirmed','pending'].includes(x.status)||!Array.isArray(x.lines)||!Array.isArray(x.history)))throw Error('請求確認が不正です');
    }
  }
  if(new Set((s.collectionCorrections||[]).map(x=>x.kind+':'+x.targetId)).size!==(s.collectionCorrections||[]).length)throw Error('同じ履歴を二重に訂正できません');
  for(const key of ['billingReviews','collectionCredits','collectionCases']){
    const items=(s[key]||[]).filter(x=>key!=='collectionCases'||x.status==='pending');
    const keys=items.map(x=>key==='collectionCredits'?`${x.buyerId}:${x.date??x.roundId}:${x.amount}`:`${x.buyerId}:${x.roundId}`);
    if(new Set(keys).size!==keys.length)throw Error('同じ集金確認の二重登録です');
  }
  const requests=(s.collectionEntries||[]).map(x=>x.requestId).filter(Boolean);
  if(new Set(requests).size!==requests.length)throw Error('受取の二重登録です');
  const allocations=s.collectionAllocations||[];
  if(!Array.isArray(allocations)||new Set(allocations.map(x=>x.id)).size!==allocations.length||new Set(allocations.map(x=>x.entryId)).size!==allocations.length)throw Error('受取の充当履歴が不正です');
  for(const x of allocations){
    const entry=(s.collectionEntries||[]).find(e=>e.id===x.entryId&&e.roundId===x.roundId&&e.buyerId===x.buyerId&&e.received>0);
    const target=s.rounds.find(r=>r.id===x.roundId),ids=new Set([...(s.receivableItems||[]).filter(i=>i.buyerId===x.buyerId).map(i=>i.id),...s.rounds.filter(r=>r.date<=target?.date).map(r=>`round:${r.id}:${x.buyerId}`)]);
    if(!x.id||!entry||!Array.isArray(x.parts)||!x.parts.length||new Set(x.parts.map(p=>p.itemId)).size!==x.parts.length||x.parts.reduce((n,p)=>n+p.amount,0)!==entry.received||x.parts.some(p=>!amount(p.amount)||!p.amount||!ids.has(p.itemId)))throw Error('受取の充当先と金額が一致しません');
  }
}
