import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const ledger=readFileSync(resolve(root,'docs/REQUEST_LEDGER.md'),'utf8');
const rows=ledger.split('\n').filter(line=>/^\| WAP-\d{4} \|/.test(line));
const errors=[];
const ids=new Set();
for(const [index,row] of rows.entries()){
  const cells=row.split('|').slice(1,-1).map(x=>x.trim());
  const [id,intent,source,acceptance,status,evidence,device]=cells;
  if(cells.length!==7)errors.push(`${id}: 列数が7ではありません`);
  if(ids.has(id))errors.push(`${id}: 重複`);
  ids.add(id);
  if(id!==`WAP-${String(index+1).padStart(4,'0')}`)errors.push(`${id}: 採番が連続していません`);
  for(const [name,value] of Object.entries({intent,source,acceptance,evidence,device}))if(!value||value==='—')errors.push(`${id}: ${name} が空欄`);
  if(!['未依頼','Workに依頼済み','実装報告あり','未解決','判断待ち','明示的に撤回'].includes(status))errors.push(`${id}: 不正な状態 ${status}`);
  if(!/^(未確認|不合格|確認済み|対象外)/.test(device||''))errors.push(`${id}: 実機欄が不明 ${device}`);
  if(status==='実装報告あり'&&!/(`[^`]+`|https?:)/.test(evidence||''))errors.push(`${id}: 実装証拠がありません`);
}
if(rows.length<2)errors.push('台帳に要望がありません');
for(const id of ['WAP-0001','WAP-0002']){
  if(!ids.has(id)||!ledger.includes(`### ${id}：`))errors.push(`${id}: 元の意図・Work・実装・実機の追跡例がありません`);
}

function checkHandoff(body,label){
  const line=body.match(/^対象ID:\s*(.+)$/m)?.[1]?.trim();
  if(!line){errors.push(`${label}: 対象ID行がありません`);return;}
  if(/^対象外（.+）$/.test(line))return;
  const targets=line.split(/[,、]\s*/).map(x=>x.trim());
  if(!targets.length||targets.some(x=>!/^WAP-\d{4}$/.test(x)))errors.push(`${label}: ID形式が不正です`);
  if(new Set(targets).size!==targets.length)errors.push(`${label}: 対象IDが重複しています`);
  for(const id of targets){
    if(!ids.has(id))errors.push(`${label}: 台帳にない ${id}`);
    const line=body.split('\n').find(x=>x.startsWith(`| ${id} |`));
    if(!line){errors.push(`${label}: ${id} の対応結果行がありません`);continue;}
    const cells=line.split('|').slice(1,-1).map(x=>x.trim());
    if(cells.length<4||!/^(実装済み|部分完了|未完了|既存で充足|実装報告あり|台帳へ回収)/.test(cells[1]||'')||!cells[2]||!cells[3]||cells.some(x=>x.includes('例：')))
      errors.push(`${label}: ${id} の結果・証拠・実機欄が未記入です`);
  }
  const reported=body.split('\n').filter(x=>/^\| WAP-\d{4} \|/.test(x)).map(x=>x.split('|')[1].trim());
  for(const id of reported)if(!targets.includes(id))errors.push(`${label}: 対象外の対応行 ${id}`);
}

if(process.argv[2]==='--handoff'){
  const path=resolve(root,process.argv[3]||'');
  if(!existsSync(path))errors.push(`引渡し文がありません: ${path}`);
  else checkHandoff(readFileSync(path,'utf8'),'模擬引渡し');
}else if(process.env.GITHUB_EVENT_NAME==='pull_request'&&process.env.GITHUB_EVENT_PATH){
  const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  checkHandoff(event.pull_request?.body||'','PR本文');
}

if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log(`要望台帳 ${rows.length} 件、ID・状態・出典・受入・証拠・引渡し対応を確認しました`);
