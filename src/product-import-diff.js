import {productImportIdentity} from './product-names.js';
const identity=x=>productImportIdentity(x.name||'').normalize('NFKC').replace(/[\s　・･]/g,'').toLowerCase();
const family=x=>identity(x).replace(/\d+個(?:入り)?/g,'');
const unit=x=>identity(x).match(/\d+個(?:入り)?/)?.[0]||'';
export function importDifference(rows,baseline=[]){
  const prior=new Map(baseline.map(x=>[identity(x),x]));
  const current=new Set(rows.filter(x=>x.include!==false).map(identity));
  const changes=rows.map(row=>{
    const old=prior.get(identity(row));
    if(old){
      const previous=old.gross??null,now=row.gross??null;
      if(previous!=null&&now!=null&&previous!==now)return {kind:now>previous?'up':'down',old};
      if(old.category!==row.category||old.section!==row.section)return {kind:'changed',old};
      return {kind:'same',old};
    }
    const related=baseline.find(x=>family(x)===family(row)&&unit(x)!==unit(row));
    return {kind:related?'changed':'new',old:related||null};
  });
  const removed=baseline.filter(x=>!current.has(identity(x))&&!rows.some(y=>family(y)===family(x)&&unit(y)!==unit(x)));
  return {changes,removed,counts:Object.fromEntries(['up','down','changed','new','same'].map(k=>[k,changes.filter(x=>x.kind===k).length]))};
}
