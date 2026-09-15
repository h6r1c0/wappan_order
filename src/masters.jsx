import React, { useState } from "react";
import { uid, price, yen, normalize, snapshot, newRound, today, productAvailable } from "./domain";
import {
  useApp,
  Button,
  Field,
  Money,
  Check,
  Modal,
  Qty,
  Cat,
  Tag,
  Empty,
} from "./ui";
import { readExcel, detectColumns, extractRows, analyzeSheet, permanentProduct } from "./excel";
const lifecycleLabels = { staple: "定番", once: "今回限り", seasonal: "期間商品", permanent: "常設定番" };
const importIdentity = name => normalize(name).replace(/^ミルクスティックパン$/, "ミルクスティック");
function Lifecycle({ value, onChange }) {
  return <Field label="商品区分"><select aria-label="商品区分" value={value || ""} onChange={e => onChange(e.target.value)}><option value="">区分を確認してください</option>{Object.entries(lifecycleLabels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></Field>;
}
export function ProductEditor({ product, onClose }) {
  const { state, save } = useApp();
  const [p, set] = useState(
    product
      ? structuredClone(product)
      : {
          id: uid(),
          name: "",
          gross: null,
          manual: null,
          cost: null,
          mode: "auto",
          category: "パン",
          active: true,
          start: "",
          end: "",
        },
  );
  const put = (k, v) => set({ ...p, [k]: v });
  return (
    <Modal title={product ? "商品を編集" : "商品を追加"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await save((s) => {
              const i = s.products.findIndex((x) => x.id === p.id);
              if (i < 0) s.products.push(p);
              else s.products[i] = p;
            }, "商品を保存")
          )
            onClose();
        }}
      >
        <Field
          label="商品名"
          value={p.name}
          required
          onChange={(e) => put("name", e.target.value)}
        />
        <Field label="カテゴリー">
          <select
            value={p.category}
            onChange={(e) => put("category", e.target.value)}
          >
            <option>パン</option>
            <option>焼き菓子</option>
          </select>
        </Field>
        <Money
          label="注文表の税込価格（未確認なら空欄）"
          value={p.gross}
          onChange={(v) => put("gross", v)}
        />
        <Field label="通常販売価格の決め方">
          <select value={p.mode} onChange={(e) => put("mode", e.target.value)}>
            <option value="auto">税込価格の10円未満を切り捨て</option>
            <option value="manual">個別に販売価格を指定</option>
          </select>
        </Field>
        {p.mode === "manual" && (
          <Money
            required
            label="指定販売価格"
            value={p.manual}
            onChange={(v) => put("manual", v)}
          />
        )}
        <p className="total">
          通常販売価格：{price(p) == null ? "未確認" : yen(price(p))}
        </p>
        <Money
          label="仕入単価（未確認なら空欄）"
          value={p.cost}
          onChange={(v) => put("cost", v)}
        />
        <Lifecycle value={permanentProduct(p.name) ? "permanent" : p.lifecycle || "staple"} onChange={v => put("lifecycle", v)} />
        {p.lifecycle === "once" && <Field label="利用する注文回"><select value={p.roundId || ""} onChange={e => put("roundId", e.target.value)}><option value="">選んでください</option>{state.rounds.map(r => <option key={r.id} value={r.id}>{r.date}{r.test ? "（テスト）" : ""}</option>)}</select></Field>}
        <details open={p.lifecycle === "seasonal"}>
          <summary>対象期間を設定</summary>
          <Field
            label="開始日"
            type="date"
            value={p.start}
            onChange={(e) => put("start", e.target.value)}
          />
          <Field
            label="終了日"
            type="date"
            value={p.end}
            onChange={(e) => put("end", e.target.value)}
          />
        </details>
        <Check
          label="注文候補に表示する"
          checked={p.active}
          onChange={(v) => put("active", v)}
        />
        <p className="muted">
          変更後も、作成済みの注文回の価格は変わりません。
        </p>
        <Button type="submit">商品を保存</Button>
      </form>
    </Modal>
  );
}
export function ExcelImport({ onClose }) {
  const { state, save, notify } = useApp();
  const [analysis, setAnalysis] = useState(null), [target, setTarget] = useState("");
  const [delivery, setDelivery] = useState(today()), [testRound, setTestRound] = useState(false);
  const [sheets, setSheets] = useState([]),
    [sheet, setSheet] = useState(0),
    [mapping, setMapping] = useState({ start: 0, pairs: [] }),
    [rows, setRows] = useState(null),
    [busy, setBusy] = useState(false);
  const selectSheet = (n, ss = sheets) => {
    setSheet(n);
    setMapping(detectColumns(ss[n].rows));
    setRows(null);
    const result = analyzeSheet(ss[n]);
    setAnalysis(result);
    if (result.format !== "unknown") prepare(result.products);
    else setRows(null);
  };
  const prepare = (automatic) => {
    const data = Array.isArray(automatic) ? automatic : extractRows(sheets[sheet].rows, mapping.pairs, mapping.start);
    if (!data.length) {
      notify(
        "商品が見つかりません。商品名・税込価格の列と開始行を確認してください。",
      );
      return;
    }
    const seen = new Set();
    setRows(
      data.map((x) => {
        const p = state.products.find(
            (p) => importIdentity(p.name) === importIdentity(x.name),
          ),
          duplicate = seen.has(normalize(x.name));
        seen.add(normalize(x.name));
        return {
          ...x,
          id: uid(),
          include: !duplicate,
          duplicate,
          category:
            x.category || p?.category ||
            (/クッキー|ガレット|スコーン/.test(x.name) ? "焼き菓子" : "パン"),
          mode: p?.mode || "auto",
          manual: p?.manual ?? null,
          matchId: p?.id || "",
          lifecycle: permanentProduct(x.name) ? "permanent" : x.lifecycle || "",
        };
      }),
    );
  };
  return (
    <Modal title="Excelから商品を取り込む" onClose={onClose}>
      <p>① Excelを選ぶ → ② 読取結果を確認 → ③ 登録</p>
      <Field label="Excel注文表（.xlsx / .xls）">
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={busy}
          onChange={async (e) => {
            if (!e.target.files[0]) return;
            setBusy(true);
            try {
              const ss = await readExcel(e.target.files[0]);
              setSheets(ss);
              selectSheet(0, ss);
            } catch (e) {
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </Field>
      {analysis && <p className="notice">{analysis.label}{analysis.format !== "unknown" ? "として読み取りました" : "です。詳細設定から読み取り範囲を指定してください"}。{analysis.warnings.map((w, i) => <span key={i}><br />{w}</span>)}</p>}
      {sheets.length > 0 && !rows && (
        <details open={analysis?.format === "unknown"}>
          <summary>詳細設定・シートの選択</summary>
          <Field label="シート">
            <select
              value={sheet}
              onChange={(e) => selectSheet(Number(e.target.value))}
            >
              {sheets.map((s, i) => (
                <option value={i} key={i}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="muted">
            税込価格の見出しがあれば自動で列を選びます。税抜価格を選ばないよう確認してください。
          </p>
          {mapping.pairs.map((pair, i) => (
            <div className="grid2" key={i}>
              {[
                ["nameCol", "商品名の列"],
                ["priceCol", "税込価格の列"],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <select
                    value={pair[key]}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        pairs: mapping.pairs.map((p, j) =>
                          j === i ? { ...p, [key]: Number(e.target.value) } : p,
                        ),
                      })
                    }
                  >
                    {Array.from(
                      {
                        length: Math.max(
                          ...sheets[sheet].rows.map((r) => r.length),
                          1,
                        ),
                      },
                      (_, c) => (
                        <option value={c} key={c}>
                          {columnName(c)}列
                        </option>
                      ),
                    )}
                  </select>
                </Field>
              ))}
            </div>
          ))}
          <Button
            secondary
            onClick={() =>
              setMapping({
                ...mapping,
                pairs: [...mapping.pairs, { nameCol: 0, priceCol: 1 }],
              })
            }
          >
            ＋ 商品名・税込価格の列を指定
          </Button>
          <Field
            label="読み取り開始行"
            type="number"
            min="1"
            value={mapping.start + 1}
            onChange={(e) =>
              setMapping({
                ...mapping,
                start: Math.max(0, Number(e.target.value) - 1),
              })
            }
          />
          <details>
            <summary>元のExcelの先頭30行を確認</summary>
            <div className="sheet-preview">
              {sheets[sheet].rows.slice(0, 30).map((r, i) => (
                <p key={i}>
                  {i + 1}行：
                  {r
                    .map((v, j) => (v !== "" ? `${columnName(j)}: ${v}` : ""))
                    .filter(Boolean)
                    .join(" ／ ")}
                </p>
              ))}
            </div>
          </details>
          <Button disabled={!mapping.pairs.length} onClick={prepare}>
            読み取って確認へ
          </Button>
        </details>
      )}
      {rows && (
        <>
          <p className="notice">
            {rows.length}
            商品を読み取りました。名前・価格・区分を確認してください。修正する商品はタップして開けます。
          </p>
          <p>{Object.entries(lifecycleLabels).map(([key, label]) => `${label} ${rows.filter(r => r.include && r.lifecycle === key).length}件`).join(" ／ ")}</p>
          <Field label="商品を使う注文回（今回限りの商品は選択必須）"><select value={target} onChange={e => setTarget(e.target.value)}><option value="">商品マスターのみ登録</option><option value="new">新しい納品日で注文回も作る</option>{state.rounds.map(r => <option key={r.id} value={r.id}>{r.date}{r.test ? "（テスト）" : ""}</option>)}</select></Field>
          {target === "new" && <><Field label="納品予定日" type="date" value={delivery} onChange={e => setDelivery(e.target.value)} /><Check label="テスト入力（年度実績へ含めない）" checked={testRound} onChange={setTestRound} /></>}
          {rows.map((r, i) => {
            const put = (k, v) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
            return (
              <details className="card import-product" key={r.id} open={!r.lifecycle || r.mode === "manual"}>
                <summary>{r.name}<br /><span>税込 {yen(r.gross)} → 販売 {yen(price(r))} ／ {lifecycleLabels[r.lifecycle] || "区分の確認が必要"}{!r.include ? "（登録しない）" : ""}</span></summary>
                <Check
                  label={`${r.row}行目${r.duplicate ? "・重複候補（初期は除外）" : ""}`}
                  checked={r.include}
                  onChange={(v) => put("include", v)}
                />
                <Field
                  label="商品名"
                  value={r.name}
                  onChange={(e) => put("name", e.target.value)}
                />
                <Money
                  label="税込価格"
                  value={r.gross}
                  onChange={(v) => put("gross", v)}
                />
                <Lifecycle value={r.lifecycle} onChange={v => put("lifecycle", v)} />
                {r.lifecycle === "seasonal" && <div className="grid2"><Field label="開始日" type="date" value={r.start || ""} onChange={e => put("start", e.target.value)} /><Field label="終了日" type="date" value={r.end || ""} onChange={e => put("end", e.target.value)} /></div>}
                <Field label="登録先">
                  <select
                    value={r.matchId}
                    onChange={(e) => {
                      const p = state.products.find(
                        (p) => p.id === e.target.value,
                      );
                      setRows(
                        rows.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                matchId: e.target.value,
                                mode: p?.mode || "auto",
                                manual: p?.manual ?? null,
                              }
                            : x,
                        ),
                      );
                    }}
                  >
                    <option value="">同名商品を更新／なければ新規追加</option>
                    {state.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}を更新
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="カテゴリー">
                  <select
                    value={r.category}
                    onChange={(e) => put("category", e.target.value)}
                  >
                    <option>パン</option>
                    <option>焼き菓子</option>
                  </select>
                </Field>
                <Check
                  label="販売価格を個別指定する"
                  checked={r.mode === "manual"}
                  onChange={(v) => put("mode", v ? "manual" : "auto")}
                />
                {r.mode === "manual" && (
                  <Money
                    label="指定販売価格"
                    value={r.manual}
                    onChange={(v) => put("manual", v)}
                  />
                )}
                <strong>販売価格 {yen(price(r))}</strong>
              </details>
            );
          })}
          <div className="sticky-action">
            <Button secondary onClick={() => setRows(null)}>
              列の確認に戻る
            </Button>
            <Button
              disabled={!rows.some((r) => r.include)}
              onClick={async () => {
                if (
                  await save((s) => {
                    const targetId = target === "new" ? uid() : target;
                    const names = new Set(),
                      ids = new Set();
                    for (const r of rows.filter((r) => r.include)) {
                      if (!r.lifecycle) throw Error(`${r.name}の商品区分を確認してください`);
                      if (r.lifecycle === "once" && !target) throw Error("今回限りの商品を使う注文回を選んでください。先に納品日から注文回を作成できます。");
                      if (r.lifecycle === "seasonal" && (!r.start || !r.end)) throw Error("期間商品の開始日と終了日を入力してください");
                      const name = normalize(r.name);
                      if (names.has(name))
                        throw Error(
                          "同じ名前が複数あります。登録する行を1つにしてください",
                        );
                      names.add(name);
                      const existing =
                        s.products.find((p) => p.id === r.matchId) ||
                        s.products.find((p) => importIdentity(p.name) === importIdentity(r.name));
                      if (existing && ids.has(existing.id))
                        throw Error("同じ商品を更新する行が複数あります");
                      if (existing) ids.add(existing.id);
                      const p = {
                        ...(existing || {
                          id: uid(),
                          active: true,
                          cost: null,
                          start: "",
                          end: "",
                        }),
                        name: r.name.trim(),
                        gross: r.gross,
                        category: r.category,
                        mode: r.mode,
                        manual: r.manual,
                        lifecycle: permanentProduct(r.name) ? "permanent" : r.lifecycle,
                        roundId: r.lifecycle === "once" ? targetId : "",
                        start: r.lifecycle === "seasonal" ? r.start : "",
                        end: r.lifecycle === "seasonal" ? r.end : "",
                      };
                      if (existing)
                        s.products[s.products.indexOf(existing)] = p;
                      else s.products.push(p);
                      const round = s.rounds.find(x => x.id === targetId);
                      if (round && !round.products.some(x => x.id === p.id)) round.products.push(snapshot(p));
                    }
                    if (target === "new") {
                      const round = newRound(s, delivery, testRound);
                      round.id = targetId;
                      round.products = s.products.filter(p => productAvailable(p, delivery, targetId) && price(p) != null).map(snapshot);
                      s.rounds.push(round);
                    }
                  }, "Excel商品取り込み")
                )
                  onClose();
              }}
            >
              確認した商品を登録
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
function columnName(n) {
  let s = "";
  for (n++; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export function Masters() {
  const { state, save } = useApp();
  const [tab, setTab] = useState("商品"),
    [editor, setEditor] = useState(null),
    [importing, setImporting] = useState(false),
    [query, setQuery] = useState("");
  return (
    <>
      <h1>商品・購入者</h1>
      <div className="tabs">
        {["商品", "購入者"].map((t) => (
          <Button secondary={tab !== t} key={t} onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </div>
      {tab === "商品" ? (
        <>
          <div className="actions">
            <Button onClick={() => setEditor({ type: "product" })}>
              ＋ 商品を追加
            </Button>
            <Button secondary onClick={() => setImporting(true)}>
              Excelから取り込む
            </Button>
          </div>
          <Field
            label="商品を探す"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {state.products
            .filter((p) => normalize(p.name).includes(normalize(query)))
            .map((p) => (
              <button
                className="card product-row clickable"
                key={p.id}
                onClick={() => setEditor({ type: "product", value: p })}
              >
                <Cat category={p.category} />
                <span className="grow">
                  {p.name}
                  <small>
                    {p.active ? p.category : "非表示"}
                    {p.cost == null ? "" : ` ／ 仕入 ${yen(p.cost)}`}
                  </small>
                </span>
                <strong>
                  {price(p) == null ? "価格未確認" : yen(price(p))}
                </strong>
              </button>
            ))}
        </>
      ) : (
        <>
          <Button onClick={() => setEditor({ type: "buyer" })}>
            ＋ 購入者を追加
          </Button>
          {state.buyers.map((b) => (
            <button
              className="card clickable line"
              key={b.id}
              onClick={() => setEditor({ type: "buyer", value: b })}
            >
              <span>
                {b.name}
                <small>
                  {b.active ? "表示中" : "非表示"} ／ 固定注文 {b.fixed.length}
                  品
                </small>
              </span>
              <span>編集 ›</span>
            </button>
          ))}
        </>
      )}
      {editor?.type === "product" && (
        <ProductEditor product={editor.value} onClose={() => setEditor(null)} />
      )}{" "}
      {editor?.type === "buyer" && (
        <BuyerEditor buyer={editor.value} onClose={() => setEditor(null)} />
      )}{" "}
      {importing && <ExcelImport onClose={() => setImporting(false)} />}
    </>
  );
}
function BuyerEditor({ buyer, onClose }) {
  const { state, save } = useApp();
  const [b, set] = useState(
    buyer
      ? structuredClone(buyer)
      : { id: uid(), name: "", active: true, fixed: [] },
  );
  return (
    <Modal title="購入者・固定注文" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await save((s) => {
              const i = s.buyers.findIndex((x) => x.id === b.id);
              if (i < 0) s.buyers.push(b);
              else s.buyers[i] = b;
            }, "購入者・固定注文を保存")
          )
            onClose();
        }}
      >
        <Field
          label="購入者名"
          value={b.name}
          required
          onChange={(e) => set({ ...b, name: e.target.value })}
        />
        <Check
          label="購入者の選択一覧に表示する"
          checked={b.active}
          onChange={(v) => set({ ...b, active: v })}
        />
        {buyer?.testOnly && <Check label="氏名を確認し、通常の注文でも選択できるようにする" checked={!b.testOnly} onChange={v => set({...b,testOnly:!v,active:v})} />}
        <h3>毎回の固定注文</h3>
        <p className="muted">
          その人の未入力の注文を開くと反映します。入力済みの回は変わりません。
        </p>
        {state.products
          .filter((p) => p.active || b.fixed.some((f) => f.productId === p.id))
          .map((p) => (
            <div className="product-row" key={p.id}>
              <span className="grow">{p.name}</span>
              <Qty
                label={`${p.name} 固定数量`}
                value={b.fixed.find((f) => f.productId === p.id)?.qty || 0}
                onChange={(qty) =>
                  set({
                    ...b,
                    fixed: [
                      ...b.fixed.filter((f) => f.productId !== p.id),
                      ...(qty ? [{ productId: p.id, qty }] : []),
                    ],
                  })
                }
              />
            </div>
          ))}
        <Button type="submit">購入者・固定注文を保存</Button>
      </form>
      {buyer && (
        <Button
          danger
          secondary
          onClick={async () => {
            if (
              !confirm(
                `${b.name}を削除しますか？注文・販売履歴がある場合は削除できません。`,
              )
            )
              return;
            if (
              await save((s) => {
                if (
                  s.rounds.some((r) => r.orders[b.id]) ||
                  s.sales.some((x) => x.buyerId === b.id)
                )
                  throw Error(
                    "履歴があるため削除できません。「表示する」をオフにして保存してください。",
                  );
                s.buyers = s.buyers.filter((x) => x.id !== b.id);
              }, "未使用の購入者を削除")
            )
              onClose();
          }}
        >
          購入者を削除
        </Button>
      )}
    </Modal>
  );
}
