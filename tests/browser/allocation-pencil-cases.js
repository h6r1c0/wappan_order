import {test,expect} from '@playwright/test';
import {execFileSync,spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {initialState,newRound,addSale,collections,stockRemaining,stockAllocation,report,validate} from '../../src/domain.js';
import {setSalesOrderQuantities,upgrade} from '../../src/commerce.js';
import {backend,login,openAfter,closeToast} from './workflow-helpers.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const beforeSHA='b90a2e2769bb7aab712c7418d842d591ec18bee7';
function fixture(){
 const state=initialState();
 state.buyers=[{id:'qa-a',name:'検証の購入者A',kana:'あ',active:true,fixed:[]},{id:'qa-b',name:'検証の購入者B',kana:'い',active:true,fixed:[]}];
 const round=newRound(state,'2026-10-16',true);state.rounds.push(round);
 setSalesOrderQuantities(state,round.id,{walnut:4,brown:3});
 for(const stock of state.stocks){stock.cost=100;addSale(state,stock,{qty:stock.qty,date:round.date,price:stock.price,destinationType:'unknown',paymentStatus:'unconfirmed'});}
 upgrade(state);validate(state);return {state,revision:0};
}
async function openWorkspace(page,context,shared){await backend(context,shared);await login(page);await page.locator('.round-list-item').click();await openAfter(page,'販売先を割り当てる');}
async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function startBefore(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wappan-before-'));
 execFileSync('git',['worktree','add','--detach',dir,beforeSHA],{cwd:root,stdio:'pipe'});
 await fs.symlink(path.join(root,'node_modules'),path.join(dir,'node_modules'),'dir');
 const port=await freePort(),url=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port)],{cwd:dir,env:{...process.env,VITE_SUPABASE_URL:'https://test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-public-key'},stdio:'ignore'});
 let ready=false;
 for(let n=0;n<100;n++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 if(!ready){child.kill();throw Error('変更前の隔離画面を起動できませんでした');}
 return {url,async stop(){child.kill();await new Promise(resolve=>child.once('exit',resolve));execFileSync('git',['worktree','remove','--force',dir],{cwd:root,stdio:'pipe'});}};
}
async function capture(page,engine,width,version,name){await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:`test-results/allocation-${engine}-${width}-${version}-${name}.png`,fullPage:true});}
async function scenario(browser,url,engine,width,version,mode){
 const context=await browser.newContext({baseURL:url,viewport:{width,height:812}}),page=await context.newPage(),shared=fixture();
 try{
  await backend(context,shared);await login(page);
  await capture(page,engine,width,version,`${mode}-home`);
  await page.locator('.round-list-item').click();await page.locator('.stage-1 > .stage-trigger').click();
  await capture(page,engine,width,version,`${mode}-stage`);
  await openAfter(page,'販売先を割り当てる');await closeToast(page);
  let taps=0;
  await page.evaluate(()=>{window.__scrollMetric={total:0,previous:scrollY};addEventListener('scroll',()=>{window.__scrollMetric.total+=Math.abs(scrollY-window.__scrollMetric.previous);window.__scrollMetric.previous=scrollY;});});
  const click=async locator=>{await locator.click();taps++;};
  if(mode==='buyer'){
   if(version==='before')await click(page.getByRole('button',{name:'購入者から複数商品をまとめて入力 ›',exact:true}));
   const work=page.locator('.sales-workspace:visible');
   await click(work.getByRole('button',{name:'検証の購入者A',exact:true}));
   await click(work.getByRole('button',{name:'くるみパン 割当数量を増やす'}));
   await click(work.getByRole('button',{name:'黒糖ブレッド 割当数量を増やす'}));
   await capture(page,engine,width,version,'buyer-picked');
   await click(work.getByRole('button',{name:'この2商品の割当を保存'}));
  }else{
   if(version==='after')await click(page.getByRole('button',{name:'商品別・残数',exact:true}));
   const work=page.locator('.sales-workspace:visible');
   await capture(page,engine,width,version,'product-list');
   if(version==='before'){
    for(const name of ['くるみパン','黒糖ブレッド']){
     await click(work.getByLabel(`${name}の割当状況`).getByRole('button',{name:'販売先・数量を入力'}));
     // Default quantity is already one in the old product editor.
     if(!await work.getByRole('button',{name:'検証の購入者A',exact:true}).isVisible())throw Error('購入者を選べません');
     await click(work.getByRole('button',{name:'検証の購入者A',exact:true}));
     await click(work.locator('.inline-assignment').getByRole('button',{name:'保存',exact:true}));
     await closeToast(page);
    }
   }else{
    await work.getByLabel('割当先',{exact:true}).selectOption('buyer:qa-a');taps++;
    for(const name of ['くるみパン','黒糖ブレッド'])await click(work.getByRole('button',{name:`${name} 割当数量を増やす`}));
    await click(work.getByRole('button',{name:'この2商品の割当を保存'}));
   }
  }
  await expect(page.locator('.sales-workspace:visible .sale-saved')).toBeVisible();
  const metrics=await page.locator('.sales-workspace:visible').evaluate(el=>({height:Math.round(el.getBoundingClientRect().height),scrollDistance:Math.round(window.__scrollMetric.total),overflow:document.documentElement.scrollWidth>innerWidth}));
  return {taps,...metrics};
 }finally{await context.close();}
}
export function registerAllocationTests(engine){
 let before;
 test.beforeAll(async()=>{before=await startBefore();});
 test.afterAll(async()=>{await before?.stop();});
 for(const width of [320,375,430])test(`${width}px: 変更前後の通常2商品割当と商品別一括割当を比較`,async({browser,baseURL})=>{
  test.setTimeout(120000);
  const result={engine,width,beforeSHA};
  for(const mode of ['buyer','product']){
   result[mode]={before:await scenario(browser,before.url,engine,width,'before',mode),after:await scenario(browser,baseURL,engine,width,'after',mode)};
   expect(result[mode].after.taps).toBeLessThan(result[mode].before.taps);
   expect(result[mode].after.overflow).toBe(false);
  }
  await fs.writeFile(`test-results/allocation-${engine}-${width}-metrics.json`,JSON.stringify(result,null,2));
  console.log('ALLOCATION_UX '+JSON.stringify(result));
 });
 test('分割・再読込・連続保存・保存失敗・再試行でも会計と原本を守る',async({page,context})=>{
  const shared=fixture(),before=structuredClone(shared.state),round=shared.state.rounds[0];
  const cashBefore=JSON.stringify(shared.state.collectionEntries),totalsBefore=report(shared.state,'2026-01-01','2026-12-31',2026,{includeTest:true});
  await openWorkspace(page,context,shared);await closeToast(page);
  await expect(page.getByRole('button',{name:'購入者からまとめて割当',exact:true})).toHaveAttribute('aria-pressed','true');
  const work=page.locator('.sales-workspace:visible');
  await work.getByRole('button',{name:'検証の購入者A',exact:true}).click();
  for(const name of ['くるみパン','黒糖ブレッド'])await work.getByRole('button',{name:`${name} 割当数量を増やす`}).click();
  let fail=true,attempts=0;
  await context.route('**/rest/v1/rpc/wappan_save',async route=>{attempts++;if(fail)return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'検証用の一時保存失敗'})});return route.fallback();});
  await work.getByRole('button',{name:'この2商品の割当を保存'}).click();
  await expect(work).toHaveAttribute('data-unsaved','true');
  expect(shared.state).toEqual({...before,rounds:shared.state.rounds}); // shortage confirmation is a separate, legitimate save.
  expect(shared.state.sales).toEqual(before.sales);
  fail=false;await closeToast(page);attempts=0;
  await work.getByRole('button',{name:'この2商品の割当を保存'}).evaluate(button=>{button.click();button.click();});
  await expect(work).toHaveAttribute('data-unsaved','false');expect(attempts).toBe(1);
  await closeToast(page);await work.locator('.buyer-index').getByRole('button',{name:'い',exact:true}).click();
  await work.getByRole('button',{name:'検証の購入者B',exact:true}).click();
  await work.getByRole('button',{name:'くるみパン 割当数量を増やす'}).click();
  await work.getByRole('button',{name:'この1商品の割当を保存'}).click();
  const walnut=shared.state.stocks.find(x=>x.productId==='walnut');
  expect(stockAllocation(shared.state,walnut)).toMatchObject({assigned:2,unconfirmed:2,remaining:0});
  const bills=collections(shared.state,'','',round.id,true);
  expect(bills.find(x=>x.id==='qa-a').onsite).toBe(round.products.find(x=>x.id==='walnut').price+round.products.find(x=>x.id==='brown').price);
  expect(bills.find(x=>x.id==='qa-b').onsite).toBe(round.products.find(x=>x.id==='walnut').price);
  expect(JSON.stringify(shared.state.collectionEntries)).toBe(cashBefore);
  expect(shared.state.products).toEqual(before.products);expect(shared.state.stocks).toEqual(before.stocks);
  for(const stock of shared.state.stocks){expect(stockRemaining(shared.state,stock)).toBe(0);expect(shared.state.sales.filter(s=>!s.void&&s.stockId===stock.id).reduce((n,s)=>n+s.qty,0)).toBe(stock.qty);}
  const totalsAfter=report(shared.state,'2026-01-01','2026-12-31',2026,{includeTest:true});
  // Reassigning previously unknown sales changes debt attribution, not overall sales or cost.
  expect(totalsBefore.revenue).toBeGreaterThan(0);expect(totalsBefore.cost).toBeGreaterThan(0);
  for(const key of ['revenue','cost','profit'])expect(totalsAfter[key]).toEqual(totalsBefore[key]);
  validate(shared.state);await page.reload();await page.locator('.round-list-item').click();
  await page.locator('.stage-3 > .stage-trigger').click();await page.locator('.after-work').filter({has:page.locator('summary',{hasText:'販売先を割り当てる'})}).locator('summary').click();
  await page.getByRole('button',{name:'商品別・残数',exact:true}).click();
  const product=page.locator('.sales-workspace:visible');
  await expect(product.getByLabel('くるみパンの割当状況')).toContainText('未割当 2個');
  await product.getByLabel('くるみパンの割当状況').locator('.stock-breakdown summary').click();
  await expect(product.getByLabel('くるみパンの割当状況')).toContainText('検証の購入者A 1個');
  await expect(product.getByLabel('くるみパンの割当状況')).toContainText('検証の購入者B 1個');
  // Quantity controls clamp a request larger than the remaining amount.
  await product.getByRole('button',{name:'くるみパン 割当数量 0、直接入力する'}).click();
  await product.getByLabel('くるみパン 割当数量 直接入力').fill('99');
  await expect(product.getByLabel('くるみパン 割当数量 直接入力')).toHaveValue('2');
 });
 test('L字は状態色・工程色と外縁を保ち、用途の塗りは文字幅、番号は同じ書体',async({page,context})=>{
  const shared=fixture();await backend(context,shared);await login(page);
  const card=page.locator('.round-list-item');
  for(const [status,color] of [['入力中','green'],['注文確定','blue'],['納品済み','orange'],['集金中','red'],['完了','green']]){
   await card.evaluate((el,status)=>{el.className=el.className.replace(/status-\S+/g,'')+` status-${status}`;},status);
   const css=await card.evaluate(el=>({v:getComputedStyle(el,'::before').backgroundImage,h:getComputedStyle(el,'::after').backgroundImage,w:parseFloat(getComputedStyle(el,'::before').width),height:parseFloat(getComputedStyle(el,'::after').height)}));
   expect(css.v).toContain(color+'-deep');expect(css.h).toContain(color+'-deep');expect(css.w).toBeGreaterThanOrEqual(6);expect(css.height).toBeGreaterThanOrEqual(3);
  }
  await card.click();
  for(const width of [320,375,430]){
   await page.setViewportSize({width,height:812});
   for(let n=1;n<=4;n++){
    const trigger=page.locator(`.stage-${n} > .stage-trigger`);await trigger.click();
    const css=await trigger.evaluate(el=>{const a=getComputedStyle(el,'::before'),b=getComputedStyle(el,'::after');return {left:a.left,top:a.top,bottom:a.bottom,footLeft:b.left,footBottom:b.bottom,v:a.backgroundImage,h:b.backgroundImage,font:getComputedStyle(el).fontFamily,numberFont:getComputedStyle(el.querySelector('.stage-number')).fontFamily};});
    expect(css).toMatchObject({left:'0px',top:'0px',bottom:'0px',footLeft:'0px',footBottom:'0px'});
    expect(css.v).toContain(['green','blue','orange','red'][n-1]+'-deep');expect(css.h).toBe(css.v);expect(css.numberFont).toBe(css.font);
    if(n===1){for(const purpose of ['個人注文','販売用','おやつ用']){
     const tab=page.locator('.purpose-grid .purpose').filter({hasText:purpose});await tab.click();
     const size=await tab.evaluate(el=>({button:el.getBoundingClientRect().width,ink:el.querySelector('span').getBoundingClientRect().width,height:el.getBoundingClientRect().height,image:getComputedStyle(el).backgroundImage}));
     expect(size.ink).toBeLessThan(size.button);expect(size.height).toBeGreaterThanOrEqual(44);expect(size.image).toBe('none');
    }}
    await capture(page,engine,width,'after',`stage-${n}-L`);await trigger.click();
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
 });
}
