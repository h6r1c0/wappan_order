import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument,PDFName,decodePDFRawStream} from 'pdf-lib';
import {initialState,newRound,collections,report} from '../src/domain.js';
import {saveOtherSale,replaceOtherDistribution} from '../src/other-sales.js';
import {envelopePrintRows,sortingPages,sortingPrintName} from '../src/print-prep.js';
import {createPrintPdf} from '../src/print-pdf.js';
import {originBreakdown,roundSeries} from '../src/report-series.js';

test('当該回の個人請求だけをラベルへ印刷し、商品由来と販売方法を別に集計',async()=>{
 const s=initialState(),r=newRound(s,'2026-10-30',true);s.rounds.push(r);
 const lemon=saveOtherSale(s,{name:'青レモン',date:r.date,qty:2,unitPrice:100,unitCost:0,paymentStatus:'unpaid',test:true,origin:'non-wappan'});
 replaceOtherDistribution(s,lemon.id,[{buyerId:'hori',qty:1}],1,'販売先を確認');
 const bills=collections(s,'','',r.id,true),hori=bills.find(b=>b.id==='hori');
 assert.equal(hori.total,100);
 const rows=envelopePrintRows(s,r);assert.equal(rows.find(x=>x.id==='hori').billAmount,100);
 const data=report(s,r.date,r.date,2026,{includeTest:true}),parts=originBreakdown(data.rows,s);
 assert.equal(parts['non-wappan'].revenue,200);
 const series=roundSeries(data.rows,[r],s,'revenue','method');
 assert.equal(series[0].total,200);assert.equal(series[0].parts['個人請求'],100);assert.equal(series[0].parts['支払い済み・外部販売'],100);
 const font=await readFile(new URL('../src/assets/fonts/NotoSansJP-Regular.ttf',import.meta.url));
 const pdf=await PDFDocument.load(await createPrintPdf({kind:'envelopes',date:r.date,staff:'係',pages:sortingPages(rows)},font));
 assert.equal(pdf.getTitle(),'集金袋用個別ラベル 2026-10-30');
 assert.equal(pdf.getPageCount(),1);assert.equal(pdf.catalog.has(PDFName.of('OpenAction')),false);
});
test('集金袋と仕分け表の短い商品名は規格違いを混同しない',()=>{
 const names=['りんごデニッシュ(涼)','甘夏ゼリー(冷) 約60g','じゃがいも食パン(リーン、涼) 約410g','バジルとチーズのフォカッチャ(涼)'];
 const products=names.map(name=>({name}));
 assert.equal(sortingPrintName(names[0],products),'りんごデニッシュ');
 assert.equal(sortingPrintName(names[1],products),'甘夏ゼリー');
 assert.equal(sortingPrintName(names[2],products),'じゃがいも食パン');
 assert.equal(sortingPrintName(names[3],products),'フォカッチャ');
 assert.equal(sortingPrintName('甘夏ゼリー(冷) 約60g',[...products,{name:'甘夏ゼリー(冷) 約80g'}]),'甘夏ゼリー(冷) 約60g');
});
