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
      setFallback(result);
    }catch{
      setFailure('帳票を作成できませんでした。通信を確認し、アプリを読み直してから再試行してください。');
    }finally{preparing.current=false;setBusy(false);}
  };
  return <section className="print-prep-actions" aria-label="納品前の印刷" aria-busy={busy}>
    <h3>納品前の印刷</h3>
    <div><button type="button" disabled={busy} className="text-action" onClick={()=>start('sales')}>販売記録表を印刷 ›</button>
      <button type="button" disabled={busy} className="text-action" onClick={()=>start('sorting')}>個人仕分け表を印刷 ›</button></div>
    {busy&&<small role="status">帳票を準備しています…</small>}
    {failure&&<small role="alert">{failure}</small>}
    {fallback&&<small role="status">{fallback.blocked?'別画面を開けませんでした。':'プレビューが黒い場合は元の画面に戻り、'} <a href={fallback.url} target="_blank" rel="noopener noreferrer">PDFを開く ›</a>　<a href={fallback.url} download={fallback.file.name}>PDFを保存 ›</a>{typeof navigator!=='undefined'&&navigator.canShare?.({files:[fallback.file]})&&<>　<button type="button" className="text-action" onClick={()=>navigator.share({files:[fallback.file],title:fallback.file.name}).catch(()=>{})}>PDFを共有・印刷 ›</button></>}</small>}
  </section>;
}
