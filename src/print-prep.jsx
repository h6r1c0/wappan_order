import React,{useRef,useState} from 'react';
import {createPortal,flushSync} from 'react-dom';
import {salesPrintRows,sortingPrintRows,sortingPages} from './print-prep.js';

const printedDate = date => date.replaceAll('-','/');
// Mobile Safari may treat repeated window.print() calls from the same document
// as repeated JavaScript dialogs. Keep subsequent sheets printable through its
// native Share > Print command without another scripted dialog.
let safariPrintIssued=false;
const isMobileSafari=()=>/iP(?:hone|ad|od)/.test(navigator.userAgent)
  && /Safari/.test(navigator.userAgent)
  && !/(?:CriOS|FxiOS|EdgiOS)/.test(navigator.userAgent)
  && !navigator.standalone;

export function PrintPrep({state,round}) {
  const [job,setJob]=useState(null);
  const [sharePrint,setSharePrint]=useState(false);
  const printing=useRef(false);
  const sales=job?.kind==='sales' ? salesPrintRows(state,round) : [];
  const pages=job?.kind==='sorting' ? sortingPages(sortingPrintRows(state,round)) : [];
  const start=kind=>{
    if(printing.current)return;
    printing.current=true;
    // Keep the printable DOM mounted: Safari can return before its PDF preview
    // has finished rendering. A later click replaces this one small sheet.
    const useShare=isMobileSafari() && safariPrintIssued;
    flushSync(()=>{setJob({kind,roundId:round.id});setSharePrint(useShare);});
    if(useShare){printing.current=false;return;}
    if(isMobileSafari())safariPrintIssued=true;
    try{window.print();}finally{window.setTimeout(()=>{printing.current=false;},1500);}
  };
  return <>
    <section className="print-prep-actions" aria-label="納品前の印刷">
      <h3>納品前の印刷</h3>
      <div><button type="button" className="text-action" onClick={()=>start('sales')}>販売記録表を印刷 ›</button>
        <button type="button" className="text-action" onClick={()=>start('sorting')}>個人仕分け表を印刷 ›</button></div>
      {sharePrint && <small role="status" className="print-share-help">帳票を切り替えました。Safariの共有から「プリント」を選んでください。</small>}
    </section>
    {job && createPortal(<div id="wappan-print-root" data-print-kind={job.kind}>
      {job.kind==='sales' ? <section className="print-page sales-print-page">
        <div className="print-heading"><h1>販売記録表</h1><span>納品日 {printedDate(round.date)}</span></div>
        <div className="sales-print-labels"><span>商品名</span><span>価格</span><span>購入者名（1個につき1名）</span></div>
        {sales.length ? sales.map(row=><div className="sales-print-row" key={row.id}>
          <div className="sales-print-name">{row.name}</div>
          <div className="sales-print-price">{row.price==null?'未確認':`${row.price.toLocaleString('ja-JP')}円`}</div>
          <div className="sales-print-names" aria-label={`${row.name} ${row.qty}個分の名前欄`}>
            {Array.from({length:row.qty},(_,i)=><span className="sales-print-blank" key={i} aria-label={`${i+1}人目`}/>)}</div>
        </div>) : <p className="print-empty">販売用の商品はありません</p>}
      </section> : (pages.length ? pages : [Object.assign([],{rowCount:4})]).map((page,index)=><section className="print-page sorting-print-page" key={index}>
        <div className="print-heading"><h1>個人注文仕分け表</h1><span>納品日 {printedDate(round.date)}</span></div>
        {pages.length>1&&<small className="print-page-number">{index+1} / {pages.length}</small>}
        {page.length ? <div className="sorting-print-grid" style={{'--sort-rows':page.rowCount}}>{page.map(row=><div className="sorting-print-person" key={row.id}
          style={{gridColumn:row.col,gridRow:`${row.top} / span ${row.span}`}}>
          <h2>{row.name}</h2><div className="sorting-print-lines">{row.lines.map(line=><div className="sorting-print-line" key={line.id}>
            <span className={(line.printName||line.name).length<=11?'short-print-name':''} title={line.name}>{line.printName||line.name}</span><strong>×{line.qty}</strong></div>)}</div>
        </div>)}</div> : <p className="print-empty">個人注文はありません</p>}
      </section>)}
    </div>,document.body)}
  </>;
}
