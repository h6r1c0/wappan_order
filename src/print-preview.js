let resources;
const previews=[];
const documents=new Map();
function pdfResources(){
  if(!resources)resources=Promise.all([
    import('./print-pdf.js'),
    (async()=>{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),20000);
      try{
        const r=await fetch(new URL('./assets/fonts/NotoSansJP-Regular.ttf',import.meta.url),{signal:controller.signal});
        if(!r.ok)throw new Error('print-font');return await r.arrayBuffer();
      }finally{clearTimeout(timeout);}
    })(),
  ]).catch(error=>{resources=null;throw error;});
  return resources;
}

// Called directly in the click handler, before any await: browsers can allow
// this preview tab as a user action even when loading the PDF takes time.
export async function openPrintPreview(model){
  // A blocked popup has only an inline fallback link. The caller removes that
  // link before starting another request, so its old URL can be released too.
  for(let i=previews.length-1;i>=0;i--)if(!previews[i].window||previews[i].window.closed){
    URL.revokeObjectURL(previews[i].url);previews.splice(i,1);
  }
  let preview;
  try{preview=window.open('about:blank','_blank');}catch{preview=null;}
  const title=model.kind==='sales'?'販売記録表':'個人注文仕分け表';
  if(preview){
    preview.opener=null;
    preview.document.title=title;
    const message=preview.document.createElement('p');
    message.textContent='帳票を準備しています…';
    message.style.cssText='font:16px sans-serif;padding:24px;color:#333';
    preview.document.body.replaceChildren(message);
  }
  try{
    const key=JSON.stringify(model);
    let file=documents.get(model.kind)?.key===key?documents.get(model.kind).file:null;
    if(!file){
      const [{createPrintPdf},fontBytes]=await pdfResources();
      const bytes=await createPrintPdf(model,fontBytes);
      file=new File([bytes],`${title}_${model.date}.pdf`,{type:'application/pdf'});
      documents.set(model.kind,{key,file});
    }
    const url=URL.createObjectURL(file);
    if(preview&&!preview.closed){
      try{preview.location.replace(url);previews.push({window:preview,url});return {url,blocked:false};}
      catch{ /* Keep a normal link available if the browser rejects navigation. */ }
    }
    previews.push({window:null,url});
    return {url,blocked:true};
  }catch(error){
    if(preview&&!preview.closed)preview.document.body.textContent='帳票を作成できませんでした。この画面を閉じて、元の画面からもう一度お試しください。';
    throw error;
  }
}
