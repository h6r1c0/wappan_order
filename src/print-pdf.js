import {PDFDocument,PageSizes,rgb,pushGraphicsState,popGraphicsState,setTextRenderingMode,TextRenderingMode,setLineWidth} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {sortingPages} from './print-prep.js';

const mm=value=>value*72/25.4;
const ink=rgb(.067,.067,.067);

// Render vectors and a fully embedded Japanese font. Fontkit subsetting of this
// Japanese font dropped visible glyphs in render QA, so retain the complete font.
// No HTML, URL, current
// time, browser header/footer, JavaScript print action, or external resources.
export async function createPrintPdf(model,fontBytes) {
  const doc=await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font=await doc.embedFont(fontBytes,{subset:false});
  const title=model.kind==='collections'?(model.pending?'集金袋用請求表（未確定）':'集金袋用請求表'):model.kind==='sales'?'販売記録表':'個人注文仕分け表';
  doc.setTitle(`${title} ${model.date}`);doc.setCreator('わっぱん');
  const text=(page,value,x,baseline,size=10,{right=false,bold=false}={})=>{
    const label=String(value);
    const width=font.widthOfTextAtSize(label,size);
    if(bold)page.pushOperators(pushGraphicsState(),setTextRenderingMode(TextRenderingMode.FillAndOutline),setLineWidth(.22));
    page.drawText(label,{x:mm(x)-(right?width:0),y:page.getHeight()-mm(baseline),size,font,color:ink});
    if(bold)page.pushOperators(popGraphicsState());
  };
  const line=(page,x1,y1,x2,y2,{dashed=false,gray=.2,width=.25}={})=>page.drawLine({
    start:{x:mm(x1),y:page.getHeight()-mm(y1)},end:{x:mm(x2),y:page.getHeight()-mm(y2)},
    thickness:mm(width),color:rgb(gray,gray,gray),...(dashed?{dashArray:[mm(.9),mm(.7)]}:{})
  });
  const wrap=(value,size,width)=>{
    const result=[];let current='';
    const tokens=String(value).match(/\d+(?:種)?×\d+個|\d+(?:個入り|個入|個|本|g|㎝)|\n|./gu)||[];
    for(const ch of tokens){
      if(ch==='\n'){result.push(current);current='';continue;}
      if(current&&font.widthOfTextAtSize(current+ch,size)>mm(width)){result.push(current);current=ch;}
      else current+=ch;
    }
    if(current||!result.length)result.push(current);
    return result;
  };
  const newPage=()=>{
    const page=doc.addPage(PageSizes.A4);
    text(page,title,12,17.7,13,{bold:true});
    text(page,`納品日 ${model.date.replaceAll('-','/')}`,197,17.7,10,{right:true});
    return page;
  };
  const salesPage=()=>{
    const page=newPage();
    text(page,'商品名',12,25.6,8.5);text(page,'価格',64,25.6,8.5);
    text(page,'購入者名（1個につき1名）',83,25.6,8.5);
    line(page,12,28,199,28,{gray:.65,width:.2});return page;
  };
  if(model.kind==='collections'){
    let page=newPage(),y=30;
    for(const bill of model.bills||[]){
      const labels=(bill.lines||[]).flatMap(l=>wrap(`${l.name}　${l.qty}個　${l.amount==null?'単価未確定':l.amount+'円'}`,9,172));
      if(bill.carry)labels.push(bill.carry>0?`過去未収 ${bill.carry.toLocaleString()}円`:`前回の預かり ${(-bill.carry).toLocaleString()}円を充当`);
      if(bill.confirmed)labels.push(`過去の支払済み確認 ${bill.confirmed.toLocaleString()}円を除外`);
      if(bill.received)labels.push(`この回の受取記録 ${bill.received.toLocaleString()}円 ／ 残る未収 ${Math.max(0,bill.balance).toLocaleString()}円`);
      const notes=(bill.issues||[]).flatMap(x=>wrap(x.message,8,172));
      const parts=[...labels,...notes,...(model.pending?[`未確定：${bill.reason||'照合待ち'}`]:[])];
      if(y+25+Math.min(parts.length,10)*5>285){page=newPage();y=30;}
      text(page,bill.name||'',14,y,12,{bold:true});text(page,`${bill.total.toLocaleString()}円${bill.issues?.length?'（要確認）':''}`,194,y,12,{right:true,bold:true});y+=8;
      for(const part of parts){if(y>280){page=newPage();y=30;}text(page,part,14,y,9);y+=5;}
      line(page,12,y+3,197,y+3,{gray:.6});y+=14;
    }
  }else if(model.kind==='sales'){
    let page=salesPage(),top=28;
    if(!model.sales.length)text(page,'販売用の商品はありません',12,39,11);
    for(const row of model.sales){
      // Keep the recognizable product phrase together when the narrow sales
      // column would otherwise leave only the last character on line two.
      const salesName=font.widthOfTextAtSize(row.name,10)>mm(50)
        ?row.name.replace('のチョコパン','の\nチョコパン'):row.name;
      const names=wrap(salesName,10,50);
      let remaining=row.qty;
      while(remaining>0){
        // Fit whole handwriting rows, then continue this product on a fresh
        // page if necessary. A large quantity never creates a clipped row.
        const nameHeight=names.length*5;
        if(top+Math.max(nameHeight,7)+2.4>287){page=salesPage();top=28;}
        const capacity=Math.max(1,Math.floor((287-top-2.4+1)/8))*5;
        const count=Math.min(remaining,capacity);
        const rowHeight=Math.max(nameHeight,Math.ceil(count/5)*8-1)+2.4;
        names.forEach((part,i)=>text(page,part,12,top+5+i*5,10));
        text(page,row.price==null?'未確認':`${row.price.toLocaleString('ja-JP')}円`,64,top+5,9);
        for(let i=0;i<count;i++){
          const x=83+(i%5)*24,y=top+1.2+7+Math.floor(i/5)*8;
          line(page,x,y,x+20,y);
        }
        top+=rowHeight;remaining-=count;
      }
    }
  }else{
    if(!model.pages.length){const page=newPage();text(page,'個人注文はありません',12,33,11);}
    const measuredRows=model.pages.flat().map(row=>({...row,lines:row.lines.map(product=>{
      const name=product.printName||product.name;
      let size=name.length<=11?9:9.5;
      if(name.length<=11&&font.widthOfTextAtSize(name,size)>mm(32.65))size=8.5;
      return {...product,pdfSize:size,printUnits:wrap(name,size,32.65).length};
    })}));
    for(const sheet of sortingPages(measuredRows)){
      const page=newPage(),cellHeight=235/sheet.rowCount;
      for(const row of sheet){
        const x=12+(row.col-1)*46.25,y=22+(row.top-1)*cellHeight,h=row.span*cellHeight;
        line(page,x,y,x+46.25,y,{dashed:true,gray:.47});line(page,x,y+h,x+46.25,y+h,{dashed:true,gray:.47});
        line(page,x,y,x,y+h,{dashed:true,gray:.47});line(page,x+46.25,y,x+46.25,y+h,{dashed:true,gray:.47});
        const nameSize=Math.min(15,mm(40.65)/Math.max(1,font.widthOfTextAtSize(row.name,15))*15);
        text(page,row.name,x+2.8,y+9, nameSize,{bold:true});
        let productTop=y+12.8;
        for(const product of row.lines){
          const name=product.printName||product.name;
          const size=product.pdfSize;
          const parts=wrap(name,size,32.65);
          parts.forEach((part,i)=>text(page,part,x+2.8,productTop+3.8+i*4.5,size));
          text(page,`×${product.qty}`,x+43.45,productTop+3.8,9.5,{right:true,bold:true});
          productTop+=parts.length*4.5+1;
        }
      }
    }
  }
  return doc.save();
}
