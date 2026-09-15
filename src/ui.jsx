import React, { useState, createContext, useContext } from "react";
import { yen } from "./domain";
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
export function Button({
  children,
  secondary = false,
  danger = false,
  ...props
}) {
  return (
    <button
      className={`button ${secondary ? "secondary" : ""} ${danger ? "danger" : ""}`}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
export function Money({
  label,
  value,
  onChange,
  required = false,
  signed = false,
}) {
  return (
    <Field label={label}>
      <input
        aria-label={label}
        inputMode={signed ? "text" : "numeric"}
        type="number"
        min={signed ? undefined : 0}
        step="1"
        value={value ?? ""}
        required={required}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
      />
    </Field>
  );
}
export function Check({ label, checked, onChange }) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}
export function Cat({ category }) {
  return (
    <span
      aria-label={category}
      className={`cat ${category === "焼き菓子" ? "cookie" : "bread"}`}
      role="img"
    />
  );
}
export function Tag({ children }) {
  return <span className="tag">{children}</span>;
}
export function Modal({ title, children, onClose }) {
  const [dirty, setDirty] = useState(false);
  const close = () => {
    if (!dirty || confirm("未保存の入力を破棄して閉じますか？")) onClose();
  };
  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onChangeCapture={() => setDirty(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      >
        <div className="section-head">
          <h2>{title}</h2>
          <Button secondary onClick={close}>
            閉じる
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Qty({ value = 0, onChange, label = "数量" }) {
  return (
    <div className="qty">
      <label>
        <span className="sr-only">{label}</span>
        <select
          aria-label={label}
          value={value > 10 ? "other" : value}
          onChange={(e) =>
            onChange(e.target.value === "other" ? 11 : Number(e.target.value))
          }
        >
          {Array.from({ length: 11 }, (_, i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
          <option value="other">その他</option>
        </select>
      </label>
      {value > 10 && (
        <input
          aria-label={`${label} その他`}
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
    </div>
  );
}
export function Summary({ label, value, note }) {
  return (
    <div className="summary">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
export function BuyerPicker({ value, onChange, allowAdd = true, includeTest = false }) {
  const { state, save } = useApp();
  const [query, setQuery] = useState("");
  const [name, setName] = useState(""),
    [adding, setAdding] = useState(false);
  return (
    <>
      {state.buyers.length > 12 && <Field label="購入者を絞り込む" type="search" placeholder="名前の一部（入力しなくても選べます）" value={query} onChange={e => setQuery(e.target.value)} />}
      <div className="buyer-grid">
        {state.buyers
          .filter((b) => b.id === value || (b.testOnly ? includeTest : b.active))
          .filter(b => b.name.normalize("NFKC").includes(query.normalize("NFKC")))
          .map((b) => (
            <button
              type="button"
              className={`buyer ${value === b.id ? "selected" : ""}`}
              key={b.id}
              onClick={() => onChange(b.id)}
            >
              {b.name}
            </button>
          ))}
      </div>
      {allowAdd && (
        <>
          <Button secondary onClick={() => setAdding(!adding)}>
            ＋ 購入者を追加
          </Button>
          {adding && (
            <div className="inline">
              <Field
                label="新しい購入者名"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                onClick={async () => {
                  const id = crypto.randomUUID();
                  if (
                    await save(
                      (s) =>
                        s.buyers.push({
                          id,
                          name: name.trim(),
                          active: true,
                          fixed: [],
                        }),
                      "購入者を追加",
                    )
                  ) {
                    setName("");
                    setAdding(false);
                    onChange(id, {
                      id,
                      name: name.trim(),
                      active: true,
                      fixed: [],
                    });
                  }
                }}
              >
                追加して選ぶ
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
export function CollectionList({ rows }) {
  return rows.length ? (
    <div className="stack">
      {rows.map((row) => (
        <details className="card" key={row.id}>
          <summary>
            <span>{row.name}</span>
            <strong>{yen(row.total)}</strong>
          </summary>
          <p>
            通常注文 {yen(row.normal)} ／ 園内販売 {yen(row.onsite)}
          </p>
          {row.lines.map((l, i) => (
            <div className="line" key={i}>
              <span>{l.description}</span>
              <b>{yen(l.amount)}</b>
            </div>
          ))}
        </details>
      ))}
    </div>
  ) : (
    <Empty>この範囲の個人請求はありません。</Empty>
  );
}
export async function copyText(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else
    throw Error(
      "コピーできません。表示された文章を選択してコピーしてください。",
    );
}
