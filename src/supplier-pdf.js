import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {createFont} from 'fonteditor-core';
import {productFamily,packSize} from './supplier-order.js';

export const toBase64=bytes=>{let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);};
export const fromBase64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const norm=value=>String(value).normalize('NFKC').replace(/[\s　]/g,'');
export async function extractTemplate(file,{cMapUrl}={}){
  if(file.size>900000)throw Error('注文書PDFは900KB以下にしてください（保存履歴の肥大化を防ぎます）');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const {getDocument,GlobalWorkerOptions}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  GlobalWorkerOptions.workerSrc=new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',import.meta.url).href;
  const task=getDocument({data:bytes.slice(),cMapUrl:cMapUrl||`${import.meta.env?.BASE_URL||'/'}cmaps/`,cMapPacked:true});
  const pdf=await task.promise;
  if(pdf.numPages!==1)throw Error('用紙が複数ページです。1ページずつのPDFを選んでください');
  const page=await pdf.getPage(1),view=page.getViewport({scale:1});
  const items=(await page.getTextContent()).items.filter(x=>x.str.trim()).map(x=>({text:x.str.trim(),x:x.transform[4],y:view.height-x.transform[5],width:x.width}));
  const whole=norm(items.map(x=>x.text).join(''));
  const kind=/定番菓子|季節菓子/.test(whole)?'sweets':/わっぱん注文書/.test(whole)?'bread':'unknown';
  if(kind==='unknown')throw Error('わっぱん提供の注文書として用紙を判定できません');
  const month=kind==='bread'?`${whole.match(/(20\d\d)年(\d{1,2})月お届け/)?.[1]||''}-${String(whole.match(/(20\d\d)年(\d{1,2})月お届け/)?.[2]||'').padStart(2,'0')}`:'';
  if(kind==='bread'&&!/^20\d\d-\d\d$/.test(month))throw Error('注文書の対象月を読み取れません');
  const bands=[];
  for(const item of items.sort((a,b)=>a.y-b.y||a.x-b.x)){
    const band=bands.find(b=>Math.abs(b.y-item.y)<1.4);
    if(band)band.items.push(item);else bands.push({y:item.y,items:[item]});
  }
  const rows=[];
  for(const band of bands){
    if(kind==='bread'){
      for(const [start,end,priceMin,priceMax,qtyX] of [[60,201,250,302,315],[430,570,645,687,723]]){
        if(band.y<90||band.y>520||!band.items.some(x=>x.x>=priceMin&&x.x<=priceMax&&/^\d{2,4}$/.test(x.text)))continue;
        const bits=band.items.filter(x=>x.x>=start&&x.x<end).sort((a,b)=>a.x-b.x);
        const name=bits.map(x=>x.text).join('').replace(/^[※・]+/,'').trim();
        if(!name||/商品名|内容量|本体価格/.test(name))continue;
        const unit=bits.find((x,i)=>/^\d{1,2}$/.test(x.text)&&bits[i+1]?.text==='個');
        rows.push({id:`${Math.round(band.y)}-${start}`,name,y:band.y,qtyX,unitX:unit?.x??null,unitWidth:unit?unit.width+(bits.find(x=>x.x>unit.x)?.width||7):null,unitEnd:end,kind:start===60?'bread-left':'bread-right'});
      }
    }else{
      if(band.y<219||band.y>535||!band.items.some(x=>x.x>410&&x.x<480&&/^\d{2,4}$/.test(x.text)))continue;
      const bits=band.items.filter(x=>x.x>=75&&x.x<230).sort((a,b)=>a.x-b.x);
      const name=bits.map(x=>x.text).join('').trim();
      if(name)rows.push({id:`${Math.round(band.y)}-s`,name,y:band.y,qtyX:503,kind:'sweets'});
    }
  }
  if(!rows.length)throw Error('注文欄を読み取れません。別のPDFまたは元のExcelを確認してください');
  return {id:crypto.randomUUID(),name:file.name,kind,month,rows,pdf:toBase64(bytes),page:{width:view.width,height:view.height},createdAt:new Date().toISOString()};
}

