import React, { useState } from "react";
import {
  uid,
  today,
  price,
  yen,
  eventCost,
  eventClaim,
  transferredQty,
  transfer,
  setEventTest,
  undoTransfer,
  soldQty,
} from "./domain";
import {
  useApp,
  Button,
  Field,
  Money,
  Qty,
  Check,
  Modal,
  Tag,
  Empty,
  Summary,
} from "./ui";
export function Events() {
  const { state, save } = useApp();
  const [edit, setEdit] = useState(null),
    [move, setMove] = useState(null);
  return (
    <>
      <div className="section-head">
        <h1>行事の注文</h1>
        <Button onClick={() => setEdit({})}>＋ 行事を追加</Button>
      </div>
      <p className="lead">
        使った分だけ財政へ請求。余りは園内販売へ振り替えます。
      </p>
      {[...state.events]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((e) => (
          <section className="card" key={e.id}>
            <div className="section-head">
              <h2>{e.name}</h2>
              <Button secondary onClick={() => setEdit(e)}>
                注文・使用数を編集
              </Button>
            </div>
            <p>
              {e.date} {e.test && <Tag>テスト</Tag>}
            </p>
            <Summary
              label="財政への請求額（行事使用分のみ）"
              value={yen(eventClaim(e))}
            />
            {e.lines.map((l) => {
              const moved = transferredQty(state, l.id),
                remaining = l.qty - l.used - moved;
              return (
                <div className="event-line" key={l.id}>
                  <h3>{l.name}</h3>
                  <div className="count-grid">
                    <span>
                      注文<strong>{l.qty}</strong>
                    </span>
                    <span>
                      行事使用<strong>{l.used}</strong>
                    </span>
                    <span>
                      振替済<strong>{moved}</strong>
                    </span>
                    <span>
                      未処理余剰<strong>{remaining}</strong>
                    </span>
                  </div>
                  <p>
                    仕入単価 {l.cost == null ? "未確認" : yen(l.cost)} ／
                    財政請求{" "}
                    {l.cost == null && l.used
                      ? "未確定"
                      : yen(l.used * (l.cost || 0))}
                  </p>
                  <Button
                    disabled={remaining < 1 || l.cost == null}
                    secondary
                    onClick={() => setMove({ event: e, line: l })}
                  >
                    余剰を園内販売へ振替
                  </Button>
                  {state.stocks
                    .filter((st) => st.eventLineId === l.id && st.qty > 0)
                    .map((st) => (
                      <div key={st.id} className="line">
                        <small>
                          {st.date} 振替 {st.qty}個・販売済み{" "}
                          {soldQty(state, st.id)}個
                        </small>
                        <Button
                          secondary
                          disabled={soldQty(state, st.id) > 0}
                          onClick={async () => {
                            if (
                              confirm(
                                "この振替を戻して、行事の未処理余剰に戻しますか？",
                              )
                            )
                              await save(
                                (s) => undoTransfer(s, st.id),
                                "行事振替を取消",
                              );
                          }}
                        >
                          振替を戻す
                        </Button>
                      </div>
                    ))}
                </div>
              );
            })}
            {e.note && <p>{e.note}</p>}
            <details>
              <summary>仕入の内訳</summary>
              <p>行事注文全体 {yen(eventCost(e))}</p>
              <p>
                財政請求 {yen(eventClaim(e))} ／ 販売側へ振替{" "}
                {yen(
                  state.stocks
                    .filter((st) => st.eventId === e.id)
                    .reduce((a, st) => a + st.qty * st.cost, 0),
                )}
              </p>
              <p className="muted">
                未処理余剰は財政請求・販売利益へ加えません。同じ納品書の通常注文がある場合は、その回の「納品・精算」でこの行事を選んでください。
              </p>
            </details>
          </section>
        ))}
      {!state.events.length && (
        <Empty>
          行事名と注文数を登録し、使用後に実際の使用数を入力します。
        </Empty>
      )}
      {edit && (
        <EventEditor
          event={edit.id ? edit : null}
          onClose={() => setEdit(null)}
        />
      )}{" "}
      {move && (
        <TransferEditor
          event={move.event}
          line={move.line}
          onClose={() => setMove(null)}
        />
      )}
    </>
  );
}
function EventEditor({ event, onClose }) {
  const { state, save } = useApp();
  const [e, set] = useState(
    event
      ? structuredClone(event)
      : {
          id: uid(),
          name: "",
          date: today(),
          test: false,
          note: "",
          lines: [],
        },
  );
  const [choice, setChoice] = useState("walnut");
  const add = () => {
    const p = state.products.find((p) => p.id === choice);
    set({
      ...e,
      lines: [
        ...e.lines,
        {
          id: uid(),
          productId: p?.id || null,
          name: p?.name || "",
          category: p?.category || "パン",
          cost: p?.cost ?? null,
          qty: 1,
          used: 0,
        },
      ],
    });
  };
  const put = (i, k, v) =>
    set({
      ...e,
      lines: e.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)),
    });
  return (
    <Modal
      title={event ? "行事の注文・使用数" : "行事を追加"}
      onClose={onClose}
    >
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (
            await save((s) => {
              const i = s.events.findIndex((x) => x.id === e.id);
              if (i < 0) s.events.push(e);
              else s.events[i] = e;
              setEventTest(s, e, e.test);
            }, "行事注文を保存")
          )
            onClose();
        }}
      >
        <Field
          required
          label="行事名"
          value={e.name}
          onChange={(ev) => set({ ...e, name: ev.target.value })}
        />
        <Field
          required
          label="行事日"
          type="date"
          value={e.date}
          onChange={(ev) => set({ ...e, date: ev.target.value })}
        />
        {e.lines.map((l, i) => {
          const moved = transferredQty(state, l.id);
          return (
            <div className="card" key={l.id}>
              <Field
                required
                label="商品名"
                value={l.name}
                onChange={(ev) => put(i, "name", ev.target.value)}
              />
              <div className="grid2">
                <Field label="注文数">
                  <Qty value={l.qty} onChange={(v) => put(i, "qty", v)} />
                </Field>
                <Field label="実際の行事使用数">
                  <Qty value={l.used} onChange={(v) => put(i, "used", v)} />
                </Field>
              </div>
              {moved ? (
                <p>
                  仕入単価 {yen(l.cost)}（{moved}個を販売側へ振替済み）
                </p>
              ) : (
                <Money
                  label="実際の仕入単価（未確認なら空欄）"
                  value={l.cost}
                  onChange={(v) => put(i, "cost", v)}
                />
              )}
              <p>未処理余剰：{l.qty - l.used - moved}個</p>
              {!state.stocks.some((st) => st.eventLineId === l.id) && (
                <Button
                  secondary
                  danger
                  onClick={() => {
                    if (confirm("この商品行を削除しますか？"))
                      set({
                        ...e,
                        lines: e.lines.filter((x) => x.id !== l.id),
                      });
                  }}
                >
                  この商品行を削除
                </Button>
              )}
            </div>
          );
        })}
        <div className="inline">
          <Field label="注文商品">
            <select
              value={choice}
              onChange={(ev) => setChoice(ev.target.value)}
            >
              {state.products
                .filter((p) => ["walnut", "bean", "apple"].includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              <option value="other">その他（名前と単価を入力）</option>
            </select>
          </Field>
          <Button secondary onClick={add}>
            ＋ 商品行を追加
          </Button>
        </div>
        <p className="notice">
          こしあんぱん等、未確認の仕入単価は空欄です。確認後に入力してください。
        </p>
        <Field label="メモ">
          <textarea
            value={e.note}
            onChange={(ev) => set({ ...e, note: ev.target.value })}
          />
        </Field>
        <Check
          label="テスト入力・年度集計から除外"
          checked={e.test}
          onChange={(v) => set({ ...e, test: v })}
        />
        <Button type="submit">行事の注文・使用数を保存</Button>
      </form>
    </Modal>
  );
}
function TransferEditor({ event, line, onClose }) {
  const { state, save } = useApp();
  const remaining = line.qty - line.used - transferredQty(state, line.id);
  const [qty, setQty] = useState(remaining),
    [amount, setAmount] = useState(
      price(
        state.products.find((p) => p.id === line.productId) || {
          mode: "auto",
          gross: null,
        },
      ),
    ),
    [date, setDate] = useState(event.date);
  return (
    <Modal title="余剰を園内販売へ振替" onClose={onClose}>
      <h3>
        {line.name} ／ 未処理余剰 {remaining}個
      </h3>
      <Field label="振り替える数量">
        <Qty value={qty} onChange={setQty} />
      </Field>
      <Money
        required
        label="通常販売価格（1個）"
        value={amount}
        onChange={setAmount}
      />
      <Field
        label="園内販売の開始日"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <p>
        販売側に移る仕入額：<strong>{yen(qty * line.cost)}</strong>
      </p>
      <p className="muted">
        この数量は財政へ請求しません。売れた数量分だけ販売利益になります。
      </p>
      <Button
        onClick={async () => {
          if (
            await save((s) => {
              const e = s.events.find((x) => x.id === event.id),
                l = e.lines.find((x) => x.id === line.id);
              transfer(s, e, l, qty, amount, date);
            }, "行事余剰を園内販売へ振替")
          )
            onClose();
        }}
      >
        振り替えて園内販売に追加
      </Button>
    </Modal>
  );
}
