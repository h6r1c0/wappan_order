import {expect} from '@playwright/test';

export async function installPreviewProbe(page){
  await page.evaluate(()=>{
    window.__nativeOpen=window.open;
    window.__previewUrls=[];window.__previewWindows=[];
    window.__prints=0;window.__dialogs=0;
    window.print=()=>{window.__prints++};
    window.alert=window.confirm=()=>{window.__dialogs++};
    window.open=()=>{
      const preview={closed:false,document:document.implementation.createHTMLDocument(),opener:window,
        location:{replace(url){window.__previewUrls.push(url)}}};
      window.__previewWindows.push(preview);return preview;
    };
  });
}
export async function openPdf(page,name){
  const before=await page.evaluate(()=>window.__previewUrls.length);
  await page.getByRole('button',{name,exact:false}).click();
  await expect(page.getByRole('region',{name:'納品前の印刷'})).toHaveAttribute('aria-busy','false');
  expect(await page.evaluate(()=>window.__previewUrls.length)).toBe(before+1);
  return page.evaluate(()=>window.__previewUrls.at(-1));
}
export async function pdfBytes(page,url){
  const base64=await page.evaluate(async url=>{
    const bytes=new Uint8Array(await (await fetch(url)).arrayBuffer());
    let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return btoa(binary);
  },url);
  return Buffer.from(base64,'base64');
}
