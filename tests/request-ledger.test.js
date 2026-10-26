import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkLedger,checkRequest,checkHandoff,parseLedger} from '../scripts/check-request-ledger.mjs';
const ledger=readFileSync(new URL('../docs/REQUEST_LEDGER.md',import.meta.url),'utf8');
const request=JSON.parse(readFileSync(new URL('../docs/requests/issue-25.json',import.meta.url),'utf8'));
const report=readFileSync(new URL('../docs/requests/issue-25-result.md',import.meta.url),'utf8');
const copy=()=>structuredClone(request);
test('保存された実要望58件と依頼・完了記録が一致する',()=>{
 assert.equal(parseLedger(ledger).length,58);
 assert.deepEqual(checkLedger(ledger),[]);assert.deepEqual(checkRequest(request,ledger),[]);assert.deepEqual(checkHandoff(report,request,ledger),[]);
});
test('PRからIDと対応行が同時に消えても元の依頼から欠落を検出する',()=>{
 const broken=report.replace('WAP-0002, ','').split('\n').filter(x=>!x.startsWith('| WAP-0002 |')).join('\n');
 assert.match(checkHandoff(broken,request,ledger).join('\n'),/WAP-0002: 元の依頼から対象IDが欠落/);
});
test('元の意図・受入条件が依頼から消えたら失敗する',()=>{
 for(const field of ['intent','acceptance']){const r=copy();delete r.targets[0][field];assert.match(checkRequest(r,ledger).join('\n'),/受入条件の欠落/);}
});
test('未知ID・重複ID・結果欠落・対象外行を検出する',()=>{
 assert.match(checkHandoff(report.replace('対象ID: WAP-0001,','対象ID: WAP-9999,'),request,ledger).join('\n'),/元の依頼にない対象ID/);
 assert.match(checkHandoff(report.replace('対象ID: WAP-0001,','対象ID: WAP-0001, WAP-0001,'),request,ledger).join('\n'),/重複/);
 assert.match(checkHandoff(report.replace(/^\| WAP-0001 \|.*\n/m,''),request,ledger).join('\n'),/対応結果行/);
 assert.match(checkHandoff(report+'\n| WAP-9999 | 未完了 | 残作業あり | 未確認 |',request,ledger).join('\n'),/対象外の対応行/);
});
test('自己申告の対象外と二重の対象ID行で検査を回避できない',()=>{
 assert.notDeepEqual(checkHandoff(report.replace(/^対象ID:.*$/m,'対象ID: 対象外（文書のみ）'),request,ledger),[]);
 assert.match(checkHandoff(report+'\n対象ID: WAP-0001',request,ledger).join('\n'),/ちょうど1行/);
});
test('部分完了の残作業、実機の誤合格、空欄を検査する',()=>{
 assert.match(checkHandoff(report.replace(/\| WAP-0054 \|[^\n]+/,'| WAP-0054 | 部分完了 | テスト成功 | 対象外 |'),request,ledger).join('\n'),/残作業/);
 assert.match(checkHandoff(report.replace(/(\| WAP-0001 \|[^\n]+\| )未確認 \|/,'$1確認済み |'),request,ledger).join('\n'),/台帳にない実機合格/);
 assert.match(checkHandoff(report.replace(/\| WAP-0001 \|[^\n]+/,'| WAP-0001 | 台帳へ回収 | | 未確認 |'),request,ledger).join('\n'),/未記入/);
});
test('既存ID削除・原意の履歴なし上書きを防ぎ、訂正履歴の保持を許容する',()=>{
 assert.match(checkLedger(ledger.replace(/^\| WAP-0010 \|.*\n/m,''),ledger).join('\n'),/既存IDを削除/);
 const original=parseLedger(ledger).find(x=>x[0]==='WAP-0010')[1];
 const changed=ledger.replace(original,'訂正後の新しい意図');
 assert.match(checkLedger(changed,ledger).join('\n'),/旧意図/);
 assert.deepEqual(checkLedger(changed+'\nWAP-0010 訂正前：'+original,ledger),[]);
});
test('対象外は理由と継続先を必須にする',()=>{
 const r=copy();r.targets=r.targets.filter(x=>x.id!=='WAP-0002');r.deferred=[{id:'WAP-0002'}];assert.notDeepEqual(checkRequest(r,ledger),[]);
 r.deferred[0]={id:'WAP-0002',reason:'今回台帳のみ',next:'同じ台帳で実機確認待ち'};assert.deepEqual(checkRequest(r,ledger),[]);
});
test('訂正・撤回で欠番があっても既存IDを振り直さない',()=>{
 const gapped=ledger.replace(/^\| WAP-0010 \|.*\n/m,'');assert.deepEqual(checkLedger(gapped),[]);
});
