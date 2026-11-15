// JSONB canonicalizes object keys. Compare values, never insertion order.
export function stableStringify(value){
 const normalize=x=>Array.isArray(x)?x.map(normalize):x&&typeof x==='object'
  ?Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,normalize(x[k])])):x;
 return JSON.stringify(normalize(value));
}
export const equalValue=(a,b)=>stableStringify(a)===stableStringify(b);
