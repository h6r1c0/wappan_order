import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeSheet, displayedPrice, permanentProduct, readExcel } from "../src/excel.js";
import { initialState, newRound, productAvailable, snapshot, price, addSale, stockRemaining, collections, report, validate, monthProductsImported } from "../src/domain.js";
import { upgrade, setSnackOrderQuantities } from "../src/commerce.js";

test("表示された整数税込価格を使い、不明な小数は確定しない", () => {
  assert.equal(displayedPrice({v:394.20000000000005,w:"394 "}),394);
  assert.equal(displayedPrice({v:475.20000000000005,w:"475 "}),475);
  assert.equal(displayedPrice({v:394.2,w:"394.2"}),null);
  assert.equal(price({gross:394}),390);
  assert.equal(price({gross:475}),470);
});
test("左右ブロック・途中の税込列変更・結合したおすすめ区画", () => {
  const rows = [["わっぱん注文書 2026年9月お届け"], ["", "商品名", "本体", "税込", "", "", "商品名", "本体", "税込"], ["", "定番A", 340, 367, "", "今月のおすすめパン", "限定A", 170, 184], ["", "商品名", "", "本体", "税込"], ["", "定番B", "", 365, 394, "", "限定B", 180, 194]];
  const a = analyzeSheet({rows, merges:[{s:{r:2,c:5},e:{r:4,c:5}}]});
  assert.deepEqual(a.products.map(p=>[p.name,p.gross,p.lifecycle]), [["定番A",367,"staple"],["定番B",394,"staple"],["限定A",184,"once"],["限定B",194,"once"]]);
});
test("商品ライフサイクルと価格履歴、例外定番", () => {
  const s=initialState();
  for (const p of s.products) p.gross=394;
  const once={...s.products[0],id:"once",name:"今月商品",lifecycle:"once",roundId:"sep"};
  const seasonal={...once,id:"seasonal",name:"季節商品",lifecycle:"seasonal",start:"2026-09-01",end:"2026-09-30"};
  s.products.push(once,seasonal);
  assert.equal(productAvailable(once,"2026-09-11","sep"),true);
  assert.equal(productAvailable(once,"2026-10-01","oct"),false);
  assert.equal(productAvailable(seasonal,"2026-09-11"),true);
  assert.equal(productAvailable(seasonal,"2026-10-01"),false);
  const old=snapshot(once); once.gross=999; once.active=false;
  assert.equal(old.price,280);
  const next=newRound(s,"2026-10-01");
  for (const id of ["milk","brown","donut","galette"]) assert.ok(next.products.some(p=>p.id===id));
  assert.ok(!next.products.some(p=>["once","seasonal"].includes(p.id)));
  for(const name of ["ミルクスティック","ミルクスティックパン","ツイストドーナツ","黒糖ブレッド","くるみパン 1個入り"]) assert.equal(permanentProduct(name),true);
});
test("常設の1個入りくるみパンと販売価格未確認のおやつ商品を区別して保持する", () => {
  const s=initialState();
  const one={...s.products.find(p=>p.id==='walnut'),id:'walnut-one',name:'くるみパン 1個入り',manual:170,mode:'manual',lifecycle:'permanent'};
  const two={...one,id:'walnut-two',name:'くるみパン 2個入り',gross:346,mode:'auto',manual:null,cost:null};
  s.products.push(one,two);
  const donut=s.products.find(p=>p.id==='donut');
  donut.cost=156;donut.lifecycle='permanent';
  const round=newRound(s,'2026-10-16');s.rounds.push(round);
  assert.equal(round.products.find(p=>p.id==='donut').price,null);
  assert.deepEqual(round.products.filter(p=>p.name.startsWith('くるみパン')).map(p=>p.id),['walnut-one','walnut-two']);
  setSnackOrderQuantities(s,round.id,{'walnut-one':2,donut:3});
  upgrade(s);validate(s);
  assert.equal(s.events.find(e=>e.roundId===round.id).lines.find(l=>l.productId==='donut').cost,156);
  round.orders.hori={name:'ホリ',quantities:{donut:1}};
  assert.equal(validate(s),s);
});
test("一度取り込んだ月内商品を同じ月の複数納品日で再利用する", () => {
  const s=initialState();
  const monthly={...s.products[0],id:"oct-only",name:"10月限定パン",gross:320,manual:null,mode:"auto",lifecycle:"once",roundId:"first",importMonth:"2026-10"};
  s.products.push(monthly);s.productImports.push("2026-10");
  assert.equal(monthProductsImported(s,"2026-10-16"),true);
  assert.equal(productAvailable(monthly,"2026-10-16","first"),true);
  assert.equal(productAvailable(monthly,"2026-10-30","second"),true);
  assert.equal(productAvailable(monthly,"2026-11-01","third"),false);
  const first=newRound(s,"2026-10-16"),second=newRound(s,"2026-10-30");
  assert.equal(first.productImportPending,false);assert.equal(second.productImportPending,false);
  assert.ok(first.products.some(product=>product.id===monthly.id));
  assert.ok(second.products.some(product=>product.id===monthly.id));
});
test("月管理導入前の注文回がある月は既存の商品情報を再利用する", () => {
  const s=initialState();for(const product of s.products)product.gross=390;
  const legacyRound=newRound(s,"2026-09-11");delete legacyRound.productImportPending;s.rounds.push(legacyRound);
  assert.equal(monthProductsImported(s,"2026-09-30"),true);
  assert.equal(newRound(s,"2026-09-30").productImportPending,false);
});
test("既存データへ月管理を追加しても配列件数とレコードを保持する", () => {
  const legacy=initialState();delete legacy.productImports;
  const before=Object.fromEntries(["buyers","products","rounds","stocks","sales","events","markets"].map(key=>[key,legacy[key].length]));
  upgrade(legacy);validate(legacy);
  assert.deepEqual(Object.fromEntries(Object.keys(before).map(key=>[key,legacy[key].length])),before);
  assert.deepEqual(legacy.productImports,[]);
});
test("未確認の販売先・原価を0円や入金済みにせず、残数だけ減らす", () => {
  const s=initialState(), st={id:"stock",name:"確認資料商品",qty:2,price:390,cost:null,date:"2026-09-11",test:true};
  s.stocks.push(st);
  addSale(s,st,{qty:2,date:st.date,pending:true,paid:false});
  validate(s);
  assert.equal(stockRemaining(s,st),0);
  assert.equal(collections(s,st.date,st.date,null,true).length,0);
  assert.equal(report(s,"2026-04-01","2027-03-31",2026).rows.length,0);
  st.test=false;
  const result=report(s,"2026-04-01","2027-03-31",2026);
  assert.equal(result.revenue,780);assert.equal(result.unknownCost,true);assert.equal(result.pending,1);
});
test("添付された2つの実Excelで再テスト（環境指定時）", {skip:!process.env.WAPPAN_EXCEL_DIR}, async()=>{
  const dir=process.env.WAPPAN_EXCEL_DIR;
  const files=fs.readdirSync(dir).filter(f=>f.endsWith("(3).xlsx"));
  assert.equal(files.length,2);
  for(const file of files){
    const bytes=fs.readFileSync(dir+"/"+file);
    const [sheet]=await readExcel({size:bytes.length,arrayBuffer:async()=>bytes});
    const a=analyzeSheet(sheet);
    assert.equal(a.warnings.length,0);
    if(a.format==="sweets"){
      assert.equal(a.products.length,14);
      assert.ok(a.products.every(p=>p.lifecycle==="staple"&&p.category==="焼き菓子"));
      assert.equal(a.products.find(p=>p.name==="ガレット").gross,475);
      assert.equal(a.products.filter(p=>p.gross===394).length,13);
    }else{
      assert.equal(a.format,"bread");assert.equal(a.products.length,47);
      assert.equal(a.products.filter(p=>p.lifecycle==="once").length,12);
      assert.equal(a.products.find(p=>p.name.startsWith("湯種食パン")).gross,367);
      assert.equal(a.products.find(p=>p.name.startsWith("くるみパン")).gross,346);
    }
  }
});
