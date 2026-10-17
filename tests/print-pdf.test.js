import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument,PDFName} from 'pdf-lib';
import {createPrintPdf} from '../src/print-pdf.js';
import {sortingPages} from '../src/print-prep.js';
const font=await readFile(new URL('../src/assets/fonts/NotoSansJP-Regular.ttf',import.meta.url));

test('独立PDFはA4の帳票だけで印刷JavaScriptを持たず、読み取り元を変更しない',async()=>{
  const model={kind:'sales',date:'2026-09-11',sales:[{name:'くるみパン 1個入り',price:170,qty:7},{name:'未確認商品',price:null,qty:1}]};
  const before=structuredClone(model);
  const bytes=await createPrintPdf(model,font),doc=await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(),1);
  assert.equal(doc.getTitle(),'販売記録表 2026-09-11');
  assert.ok(Math.abs(doc.getPage(0).getWidth()-210*72/25.4)<.01);
  assert.ok(Math.abs(doc.getPage(0).getHeight()-297*72/25.4)<.01);
  assert.equal(doc.catalog.has(PDFName.of('OpenAction')),false);
  assert.equal(doc.catalog.has(PDFName.of('AA')),false);
  assert.deepEqual(model,before);
  // Vector text/lines with an embedded Japanese font, rather than a large
  // full-page screenshot. Bound the output to catch accidental duplication.
  assert.ok(bytes.length>1000000&&bytes.length<5000000);
});

test('PDFの仕分けは16人・大枠混在を1枚、21人を2枚にし、空帳票も1枚',async()=>{
  const row=(i,n)=>({id:`b${i}`,name:['山﨑','淺野','占部','堀'][i%4],lines:Array.from({length:n},(_,j)=>({name:j?'商品名':'シナモンRクッキー',qty:2}))});
  for(const [rows,count] of [
    [Array.from({length:16},(_,i)=>row(i,i?1:25)),1],
    [Array.from({length:21},(_,i)=>row(i,1)),2],
    [[],1],
  ]){
    const bytes=await createPrintPdf({kind:'sorting',date:'2026-10-16',pages:sortingPages(rows)},font);
    assert.equal((await PDFDocument.load(bytes)).getPageCount(),count);
  }
  assert.equal((await PDFDocument.load(await createPrintPdf({kind:'sales',date:'2026-10-16',sales:[]},font))).getPageCount(),1);
});

test('販売記録の多数の下線は行の途中で切らず、次ページに続ける',async()=>{
  const bytes=await createPrintPdf({kind:'sales',date:'2026-10-16',sales:[{name:'黒糖ブレッド',price:430,qty:150}]},font);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(),2);
});
