import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument,PDFName,decodePDFRawStream} from 'pdf-lib';
import {initialState,newRound,collections,report} from '../src/domain.js';
import {saveOtherSale,replaceOtherDistribution} from '../src/other-sales.js';
import {envelopePrintRows,sortingPages,sortingPrintName} from '../src/print-prep.js';
import {createPrintPdf} from '../src/print-pdf.js';
import {originBreakdown,roundSeries} from '../src/report-series.js';

test('4〜8月の手入力売上を全体線だけに載せ、同日詳細取引との重複候補は加算保留する',()=>{
 const s=initialState();
 const manual=[['2026-04-17',800],['2026-04-30',15980],['2026-05-15',17150],['2026-06-12',40560],['2026-07-24',17410],['2026-08-07',10780]];
 s.history=manual.map(([date,revenue],i)=>({id:`manual-${i}`,date,revenue,cost:0,profit:revenue,test:false}));
 const r=newRound(s,'2026-09-11',false);s.rounds.push(r);
 const rows=report(s,'2026-04-01','2027-03-31',2026).rows;
 const series=roundSeries(rows,[r],s,'revenue','origin');
 assert.deepEqual(series.slice(0,6).map(x=>[x.date,x.total,x.parts,x.manual]),manual.map(([date,revenue])=>[date,revenue,{},true]));
 assert.equal(series.filter(x=>x.date.startsWith('2026-04')).reduce((n,x)=>n+x.total,0),16780);
 assert.equal(series.slice(0,6).reduce((n,x)=>n+x.total,0),manual.reduce((n,x)=>n+x[1],0));
 const duplicate={...rows[0],id:'same-month',date:'2026-09-11',type:'過去実績',revenue:999};
 const detailed={id:'detail',date:'2026-09-11',type:'販売用商品',revenue:300,profit:100};
 assert.equal(roundSeries([...rows,duplicate,detailed],[r],s,'revenue','method').find(x=>x.date===r.date).total,300);
 assert.equal(Object.values(roundSeries([...rows,duplicate,detailed],[r],s,'revenue','method').find(x=>x.date===r.date).parts).reduce((n,x)=>n+x,0),300);
});

test('同月別日の手入力を落とさず、同日重複候補は年度・月別・グラフで同じく保留する',()=>{
 const s=initialState(),r=newRound(s,'2026-09-11',false);s.rounds.push(r);
 r.orders.hori={name:'堀',quantities:{brown:1}};r.products.find(p=>p.id==='brown').price=430;
 s.history=[{id:'earlier',date:'2026-09-01',revenue:800,cost:500,test:false},{id:'overlap',date:r.date,revenue:999,cost:600,test:false}];
 const original=structuredClone(s),annual=report(s,'2026-04-01','2027-03-31',2026),monthly=report(s,'2026-09-01','2026-09-30',2026);
 assert.equal(annual.revenue,1230);assert.equal(monthly.revenue,1230);
 assert.equal(annual.historyOverlaps[0].id,'overlap');
 const points=roundSeries(annual.rows,[r],s,'revenue');assert.equal(points.reduce((n,p)=>n+p.total,0),annual.revenue);
 assert.equal(points.find(p=>p.date==='2026-09-01').total,800);assert.deepEqual(s,original);
});

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
