import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initialState,newRound} from '../src/domain.js';

test('注文回の直近操作は成功したrevisionだけから抽出し、別アカウントにも共有する',async()=>{
 const db=new PGlite();
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 const folder=new URL('../supabase/migrations/',import.meta.url);
 for(const file of (await fs.readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await fs.readFile(new URL(file,folder),'utf8'));
 const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
 await db.exec(`insert into auth.users values('${a}','staff-a@example.test'),('${b}','staff-b@example.test');insert into wappan_private.wappan_staff(user_id) values('${a}'),('${b}');`);
 await db.exec('set role authenticated');await db.exec(`set "request.jwt.claim.sub"='${a}'`);
 const s=initialState(),r=newRound(s,'2026-09-11'),other=newRound(s,'2026-10-16');s.rounds.push(r,other);
 await db.query("select public.wappan_save(0,$1,'注文回を作成')",[s]);
 r.orders.hori={name:'堀',quantities:{brown:1}};
 await db.query("select public.wappan_save(1,$1,'個人注文を更新')",[s]);
 await assert.rejects(()=>db.query("select public.wappan_save(1,$1,'保存失敗')",[s]),/CONFLICT/);
 const rows=(await db.query('select * from public.wappan_round_activity($1,5)',[r.id])).rows;
 assert.deepEqual(rows.map(x=>x.description),['個人注文を更新','注文回を作成']);
 assert.equal(rows[0].actor_account,'staff-a@example.test');
 assert.deepEqual((await db.query('select description from public.wappan_round_activity($1,5)',[other.id])).rows.map(x=>x.description),['注文回を作成']);
 await db.exec(`set "request.jwt.claim.sub"='${b}'`);
 assert.equal((await db.query('select * from public.wappan_round_activity($1,5)',[r.id])).rows.length,2);
 await db.exec('reset role; set role anon');
 await assert.rejects(()=>db.query('select * from public.wappan_round_activity($1,5)',[r.id]),/permission denied/);
 await db.close();
});
