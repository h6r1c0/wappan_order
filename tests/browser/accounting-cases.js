import {test,expect} from '@playwright/test';
import {initialState,newRound,collectionPosition,report,addSale} from '../../src/domain.js';
import {setSalesOrderQuantities} from '../../src/commerce.js';
import {backend,login,setQty,closeToast,openAfter} from './workflow-helpers.js';
import {installPreviewProbe,openPdf,pdfBytes} from './print-preview-helpers.js';
import {PDFDocument} from 'pdf-lib';

function fixture(){
 const s=initialState();s.buyers=[{id:'hori',name:'堀',active:true,kana:'ほり',fixed:[]},{id:'sasaki',name:'佐々木',active:true,kana:'ささき',fixed:[]},{id:'nishio',name:'西尾',active:true,kana:'にしお',fixed:[]},{id:'yogo',name:'余語',active:true,kana:'よご',fixed:[]}];
 const r=newRound(s,'2026-09-11',true);r.collectionLive=true;r.status='納品済み';r.products=[{id:'base',name:'通常注文まとめ',category:'パン',price:2130,cost:1000},{id:'donut',name:'ツイストドーナツ',category:'パン',price:190,cost:156},
 {id:'sasaki-item',name:'抹茶シフォンケーキ(冷) 直径12cm型',category:'焼き菓子',price:1020,cost:600},{id:'nishio-item',name:'西尾さんの注文',category:'パン',price:690,cost:400},{id:'yogo-item',name:'余語さんの注文',category:'パン',price:1650,cost:1000},{id:'rye',name:'ライ麦くるみレーズン',category:'パン',price:200,cost:150}];
 r.orders={hori:{name:'堀',quantities:{base:1,donut:2}},sasaki:{name:'佐々木',quantities:{'sasaki-item':1}},nishio:{name:'西尾',quantities:{'nishio-item':1}},yogo:{name:'余語',quantities:{'yogo-item':1}}};s.rounds.push(r);
 s.receivableItems=[{id:'july',kind:'opening',buyerId:'yogo',date:'2026-07-24',amount:1670,reason:'未受取',note:'7/24分 未受取'},{id:'donut-add',kind:'additional',buyerId:'hori',roundId:r.id,date:r.date,amount:380,reason:'商品請求漏れ',note:'ツイストドーナツ2個',notifiedAmount:2130}];
 s.collectionReconciliations=[{id:'wrong',buyerId:'yogo',roundId:r.id,amount:1650,note:'9月分支払済み確認'}];
 return {state:s,revision:0,round:r};
}
async function openCollections(page,context,shared){await backend(context,shared);await login(page);await page.locator('.round-list-item').click();await page.locator('.stage-4 > .stage-trigger').click();}
async function person(page,id){const p=page.locator(`[data-buyer="${id}"]`);if(await p.getByRole('button',{name:'受取・請求確認 ›'}).count())await p.getByRole('button',{name:'受取・請求確認 ›'}).click();return p;}
async function widths(page,prefix){for(const width of [320,375,430,1280]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/${prefix}-${width}.png`});}}
export function registerAccountingTests(browserName){
 test('集金前の警告・商品選択・受取2130円と未収380円・確認だけでは受取を作らない',async({page,context})=>{
  const shared=fixture();await openCollections(page,context,shared);await expect(page.locator('.billing-audit')).toContainText('2,130円');
  const p=await person(page,'hori');await p.getByRole('button',{name:'請求・過去の履歴を調べる ›'}).click();
  await p.getByLabel('請求を確認する商品').selectOption('order:donut');await setQty(p,'請求漏れ数量',2);await expect(p.locator('.missing-charge-editor')).toContainText('380円');
  await p.getByRole('button',{name:'この商品・数量を請求へ反映'}).click();expect(shared.state.receivableItems.filter(x=>x.kind==='additional')).toHaveLength(1);
  await p.getByLabel('実際受取額',{exact:true}).fill('2130');await expect(p.getByLabel('実際受取額',{exact:true})).toHaveAttribute('inputmode','numeric');
  await p.getByLabel('金額が違う理由').selectOption('一部しか受け取っていない');await closeToast(page);await p.getByRole('button',{name:'受取額を保存',exact:true}).click();
  expect(collectionPosition(shared.state,shared.round.id,'hori').balance).toBe(380);expect(shared.state.collectionEntries[0].received).toBe(2130);
  const h=await person(page,'hori');await h.locator('.billing-confirm summary').click();await h.getByLabel('集金袋へ記載する金額').fill('2510');await h.getByRole('button',{name:'請求内容だけ確認'}).click();expect(shared.state.collectionEntries).toHaveLength(1);
  await h.locator('.collection-breakdown summary').click();await widths(page,`cash-${browserName}`);
  await installPreviewProbe(page);await page.getByRole('button',{name:'集金袋用の請求表を印刷 ›'}).click();await expect.poll(()=>page.evaluate(()=>window.__previewUrls.length)).toBe(1);const bytes=await pdfBytes(page,await page.evaluate(()=>window.__previewUrls[0]));expect((await PDFDocument.load(bytes)).getTitle()).toBe('集金袋用請求表 2026-09-11');
 });
 test('佐々木・西尾は受取額と理由で過去分を同時登録、余語は誤確認を明示して訂正',async({page,context})=>{
  const shared=fixture();await openCollections(page,context,shared);
  const sasaki=await person(page,'sasaki');await sasaki.getByLabel('実際受取額',{exact:true}).fill('1070');await sasaki.getByLabel('金額が違う理由').selectOption('前回の不足分をまとめて受け取った');await sasaki.getByLabel('前回分の対象日').fill('2026-07-24');await sasaki.getByRole('button',{name:'受取額を保存'}).click();expect(collectionPosition(shared.state,shared.round.id,'sasaki').balance).toBe(0);
  const nishio=await person(page,'nishio');await nishio.getByLabel('実際受取額',{exact:true}).fill('590');await nishio.getByLabel('金額が違う理由').selectOption('前回の預かり金を今回使った');await nishio.getByLabel('前回分の対象日').fill('2026-07-24');await closeToast(page);await nishio.getByRole('button',{name:'受取額を保存'}).click();expect(collectionPosition(shared.state,shared.round.id,'nishio').balance).toBe(0);expect(report(shared.state,'2026-04-01','2027-03-31',2026).revenue).toBe(0);
  const yogo=await person(page,'yogo');await expect(yogo).toContainText('過去未収 1,670円');await yogo.getByRole('button',{name:'請求・過去の履歴を調べる ›'}).click();await yogo.getByRole('button',{name:'この記録を確認・訂正 ›'}).click();await yogo.getByLabel('履歴の訂正理由').selectOption('支払済みの確認が誤っていた');await closeToast(page);await yogo.getByRole('button',{name:'対象記録の訂正を保存'}).click();expect(collectionPosition(shared.state,shared.round.id,'yogo').balance).toBe(3320);expect(shared.state.collectionReconciliations[0].id).toBe('wrong');
 });
 test('調査中の受取額を要確認で保存し、再読込・再開しても会計へ計上しない',async({page,context})=>{
  const shared=fixture();await openCollections(page,context,shared);let p=await person(page,'hori');await p.getByLabel('実際受取額',{exact:true}).fill('2130');await p.getByLabel('金額が違う理由').selectOption('原因が分からないので調べたい');await p.getByLabel('調査メモ（任意）').fill('商品の数量を確認');await p.getByRole('button',{name:'要確認として保存'}).click();expect(shared.state.collectionEntries).toHaveLength(0);
  await page.reload();await page.locator('.round-list-item').click();await page.locator('.stage-4 > .stage-trigger').click();p=await person(page,'hori');await expect(p.getByLabel('実際受取額',{exact:true})).toHaveValue('2130');await p.getByRole('button',{name:'請求・過去の履歴を調べる ›'}).click();await expect(p.locator('.collection-investigation .charge-line').filter({hasText:'ツイストドーナツ'})).toContainText('2個');expect(shared.state.collectionEntries).toHaveLength(0);
 });
 test('元の注文へ移動して戻っても受取額と調査理由を失わない',async({page,context})=>{
  const shared=fixture();await openCollections(page,context,shared);let p=await person(page,'hori');await p.getByLabel('実際受取額',{exact:true}).fill('2130');await p.getByLabel('金額が違う理由').selectOption('原因が分からないので調べたい');
  await p.getByRole('button',{name:'元の個人注文を確認・修正 ›'}).click();await expect(page.locator('.order-editor')).toBeVisible();
  await page.getByRole('button',{name:'元の集金へ戻る（受取額を保持）'}).click();p=page.locator('[data-buyer="hori"]');await expect(p.getByLabel('実際受取額',{exact:true})).toHaveValue('2130');await expect(p.getByLabel('金額が違う理由')).toHaveValue('原因が分からないので調べたい');expect(shared.state.collectionEntries).toHaveLength(0);
 });
 test('2個を1個ずつ割当して一覧に戻り、完了後も履歴を保持、購入者入力は即一覧',async({page,context})=>{
  const shared=fixture();setSalesOrderQuantities(shared.state,shared.round.id,{rye:2,donut:2});const st=shared.state.stocks.find(x=>x.productId==='rye');addSale(shared.state,st,{date:shared.round.date,qty:2,destinationType:'unknown',paymentStatus:'unconfirmed'});
  await backend(context,shared);await login(page);await page.locator('.round-list-item').click();await openAfter(page,'販売先を割り当てる');
  const work=page.locator('.sales-workspace').filter({visible:true});await work.locator('.stock-summary').filter({hasText:'ライ麦くるみレーズン'}).getByRole('button',{name:'この商品を割り当てる ›'}).click();await setQty(work,'ライ麦くるみレーズン 割当数量',1);await work.locator('.buyer-index').getByRole('button',{name:'すべて',exact:true}).click();await work.getByRole('button',{name:'佐々木',exact:true}).click();await work.getByRole('button',{name:'この1個の割当を保存'}).click();await expect(work.locator('.sales-product-list')).toBeVisible();await expect(work.getByLabel('ライ麦くるみレーズンの割当状況')).toContainText('未割当 1個');
  await work.getByLabel('ライ麦くるみレーズンの割当状況').getByRole('button',{name:'この商品を割り当てる ›'}).click();await work.locator('.buyer-index').getByRole('button',{name:'すべて',exact:true}).click();await work.getByRole('button',{name:'西尾',exact:true}).click();await closeToast(page);await work.getByRole('button',{name:'この1個の割当を保存'}).click();await expect(work.locator('.sales-product-list > .stock-summary').filter({hasText:'ライ麦くるみレーズン'})).toHaveCount(0);await work.locator('.completed-stocks summary').click();await expect(work.getByLabel('ライ麦くるみレーズンの割当状況')).toContainText('佐々木 1個');await widths(page,`assignment-${browserName}`);
  await page.getByRole('button',{name:'購入者から入力',exact:true}).click();const buyer=page.locator('.sales-workspace').filter({visible:true});await buyer.locator('.buyer-index').getByRole('button',{name:'すべて',exact:true}).click();await buyer.getByRole('button',{name:'堀',exact:true}).click();await expect(buyer.locator('.assignment-product-row')).toHaveCount(1);await setQty(buyer,'ツイストドーナツ 割当数量',1);page.once('dialog',d=>d.dismiss());await page.locator('.stage-4 > .stage-trigger').click();await expect(page.locator('.stage-3 > .stage-trigger')).toHaveAttribute('aria-expanded','true');await expect(buyer.getByRole('button',{name:'ツイストドーナツ 割当数量 1、直接入力する'})).toBeVisible();await buyer.getByRole('button',{name:'この1商品の割当を保存'}).click();expect(shared.state.sales.filter(x=>x.stockId===st.id&&x.destinationType==='buyer')).toHaveLength(2);
 });
}
