import React,{useRef,useState} from 'react';
import {salesPrintRows,sortingPrintRows,sortingPages} from './print-prep.js';
import {openPrintPreview} from './print-preview.js';

export function PrintPrep({state,round}) {
  const [busy,setBusy]=useState(false);
  const [failure,setFailure]=useState('');
  const [fallback,setFallback]=useState(null);
  const preparing=useRef(false);
  const start=async kind=>{
    if(preparing.current)return;
    preparing.current=true;setBusy(true);setFailure('');setFallback(null);
    // Project a snapshot at the click, so switching rounds or receiving remote
    // updates while the PDF loads cannot change the document being opened.
    const model={kind,date:round.date,
      sales:kind==='sales'?salesPrintRows(state,round):[],
      pages:kind==='sorting'?sortingPages(sortingPrintRows(state,round)):[]};
    try{
      const result=await openPrintPreview(model);
      if(result.blocked)setFallback(result.url);
    }catch{
      setFailure('帳票を作成できませんでした。通信を確認して、もう一度お試しください。');
    }finally{preparing.current=false;setBusy(false);}
  };
  return <section className="print-prep-actions" aria-label="納品前の印刷" aria-busy={busy}>
    <h3>納品前の印刷 <small className="print-format">A4 PDF</small></h3>
    <div><button type="button" disabled={busy} className="text-action" onClick={()=>start('sales')}>販売記録表を印刷 ›</button>
      <button type="button" disabled={busy} className="text-action" onClick={()=>start('sorting')}>個人仕分け表を印刷 ›</button></div>
    {busy&&<small role="status">帳票を準備しています…</small>}
    {failure&&<small role="alert">{failure}</small>}
    {fallback&&<small role="status">プレビューを開くには <a href={fallback} target="_blank" rel="noopener noreferrer">PDFを開く ›</a></small>}
  </section>;
}
