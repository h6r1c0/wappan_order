import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument,PDFName,decodePDFRawStream} from 'pdf-lib';
import {createPrintPdf} from '../src/print-pdf.js';
import {sortingPages,salesPrintName} from '../src/print-prep.js';
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
  const bytes=await createPrintPdf({kind:'sales',date:'2026-10-16',sales:[{name:'黒糖ブレッド',price:430,qty:200}]},font);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(),2);
});

test('販売記録表の1～10個は20mmの固定5列で、6本目以降を先頭列へ折り返す',async()=>{
  const quantities=[1,4,5,6,7,10];
  const bytes=await createPrintPdf({kind:'sales',date:'2026-09-11',sales:quantities.map(q=>({name:`商品${q}個`,price:12340,qty:q}))},font);
  const doc=await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(),1);
  const page=doc.getPage(0),contents=page.node.Contents();
  const stream=doc.context.lookup(contents.get(0));
  const commands=new TextDecoder().decode(decodePDFRawStream(stream).decode());
  const mm=pt=>pt*25.4/72;
  const rows=[];
  for(const match of commands.matchAll(/([\d.]+) ([\d.]+) m\n([\d.]+) ([\d.]+) l\nS/g)){
    const [x,y,endX,endY]=match.slice(1).map(Number);
    if(Math.abs(mm(endX-x)-20)>.01||Math.abs(y-endY)>.01)continue;
    const prev=rows.at(-1);
    if(prev&&Math.abs(prev.y-y)<.01)prev.starts.push(mm(x));
    else rows.push({y,starts:[mm(x)]});
  }
  assert.deepEqual(rows.map(row=>row.starts.map(x=>Math.round(x))),[
    [83],[83,107,131,155],[83,107,131,155,179],
    [83,107,131,155,179],[83],
    [83,107,131,155,179],[83,107],
    [83,107,131,155,179],[83,107,131,155,179],
  ]);
  assert.ok(rows.every(row=>row.starts.every((x,i)=>x>=83&&x+20<=199.01&&(i===0||x-row.starts[i-1]>=23.99))));
});

test('長い現行商品名も顧客向け印刷名では商品列1行に収まり、5列レイアウトは変わらない',async()=>{
  const originals=[
    '白うさぎと黒うさぎのチョコパン　2種×2個',
    'リーン天然酵母ちびハイジの白パン 6個',
    '贅沢プレッツェルクロワッサン　1個、約90g',
    '天然酵母食パン（大）約620g【スライス】',
    '抹茶シフォンケーキ(冷） 直径12㎝型',
    'シナモンレーズンクッキー',
  ];
  const doc=await PDFDocument.create();doc.registerFontkit((await import('@pdf-lib/fontkit')).default);
  const embedded=await doc.embedFont(font,{subset:false});
  const names=originals.map(salesPrintName);
  assert.ok(names.every(name=>embedded.widthOfTextAtSize(name,10)<=50*72/25.4));
  const bytes=await createPrintPdf({kind:'sales',date:'2026-10-16',sales:names.map(name=>({name,price:390,qty:5}))},font);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);
});