export async function renderSupplierPdf(template,plan,settings,date,{fontBytes,notice='',orderDate=''}={}){
  if(plan.issues.length)throw Error('発注書の未確認箇所を解決してください');
  const doc=await PDFDocument.load(fromBase64(template.pdf));doc.registerFontkit(fontkit);
  // pdf-lib's fontkit subsetting drops some Japanese glyphs in rendered PDFs.
  // Trim the TTF first, then embed that small complete font without subsetting.
  const writing=[settings.customer,settings.greeting,notice,date,orderDate,'0123456789/-：（）日月火水木金土曜個入り通信欄・追加注文の内容納品発注',...plan.notes,...plan.placements.map(x=>x.packCorrection||'')].join('');
  const codes=[...new Set([...writing].map(c=>c.codePointAt(0)))];
  const reduced=createFont(fontBytes,{type:'ttf',subset:codes});
  const font=await doc.embedFont(reduced.write({type:'ttf'}),{subset:false});
  const page=doc.getPages()[0],h=page.getHeight(),w=page.getWidth();
  const black=rgb(0.05,0.05,0.05);
  const text=(v,x,top,size=9)=>page.drawText(String(v),{x,y:h-top-size,size,font,color:black});
  const fit=(v,x,top,max,size=9)=>{if(font.widthOfTextAtSize(v,size)>max)throw Error(`用紙の欄に収まりません：${v}`);text(v,x,top,size);};
  if(template.kind==='bread'){
    fit(settings.customer,111,30,265,9);
    fit(String(Number(date.slice(5,7))),483,32,18,8);
    fit(String(Number(date.slice(8))),530,32,18,8);
    fit('日月火水木金土'[new Date(`${date}T00:00:00Z`).getUTCDay()],588,32,18,8);
  }else{
    fit(`納品 ${date.replaceAll('-','/')}　${settings.customer}`,40,155,w-80,9);
    if(orderDate)fit(`発注日 ${orderDate.replaceAll('-','/')}`,300,155,150,9);
  }
  const rows=new Map(template.rows.map(x=>[x.id,x]));
  for(const item of plan.placements){
    const row=rows.get(item.rowId);if(!row)throw Error('注文欄が見つかりません');
    fit(String(item.qty),item.sliced?389:row.qtyX+(row.kind==='bread-left'?5:-4),row.y-10,26,12);
    if(item.packCorrection){
      // Keep the supplier's original content visible and explicitly cross it out.
      if(row.unitX==null)throw Error(`${row.name}の内容量位置を確認してください`);
      page.drawLine({start:{x:row.unitX,y:h-row.y+2},end:{x:row.unitX+row.unitWidth,y:h-row.y+2},thickness:1.2,color:black});
      fit('1個',row.unitX+row.unitWidth+3,row.y-11,row.unitEnd-row.unitX-row.unitWidth-4,8);
    }
  }
  const notes=[settings.greeting,...plan.notes,notice].filter(Boolean).join('\n');
  if(template.kind==='bread'&&notes.split('\n').length<=3&&notes.split('\n').every(line=>font.widthOfTextAtSize(line,9)<=w-435)){
    notes.split('\n').forEach((line,i)=>fit(line,424,535+i*15,w-435,9));
  }else if(notes){
    const appendix=doc.addPage([w,h]);
    appendix.drawText('通信欄・追加注文の内容',{x:45,y:h-47,font,size:15,color:black});
    const lines=[];
    for(const para of notes.split('\n')){
      let line='';for(const ch of para){if(font.widthOfTextAtSize(line+ch,11)>w-90){lines.push(line);line=ch;}else line+=ch;}lines.push(line);
    }
    if(lines.length>28)throw Error('通信欄が別紙1枚に収まりません。文章を短くしてください');
    lines.forEach((line,i)=>appendix.drawText(line,{x:45,y:h-80-i*16,font,size:11,color:black}));
    appendix.drawText(`納品日 ${date}　${settings.customer}`,{x:45,y:35,font,size:9,color:black});
  }
  return await doc.save();
}
