import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { initialState, transfer, addSale, newRound } from "../src/domain.js";
test("Postgres: migration/RLS/許可された係だけ保存/競合拒否/振替検証/監査履歴", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
  );
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await fs.readdir(migrations)).filter(f=>f.endsWith('.sql')).sort()) {
    await db.exec(await fs.readFile(new URL(file,migrations),'utf8'));
  }
  const id = "00000000-0000-0000-0000-000000000001";
  await db.exec(
    `insert into auth.users values('${id}'); insert into wappan_private.wappan_staff values('${id}');`,
  );
  const state = initialState();
  await db.exec("set role anon");
  await assert.rejects(
    () => db.query("select * from public.wappan_workspace"),
    /permission denied/,
  );
  await db.exec("reset role; set role authenticated");
  assert.equal(
    (await db.query("select * from public.wappan_workspace")).rows.length,
    0,
  );
  await assert.rejects(
    () => db.query("select public.wappan_save(0,$1,'test')", [state]),
    /FORBIDDEN/,
  );
  await db.exec(`set "request.jwt.claim.sub"='${id}'`);
  assert.equal(
    (await db.query("select * from public.wappan_workspace")).rows.length,
    1,
  );
  await assert.rejects(
    () => db.query("update public.wappan_workspace set revision=100"),
    /permission denied/,
  );
  assert.equal(
    (
      await db.query("select public.wappan_save(0,$1,'initial') as rev", [
        state,
      ])
    ).rows[0].rev,
    1,
  );
  await assert.rejects(
    () => db.query("select public.wappan_save(0,$1,'stale')", [state]),
    /CONFLICT/,
  );
  const e = {
    id: "ev",
    name: "行事",
    date: "2026-09-11",
    test: false,
    lines: [{ id: "line", name: "パン", qty: 20, used: 18, cost: 138 }],
  };
  state.events.push(e);
  transfer(state, e, e.lines[0], 2, 200, "2026-09-11");
  addSale(state, state.stocks[0], { date: "2026-09-11", qty: 1, paid: true });
  await db.query("select public.wappan_save(1,$1,'transfer')", [state]);
  e.lines[0].used = 19;
  await assert.rejects(
    () => db.query("select public.wappan_save(2,$1,'invalid')", [state]),
    /overallocated/,
  );
  e.lines[0].used = 18;
  const r = newRound(state, "2026-09-11");
  r.eventIds = [e.id];
  r.invoice = 2760;
  state.rounds.push(r);
  await db.query("select public.wappan_save(2,$1,'invoice')", [state]);
  const r2 = newRound(state, "2026-09-11");
  r2.eventIds = [e.id];
  state.rounds.push(r2);
  await assert.rejects(
    () => db.query("select public.wappan_save(3,$1,'double')", [state]),
    /Duplicate invoice/,
  );
  assert.equal(
    (await db.query("select count(*)::int as n from public.wappan_revisions"))
      .rows[0].n,
    3,
  );
  state.rounds.pop();
  const unknown={id:"unconfirmed",name:"資料商品",date:"2026-09-11",qty:2,price:390,cost:null,test:true};
  state.stocks.push(unknown);
  addSale(state,unknown,{date:"2026-09-11",qty:2,pending:true,paid:false});
  await db.query("select public.wappan_save(3,$1,'unconfirmed sale')",[state]);
  state.sales.at(-1).paid=true;
  await assert.rejects(()=>db.query("select public.wappan_save(4,$1,'invalid pending')",[state]),/Pending sale/);
  state.sales.at(-1).paid=false;
  unknown.qty=1;
  await assert.rejects(()=>db.query("select public.wappan_save(4,$1,'oversold')",[state]),/oversold/);
  await db.close();
});
