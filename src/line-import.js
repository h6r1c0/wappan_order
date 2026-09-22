const norm=s=>String(s).normalize('NFKC').replace(/[\s　]/g,'').toLowerCase();
export function candidates(raw,items,aliases={}){
 const key=norm(raw), alias=aliases[key];
 if(alias&&items.some(p=>p.id===alias))return items.filter(p=>p.id===alias);
 const exact=items.filter(p=>norm(p.name)===key);if(exact.length)return exact;
 if(key.length<2)return [];
 return items.filter(p=>norm(p.name).includes(key));
}
export function destinationCandidate(raw,s){
 const text=String(raw||'').trim(),people=candidates(text,s.buyers||[],s.aliases?.buyers);
 if(people.length===1)return {type:'buyer',buyerId:people[0].id,label:people[0].name,confidence:'exact'};
 if(people.length>1)return {type:'unknown',label:text,confidence:'ambiguous'};
 return {type:'external',label:text,confidence:'candidate'};
}
export function parseLineOrder(text,s,r){
 const products=[],buyers=[],unread=[];
 for(const original of text.split(/[\n、,]/).map(x=>x.trim()).filter(Boolean)){
  const line=original.normalize('NFKC').replace(/[。!！]+$/,'').trim();
  const match=line.match(/^(.+?)\s*(?:[×x✕*]\s*)?(\d+)\s*(?:個|袋|本|点)?\s*$/);
  if(match&&!/[\d.．]$/.test(match[1].trim())){
   const raw=match[1].replace(/[×x✕*]\s*$/,'').trim(),qty=Number(match[2]);
   const options=candidates(raw,r.products,s.aliases?.products);
   products.push({raw,qty,productId:options.length===1?options[0].id:'',options,include:true});
  }else{
   const options=candidates(line,s.buyers.filter(b=>!b.testOnly||r.test),s.aliases?.buyers);
   if(options.length)buyers.push({raw:line,options});else unread.push({raw:original,ignored:false,destinationCandidate:destinationCandidate(line,s)});
  }
 }
 return {products,buyers,unread,buyerId:buyers.length===1&&buyers[0].options.length===1?buyers[0].options[0].id:''};
}
export function applyLineOrder(s,r,parsed,buyerId,mode='replace'){
 const b=s.buyers.find(b=>b.id===buyerId);if(!b)throw Error('購入者を選んでください');
 if(parsed.buyers.length>1)throw Error('購入者が複数含まれています。一人分ずつ貼り付けてください');
 if(parsed.unread.some(x=>!x.ignored))throw Error('読み取れなかった行を確認してください');
 const picked=parsed.products.filter(p=>p.include);if(!picked.length)throw Error('反映する商品がありません');
 const q={...(r.orders[b.id]?.quantities||Object.fromEntries(b.fixed.filter(f=>r.products.some(p=>p.id===f.productId)).map(f=>[f.productId,f.qty])))};
 const totals={};
 for(const p of picked){if(!r.products.some(x=>x.id===p.productId)||!Number.isSafeInteger(p.qty)||p.qty<0||p.qty>100000000)throw Error('商品と数量を確認してください');totals[p.productId]=(totals[p.productId]||0)+p.qty;}
 for(const [id,qty] of Object.entries(totals))q[id]=mode==='add'?(q[id]||0)+qty:qty;
 r.orders[b.id]={name:b.name,quantities:q};
 s.aliases??={products:{},buyers:{}};
 for(const p of picked)s.aliases.products[norm(p.raw)]=p.productId;
 if(parsed.buyers.length===1)s.aliases.buyers[norm(parsed.buyers[0].raw)]=b.id;
}
