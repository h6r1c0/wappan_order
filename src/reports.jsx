import React, { useState } from "react";
import { uid, today, fiscalYear, report, collections, yen } from "./domain";
import {
  useApp,
  Button,
  Field,
  Money,
  Check,
  Modal,
  Summary,
  CollectionList,
  Tag,
  Empty,
  copyText,
} from "./ui";
export function Reports() {
  const { state, save, notify } = useApp();
  const [year, setYear] = useState(fiscalYear(today())),
    [custom, setCustom] = useState(false),
    [from, setFrom] = useState(`${year}-04-01`),
    [to, setTo] = useState(`${year + 1}-03-31`),
    [tab, setTab] = useState("利益"),
    [editor, setEditor] = useState(null),
    [goal, setGoal] = useState(false);
  const start = custom ? from : `${year}-04-01`,
    end = custom ? to : `${year + 1}-03-31`,
    data = report(state, start, end, year),
    target = state.goals[year] ?? null,
    annual = report(state, `${year}-04-01`, `${year + 1}-03-31`, year);
  const rows = collections(state, start, end);
  const years = [
    ...new Set([
      2025,
      2026,
      fiscalYear(today()),
      ...state.rounds.map((r) => fiscalYear(r.date)),
      ...state.history.map((h) => fiscalYear(h.date)),
      ...state.sales.map((s) => fiscalYear(s.date)),
      ...state.adjustments.map((a) => a.year),
    ]),
  ].sort((a, b) => b - a);
  return (
    <>
      <h1>集計・個人請求</h1>
      <Field label="対象年度（4月〜翌3月）">
        <select
          value={year}
          onChange={(e) => {
            const y = Number(e.target.value);
            setYear(y);
            setFrom(`${y}-04-01`);
            setTo(`${y + 1}-03-31`);
          }}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}年度
            </option>
          ))}
        </select>
      </Field>
      <section className="hero">
        <span>
          {year}年度利益{annual.pending || annual.provisional ? "（暫定）" : ""}
        </span>
        <strong>{yen(annual.profit)}</strong>
        {target == null ? (
          <p>この年度の目標は未設定です。</p>
        ) : (
          <>
            <p>
              目標 {yen(target)} ／{" "}
              {annual.profit >= target
                ? `目標達成 ＋${yen(annual.profit - target)}`
                : `目標まで あと${yen(target - annual.profit)}`}
            </p>
            <progress
              value={Math.max(0, annual.profit)}
              max={Math.max(1, target)}
              aria-label="年度利益の目標達成度"
            />
          </>
        )}
        <Button secondary onClick={() => setGoal(true)}>
          目標額を変更
        </Button>
      </section>
      <Check label="期間を指定して確認" checked={custom} onChange={setCustom} />
      {custom && (
        <div className="grid2">
          <Field
            label="開始日"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Field
            label="終了日"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      )}
      {start > end && (
        <p className="notice">開始日と終了日を確認してください。</p>
      )}
      <div className="tabs">
        {["利益", "個人請求", "過去実績・調整"].map((t) => (
          <Button key={t} secondary={t !== tab} onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </div>
      {tab === "利益" && (
        <>
          <p>
            {start} 〜 {end}（テスト入力を除く）
          </p>
          <div className="grid2">
            <Summary
              label={`販売額${data.unknownRevenue ? "（判明分）" : ""}`}
              value={yen(data.revenue)}
            />
            <Summary
              label={`仕入額${data.unknownCost ? "（判明分）" : ""}`}
              value={yen(data.cost)}
            />
            <Summary
              label="販売利益＋過去の利益"
              value={yen(data.salesProfit)}
            />
            <Summary label="利益調整" value={yen(data.adjustment)} />
            <Summary label="出店経費（利益反映分）" value={yen(data.expenses||0)} />
          </div>
          <Summary
            label={`最終利益${data.pending || data.provisional ? "（暫定）" : ""}`}
            value={yen(data.profit)}
          />
          {(data.unknownRevenue || data.unknownCost) && (
            <p className="notice">
              不明の販売額・仕入額があります。表示額は判明分のみで、全体の合計ではありません。利益のみの過去実績は利益へ加算しています。
            </p>
          )}
          {data.pending > 0 && (
            <p className="notice">
              仕入額が未確定の通常注文が{data.pending}
              件あります。その利益はまだ含まれません。
            </p>
          )}
          {data.provisional && (
            <p className="notice">精算前の注文、または場所代不明の外部販売を含むため、利益は暫定です。</p>
          )}
          {data.undated > 0 && (
            <p className="notice">
              日付未設定の利益調整 {data.undated}
              件は期間を特定できないため、年度全体の表示にのみ含まれます。
            </p>
          )}
          <h2>数字の内訳</h2>
          {data.rows.map((r) => (
            <details className="card" key={r.id}>
              <summary>
                <span>
                  <Tag>{r.type}</Tag> {r.name}
                  <small>{r.date}</small>
                </span>
                <strong>{yen(r.profit)}</strong>
              </summary>
              <p>販売額：{r.revenue == null ? "不明" : yen(r.revenue)}</p>
              <p>
                仕入額：
                {r.cost == null
                  ? r.type === "過去実績"
                    ? "不明"
                    : "未確定"
                  : yen(r.cost)}
              </p>
              {r.provisional && <p>精算前の暫定値</p>}
            </details>
          ))}
          {data.adjustments.map((a) => (
            <div className="card line" key={a.id}>
              <span>
                利益調整：{a.name}
                <small>
                  {a.date || "年度指定"} ／ {a.note}
                </small>
              </span>
              <b>{yen(a.amount)}</b>
            </div>
          ))}
          {!data.rows.length && !data.adjustments.length && (
            <Empty>対象期間の実績はまだありません。</Empty>
          )}
          <Button
            secondary
            onClick={async () => {
              try {
                await copyText(
                  `${start}〜${end}\n販売額${data.unknownRevenue ? "（判明分のみ）" : ""} ${yen(data.revenue)}\n仕入額${data.unknownCost ? "（判明分のみ）" : ""} ${yen(data.cost)}\n販売利益・過去利益 ${yen(data.salesProfit)}\n利益調整 ${yen(data.adjustment)}\n最終利益${data.pending || data.provisional ? "（暫定）" : ""} ${yen(data.profit)}`,
                );
                notify("集計結果をコピーしました");
              } catch (e) {
                notify(e.message);
              }
            }}
          >
            報告用にコピー
          </Button>
        </>
      )}
      {tab === "個人請求" && (
        <>
          <p className="notice">
            指定期間の通常注文＋園内販売です。即時入金は含みません。注文回ごとの集金袋には、各注文回の「集金額」を使ってください。
          </p>
          <CollectionList rows={rows} />
          <Summary
            label="個人請求の合計"
            value={yen(rows.reduce((a, r) => a + r.total, 0))}
          />
        </>
      )}
      {tab === "過去実績・調整" && (
        <>
          <div className="actions">
            <Button onClick={() => setEditor({ type: "history" })}>
              ＋ 過去実績
            </Button>
            <Button secondary onClick={() => setEditor({ type: "adjustment" })}>
              ＋ 利益調整
            </Button>
          </div>
          <h2>{year}年度の過去実績</h2>
          {state.history
            .filter((h) => fiscalYear(h.date) === year)
            .map((h) => (
              <button
                className="card clickable line"
                key={h.id}
                onClick={() => setEditor({ type: "history", value: h })}
              >
                <span>
                  {h.date}
                  <small>
                    {h.note} {h.test ? "／ テスト" : ""}
                  </small>
                </span>
                <b>
                  {yen(h.revenue == null ? h.profit : h.revenue - h.cost)} ›
                </b>
              </button>
            ))}
          <h2>{year}年度の利益調整</h2>
          {state.adjustments
            .filter((a) => a.year === year)
            .map((a) => (
              <button
                className="card clickable line"
                key={a.id}
                onClick={() => setEditor({ type: "adjustment", value: a })}
              >
                <span>
                  {a.name}
                  <small>
                    {a.date || "年度のみ"} {a.note}
                  </small>
                </span>
                <b>{yen(a.amount)} ›</b>
              </button>
            ))}
        </>
      )}
      {editor?.type === "history" && (
        <HistoryEditor entry={editor.value} onClose={() => setEditor(null)} />
      )}{" "}
      {editor?.type === "adjustment" && (
        <AdjustmentEditor
          entry={editor.value}
          year={year}
          onClose={() => setEditor(null)}
        />
      )}{" "}
      {goal && (
        <GoalEditor year={year} value={target} onClose={() => setGoal(false)} />
      )}
    </>
  );
}
function HistoryEditor({ entry, onClose }) {
  const { save } = useApp();
  const [h, set] = useState(
      entry
        ? structuredClone(entry)
        : {
            id: uid(),
            date: today(),
            revenue: null,
            cost: null,
            profit: null,
            note: "",
            test: false,
          },
    ),
    [only, setOnly] = useState(entry ? entry.revenue == null : false);
  return (
    <Modal title="過去実績の簡易登録" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await save((s) => {
              const data = {
                ...h,
                revenue: only ? null : h.revenue,
                cost: only ? null : h.cost,
                profit: only ? h.profit : h.revenue - h.cost,
              };
              if (!only && (h.revenue == null || h.cost == null))
                throw Error(
                  "販売額と仕入額を入力してください。利益だけ分かる場合は「利益のみ」に切り替えてください",
                );
              const i = s.history.findIndex((x) => x.id === h.id);
              if (i < 0) s.history.push(data);
              else s.history[i] = data;
            }, "過去実績を保存")
          )
            onClose();
        }}
      >
        <Field
          label="実績日（月単位なら月末等を指定しメモへ記載）"
          type="date"
          required
          value={h.date}
          onChange={(e) => set({ ...h, date: e.target.value })}
        />
        <Check label="利益のみ分かっている" checked={only} onChange={setOnly} />
        {only ? (
          <>
            <Money
              required
              signed
              label="利益"
              value={h.profit}
              onChange={(v) => set({ ...h, profit: v })}
            />
            <p className="muted">販売額・仕入額は「不明」として保存します。</p>
          </>
        ) : (
          <>
            <Money
              required
              label="販売額"
              value={h.revenue}
              onChange={(v) => set({ ...h, revenue: v })}
            />
            <Money
              required
              label="仕入額"
              value={h.cost}
              onChange={(v) => set({ ...h, cost: v })}
            />
            <p>
              利益{" "}
              {h.revenue == null || h.cost == null
                ? "未確定"
                : yen(h.revenue - h.cost)}
            </p>
          </>
        )}
        <Field label="対象月・メモ">
          <textarea
            value={h.note}
            onChange={(e) => set({ ...h, note: e.target.value })}
          />
        </Field>
        <Check
          label="テスト・年度集計から除外"
          checked={h.test}
          onChange={(v) => set({ ...h, test: v })}
        />
        <p className="notice">
          同じ実績を通常注文にも登録しないでください。9月11日分を比較する場合は、テスト区分にします。
        </p>
        <Button type="submit">過去実績を保存</Button>
      </form>
      {entry && (
        <DeleteRecord collection="history" id={h.id} onClose={onClose} />
      )}
    </Modal>
  );
}
function AdjustmentEditor({ entry, year, onClose }) {
  const { save } = useApp();
  const [a, set] = useState(
    entry
      ? structuredClone(entry)
      : { id: uid(), year, date: "", amount: null, name: "計上漏れ", note: "" },
  );
  return (
    <Modal title="利益調整" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await save((s) => {
              const i = s.adjustments.findIndex((x) => x.id === a.id);
              if (i < 0) s.adjustments.push(a);
              else s.adjustments[i] = a;
            }, "利益調整を保存")
          )
            onClose();
        }}
      >
        <Field
          label="対象年度"
          type="number"
          min="2000"
          required
          value={a.year}
          onChange={(e) => set({ ...a, year: Number(e.target.value) })}
        />
        <Field
          label="日付（任意・対象年度内）"
          type="date"
          value={a.date}
          onChange={(e) => set({ ...a, date: e.target.value })}
        />
        <Field
          label="名称・種別"
          value={a.name}
          required
          onChange={(e) => set({ ...a, name: e.target.value })}
        />
        <Money
          required
          signed
          label="調整額（減額はマイナスを付ける）"
          value={a.amount}
          onChange={(v) => set({ ...a, amount: v })}
        />
        <Field label="メモ">
          <textarea
            value={a.note}
            onChange={(e) => set({ ...a, note: e.target.value })}
          />
        </Field>
        <Button type="submit">利益調整を保存</Button>
      </form>
      {entry && (
        <DeleteRecord collection="adjustments" id={a.id} onClose={onClose} />
      )}
    </Modal>
  );
}
function DeleteRecord({ collection, id, onClose }) {
  const { save } = useApp();
  return (
    <Button
      danger
      secondary
      onClick={async () => {
        if (
          confirm("この記録を削除して集計から除きますか？") &&
          (await save((s) => {
            s[collection] = s[collection].filter((x) => x.id !== id);
          }, "実績・調整を削除"))
        )
          onClose();
      }}
    >
      この記録を削除
    </Button>
  );
}
function GoalEditor({ year, value, onClose }) {
  const { save } = useApp();
  const [v, set] = useState(value);
  return (
    <Modal title={`${year}年度の利益目標`} onClose={onClose}>
      <Money label="目標額" value={v} onChange={set} />
      <Button
        onClick={async () => {
          if (
            await save((s) => {
              s.goals[year] = v;
            }, "年度目標を保存")
          )
            onClose();
        }}
      >
        目標を保存
      </Button>
    </Modal>
  );
}
