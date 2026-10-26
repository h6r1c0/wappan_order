import {readFileSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const statuses=['未依頼','Workに依頼済み','実装報告あり','未解決','判断待ち','明示的に撤回'];
const cells=line=>line.split('|').slice(1,-1).map(x=>x.trim());
export function parseLedger(body){return body.split('\n').filter(x=>/^\| WAP-\d{4} \|/.test(x)).map(cells);}
export function checkLedger(body,previous=''){
 const errors=[],rows=parseLedger(body),ids=new Set();
 for(const row of rows){
  const [id,intent,source,acceptance,status,evidence,device]=row;
  if(row.length!==7)errors.push(`${id}: 列数が7ではありません`);
  if(ids.has(id))errors.push(`${id}: 重複`);ids.add(id);
  for(const [name,value] of Object.entries({intent,source,acceptance,evidence,device}))if(!value||value==='—')errors.push(`${id}: ${name} が空欄`);
  if(!statuses.includes(status))errors.push(`${id}: 不正な状態 ${status}`);
  if(!/^(未確認|不合格|確認済み|対象外)/.test(device||''))errors.push(`${id}: 実機欄が不明`);
  if(status==='実装報告あり'&&!/(`[^`]+`|https?:)/.test(evidence||''))errors.push(`${id}: 実装証拠がありません`);
 }
 if(rows.length<2)errors.push('台帳に要望がありません');
 for(const id of ['WAP-0001','WAP-0002'])if(!ids.has(id)||!body.includes(`### ${id}：`))errors.push(`${id}: 追跡例がありません`);
 for(const old of parseLedger(previous)){
  const current=rows.find(x=>x[0]===old[0]);
  if(!current){errors.push(`${old[0]}: 既存IDを削除しています`);continue;}
  for(const i of [1,3])if(old[i]!==current[i]&&!body.includes(old[i]))errors.push(`${old[0]}: 旧意図・受入条件を履歴へ保持してください`);
 }
 return errors;
}
export function checkRequest(request,ledger){
 const errors=[],rows=parseLedger(ledger);
 if(!request.source||!request.purpose||!Array.isArray(request.targets)||!request.targets.length)return ['依頼記録: source・purpose・targets が必要です'];
 const ids=new Set();
 for(const target of request.targets){
  if(ids.has(target.id))errors.push(`${target.id}: 依頼対象が重複`);ids.add(target.id);
  const row=rows.find(x=>x[0]===target.id);
  if(!row){errors.push(`${target.id}: 台帳にないID`);continue;}
  if(target.intent!==row[1]||target.acceptance!==row[3])errors.push(`${target.id}: 元の意図・受入条件の欠落または不一致`);
 }
 if(!Array.isArray(request.deferred))errors.push('依頼記録: 対象外IDと理由・継続先のリストが必要です');
 for(const item of request.deferred||[])if(!rows.some(x=>x[0]===item.id)||ids.has(item.id)||!item.reason||!item.next)errors.push(`${item.id}: 対象外の理由・継続先が不正`);
 return errors;
}
export function checkHandoff(body,request,ledger){
 const errors=checkRequest(request,ledger);
 const lines=[...body.matchAll(/^対象ID:\s*(.+)$/gm)];
 if(lines.length!==1)return [...errors,'対象ID行はちょうど1行必要です'];
 const targets=lines[0][1].trim().split(/[,、]\s*/);
 if(new Set(targets).size!==targets.length)errors.push('対象IDが重複しています');
 const expected=request.targets.map(x=>x.id);
 for(const id of expected)if(!targets.includes(id))errors.push(`${id}: 元の依頼から対象IDが欠落`);
 for(const id of targets)if(!expected.includes(id))errors.push(`${id}: 元の依頼にない対象ID`);
 const rows=body.split('\n').filter(x=>/^\| WAP-\d{4} \|/.test(x)).map(cells);
 for(const id of expected){
  const matching=rows.filter(x=>x[0]===id);
  if(matching.length!==1){errors.push(`${id}: 対応結果行は1行必要です`);continue;}
  const row=matching[0];
  if(row.length!==4||!['実装済み','部分完了','未完了','既存で充足','実装報告あり','台帳へ回収'].includes(row[1])||!row[2]||!row[3]||row.some(x=>x.includes('例：')))errors.push(`${id}: 結果・証拠・実機欄が未記入です`);
  if(!/^(未確認|不合格|確認済み|対象外)/.test(row[3]||''))errors.push(`${id}: 実機欄が不正`);
  if(/^(部分完了|未完了)$/.test(row[1])&&!/残|継続|待ち|未/.test(row[2]))errors.push(`${id}: 未完了の継続先・残作業が必要です`);
  if(row[3]?.startsWith('確認済み')&&!parseLedger(ledger).find(x=>x[0]===id)?.[6].startsWith('確認済み'))errors.push(`${id}: 台帳にない実機合格`);
 }
 for(const row of rows)if(!expected.includes(row[0]))errors.push(`${row[0]}: 対象外の対応行`);
 return errors;
}
function localRequest(path){
 const full=resolve(root,path);
 if(!relative(root,full).startsWith('docs/requests/')||!full.endsWith('.json'))throw Error('依頼記録は docs/requests/*.json を指定してください');
 return JSON.parse(readFileSync(full,'utf8'));
}
function main(){
 const ledger=readFileSync(resolve(root,'docs/REQUEST_LEDGER.md'),'utf8');
 let previous='',event;
 if(process.env.GITHUB_EVENT_NAME==='pull_request'){
  if(!process.env.GITHUB_EVENT_PATH)throw Error('PRイベントがありません');
  event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  const sha=event.pull_request?.base?.sha;
  if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('比較元SHAがありません');
  try{previous=execFileSync('git',['show',`${sha}:docs/REQUEST_LEDGER.md`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});}
  catch(error){
   // 初回導入のみ、比較元に台帳がない場合を許容する。取得失敗は成功扱いしない。
   const paths=execFileSync('git',['ls-tree','--name-only',sha,'docs/REQUEST_LEDGER.md'],{cwd:root,encoding:'utf8'});
   if(paths.trim())throw error;
  }
 }
 const errors=checkLedger(ledger,previous);
 const args=process.argv.slice(2),requestIndex=args.indexOf('--request'),handoffIndex=args.indexOf('--handoff');
 if(args.length&&requestIndex<0&&handoffIndex<0)throw Error('不明な引数');
 if(handoffIndex>=0){
  if(requestIndex<0)throw Error('--handoff には独立した --request が必要です');
  errors.push(...checkHandoff(readFileSync(resolve(root,args[handoffIndex+1]),'utf8'),localRequest(args[requestIndex+1]),ledger));
 }else if(requestIndex>=0)errors.push(...checkRequest(localRequest(args[requestIndex+1]),ledger));
 if(event){
  const body=event.pull_request?.body||'';
  const refs=[...body.matchAll(/^依頼記録:\s*(docs\/requests\/[^\s`]+\.json)\s*$/gm)];
  if(refs.length!==1)errors.push('PR本文: 独立した依頼記録を1件指定してください');
  else errors.push(...checkHandoff(body,localRequest(refs[0][1]),ledger));
 }
 if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
 else console.log(`要望台帳 ${parseLedger(ledger).length} 件と指定された依頼・結果の対応を確認しました`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
