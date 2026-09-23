import React, { useEffect, useLayoutEffect, useState, createContext, useContext } from "react";
import { normalize, yen } from "./domain";

const breadCategoryIcon = new URL(
  "../wappan_icon_category_bread_final.png",
  import.meta.url,
).href;
const bakedCategoryIcon = new URL(
  "../wappan_icon_category_gingerbread_final.png",
  import.meta.url,
).href;

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
export function Button({
  children,
  secondary = false,
  danger = false,
  className = "",
  ...props
}) {
  return (
    <button
      className={`button ${secondary ? "secondary" : ""} ${danger ? "danger" : ""} ${className}`}
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
  const cookie = category === "焼き菓子";
  return (
    <img
      alt=""
      aria-hidden="true"
      className="cat"
      src={cookie ? bakedCategoryIcon : breadCategoryIcon}
    />
  );
}
export function Tag({ children }) {
  return <span className="tag">{children}</span>;
}
let openModalCount = 0;
let lockedPageScroll = 0;
let savedBodyStyle = null;
function lockPageScroll() {
  if (openModalCount === 0) {
    lockedPageScroll = window.scrollY;
    savedBodyStyle = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    Object.assign(document.body.style, {
      position: "fixed",
      top: `-${lockedPageScroll}px`,
      left: "0",
      right: "0",
      width: "100%",
      overflow: "hidden",
    });
    document.documentElement.classList.add("modal-open");
  }
  openModalCount += 1;
  return () => {
    openModalCount = Math.max(0, openModalCount - 1);
    if (openModalCount !== 0 || !savedBodyStyle) return;
    Object.assign(document.body.style, savedBodyStyle);
    document.documentElement.classList.remove("modal-open");
    const restoreTo = lockedPageScroll;
    savedBodyStyle = null;
    window.scrollTo(0, restoreTo);
  };
}
export function Modal({ title, children, onClose }) {
  const [dirty, setDirty] = useState(false);
  useLayoutEffect(() => lockPageScroll(), []);
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
export function ProductQuantityEditor({
  products,
  quantities,
  onChange,
  priceLabel = (product) => yen(product.price),
  emptyMessage = "この回の商品がありません。",
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const filtered = products.filter(
    (product) =>
      (category === "全部" || product.category === category) &&
      normalize(product.name).includes(normalize(query)),
  );
  const selected = filtered.filter((product) => quantities[product.id] > 0);
  const unselected = filtered.filter((product) => !quantities[product.id]);
  const row = (product) => (
    <div className="product-row" key={product.id}>
      <span className="grow">
        {product.name}
        {priceLabel(product) && <small>{priceLabel(product)}</small>}
      </span>
      <Qty
        label={`${product.name} 数量`}
        value={quantities[product.id] || 0}
        onChange={(quantity) =>
          onChange({ ...quantities, [product.id]: quantity })
        }
      />
    </div>
  );
  if (!products.length) return <Empty>{emptyMessage}</Empty>;
  return (
    <>
      <Field
        label="商品名で絞る"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="tabs category-tabs">
        {["全部", "パン", "焼き菓子"].map((value) => (
          <Button
            secondary={category !== value}
            key={value}
            onClick={() => setCategory(value)}
          >
            {value !== "全部" && <Cat category={value} />}
            {value}
          </Button>
        ))}
      </div>
      {selected.length > 0 && (
        <>
          <h3>入力済み</h3>
          {selected.map(row)}
        </>
      )}
      {query ? (
        unselected.map(row)
      ) : (
        <details open>
          <summary>＋ 商品を選ぶ（{unselected.length}品）</summary>
          {unselected.map(row)}
        </details>
      )}
    </>
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
export function BuyerPicker({
  value,
  onChange,
  allowAdd = true,
  includeTest = false,
  suggestedName = "",
}) {
  const { state, save } = useApp();
  const [query, setQuery] = useState("");
  const [name, setName] = useState(suggestedName);
  const [adding, setAdding] = useState(!!suggestedName);
  useEffect(() => {
    if (!suggestedName) return;
    setName(suggestedName);
    setAdding(true);
  }, [suggestedName]);
  const suggestedKey = normalize(suggestedName);
  const similar = suggestedKey
    ? state.buyers.filter((buyer) => {
        const key = normalize(buyer.name);
        return (
          key !== suggestedKey &&
          (key.includes(suggestedKey) ||
            suggestedKey.includes(key) ||
            (suggestedKey.length > 1 && key.slice(0, 2) === suggestedKey.slice(0, 2)))
        );
      }).slice(0, 4)
    : [];
  return (
    <>
      {state.buyers.length > 12 && <Field label="購入者を絞り込む" type="search" placeholder="名前の一部（入力しなくても選べます）" value={query} onChange={e => setQuery(e.target.value)} />}
      <div className="buyer-grid">
        {state.buyers
          .filter((b) => b.id === value || (b.testOnly ? includeTest : b.active))
          .filter(b => normalize(b.name).includes(normalize(query)))
          .map((b) => (
            <button
              type="button"
              className={`buyer ${value === b.id ? "selected" : ""}`}
              key={b.id}
              onClick={() => onChange(b.id)}
            >
              <span>{b.name}</span>
            </button>
          ))}
      </div>
      {allowAdd && (
        <>
          <Button secondary onClick={() => setAdding(!adding)}>
            ＋ 購入者を追加
          </Button>
          {adding && (
            <div className="buyer-add">
              {suggestedName && <p className="notice compact-notice">LINEから読み取った名前です。確認・修正してから追加してください。</p>}
              {similar.length > 0 && (
                <div className="similar-buyers">
                  <span>似た登録名があります</span>
                  {similar.map((buyer) => (
                    <Button secondary key={buyer.id} onClick={() => onChange(buyer.id)}>
                      {buyer.name}を選ぶ
                    </Button>
                  ))}
                </div>
              )}
              <div className="inline">
                <Field
                  label="新しい購入者名"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button
                  disabled={!name.trim()}
                  onClick={async () => {
                    const clean = name.trim();
                    const existing = state.buyers.find(
                      (buyer) => normalize(buyer.name) === normalize(clean),
                    );
                    if (existing) {
                      setName("");
                      setAdding(false);
                      onChange(existing.id, existing);
                      return;
                    }
                    const id = crypto.randomUUID();
                    const buyer = { id, name: clean, active: true, fixed: [] };
                    if (
                      await save(
                        (s) => s.buyers.push(buyer),
                        "購入者を追加",
                      )
                    ) {
                      setName("");
                      setAdding(false);
                      onChange(id, buyer);
                    }
                  }}
                >
                  追加して選ぶ
                </Button>
              </div>
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
          <summary className="collection-person">
            <span>{row.name}<small>入力済み</small></span>
            <strong>{yen(row.total)}</strong>
          </summary>
          <p>
            個人注文 {yen(row.normal)} ／ 販売用から追加 {yen(row.onsite)}
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
