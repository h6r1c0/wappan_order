import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = ['AGENTS.md', 'README.md', 'docs/BUSINESS_RULES.md',
  'docs/DEVELOPMENT_CHECKS.md', 'docs/ux-finish-checklist.md',
  'docs/DESIGN.md', 'docs/ACCEPTANCE.md', 'docs/VERIFICATION.md'];
const errors = [];
for (const file of files) {
  const full = resolve(root, file);
  if (!existsSync(full)) { errors.push(`${file}: ファイルがありません`); continue; }
  const body = readFileSync(full, 'utf8');
  for (const [, target] of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (/^(https?:|mailto:)/.test(target) || target.startsWith('#')) continue;
    const path = decodeURIComponent(target.split('#')[0]);
    if (path && !existsSync(resolve(dirname(full), path))) errors.push(`${file}: 参照先 ${target} がありません`);
  }
}
for (const [file, required] of Object.entries({
  'AGENTS.md': ['人間がしなくてよい', '調査', '変更', '本番', '検証'],
  'docs/BUSINESS_RULES.md': ['collectionEntries', 'collectionAllocations', 'collectionCorrections', 'collectionLive', 'setTest'],
  'docs/DEVELOPMENT_CHECKS.md': ['Chromium', 'WebKit', '本番', '模擬レビュー'],
})) {
  const full = resolve(root, file);
  if (!existsSync(full)) continue;
  const body = readFileSync(full, 'utf8');
  for (const word of required) if (!body.includes(word)) errors.push(`${file}: ${word} の参照がありません`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`${files.length}文書の参照と開発入口を確認しました`);
