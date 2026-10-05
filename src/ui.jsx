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
    <label className={`field ${props.type === 'search' ? 'search-field' : ''}`}>
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
  unit = "円",
}) {
  return (
    <Field label={label}>
      <span className="money-input"><input
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
      />{unit && <span aria-hidden="true">{unit}</span>}</span>
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
export function Qty({ value = 0, onChange, label = "数量", min=0, max=100000000 }) {
  const [direct, setDirect] = useState(false);
  const amount = Number(value) || 0;
  const bounded = n => onChange(Math.max(min,Math.min(max,Math.floor(Number(n)||0))));
  return (
    <div className="qty">
      <button type="button" aria-label={`${label}を減らす`} disabled={amount <= min}
        onClick={() => bounded(amount - 1)}>−</button>
      <button type="button" className="qty-value" aria-label={`${label} ${amount}、直接入力する`}
        aria-expanded={direct} onClick={() => setDirect(!direct)}>{amount}</button>
      <button type="button" aria-label={`${label}を増やす`} disabled={amount >= max} onClick={() => bounded(amount + 1)}>＋</button>
      {direct && (
        <input
          aria-label={`${label} 直接入力`}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step="1"
          value={amount}
          onChange={(e) => bounded(e.target.value)}
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
  startCollapsed = false,
  secondaryLabel = null,
  cutQuantities = null,
  onCutChange = null,
  cutFees = {},
  onCutFeeChange = null,
  priceHeading = null,
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("パン");
  const filtered = products.filter(
    (product) =>
      (query.trim() || category === "ALL" || product.category === category) &&
      normalize(product.name).includes(normalize(query)),
  );
  const row = (product) => (
    <div className="product-entry" key={product.id}><div className="product-row">
      <span className="grow">
        {product.name.startsWith('ツイストドーナツ 2個入り') ? <><span>ツイストドーナツ</span><small className="pack-spec">2個入り</small></> : product.name}
        {priceLabel(product) && <small>{priceLabel(product)}</small>}
        {secondaryLabel?.(product) && <small className="quantity-reference">{secondaryLabel(product)}</small>}
      </span>
      <Qty
        label={`${product.name} 数量`}
        value={quantities[product.id] || 0}
        onChange={(quantity) =>
          onChange({ ...quantities, [product.id]: quantity })
        }
      />
    </div>{onCutChange && (product.cutSupported ?? product.name.includes('食パン')) && !product.name.includes('【スライス】') && quantities[product.id] > 0 && <div className="cut-option">
      <Check label="カット" checked={(cutQuantities?.[product.id] || 0) > 0} onChange={checked => onCutChange({...cutQuantities,[product.id]:checked ? quantities[product.id] : 0})}/>
      {(cutQuantities?.[product.id] || 0) > 0 && cutFees[product.id] == null && <Money label="カット加算額" value={null} onChange={value => onCutFeeChange?.(product.id, value)}/>}
    </div>}</div>
  );
  if (!products.length) return <Empty>{emptyMessage}</Empty>;
  return (
    <>
      {priceHeading && <small className="list-unit-heading">{priceHeading}</small>}
      <div className="tabs category-tabs">
        {["パン", "焼き菓子", "ALL"].map((value) => (
          <Button
            secondary={category !== value}
            key={value}
            onClick={() => setCategory(value)}
          >

            {value === "ALL" ? "すべて" : value}
          </Button>
        ))}
      </div>
      <Field
        placeholder="商品名を検索（例：食パン）"
        label="商品名を検索"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {filtered.map(row)}
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
const kana = text => String(text||'').normalize('NFKC').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
export const buyerReading = buyer => kana(buyer.kana || (/^[ぁ-ゖァ-ヶー]+$/.test(buyer.name) ? buyer.name : ''));
export const buyerCompare = (a,b) => (buyerReading(a)||'ん'+a.name).localeCompare(buyerReading(b)||'ん'+b.name,'ja');
const kanaGroups = [['あ','あいうえお'],['か','かきくけこがぎぐげご'],['さ','さしすせそざじずぜぞ'],['た','たちつてとだぢづでど'],['な','なにぬねの'],['は','はひふへほばびぶべぼぱぴぷぺぽ'],['ま','まみむめも'],['や','やゆよ'],['ら','らりるれろ'],['わ','わをん']];
const buyerGroup = b => kanaGroups.find(([,letters])=>letters.includes(buyerReading(b)[0]||'!'))?.[0] || 'その他';
export function BuyerPicker({
  value,
  onChange,
  allowAdd = true,
  includeTest = false,
  suggestedName = "",
}) {
  const { state, save } = useApp();
  const [query, setQuery] = useState("");
  const candidates=state.buyers.filter(b=>b.id===value||(b.testOnly?includeTest:b.active));
  const [group,setGroup] = useState(() => {
    const selected=candidates.find(b=>b.id===value);
    if(selected)return buyerGroup(selected);
    return candidates.some(b=>buyerGroup(b)==='あ') ? 'あ' : buyerGroup(candidates.slice().sort(buyerCompare)[0]||{name:''});
  });
  const [name, setName] = useState(suggestedName);
  const [reading, setReading] = useState('');
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
      <div className="buyer-search-add"><Field label="名前を検索" type="search" placeholder="名前を検索" value={query} onChange={e => setQuery(e.target.value)} />
        {allowAdd && <button type="button" className="text-action" onClick={() => setAdding(!adding)}>＋ 追加</button>}
      </div>
      {!query && <div className="buyer-index" role="group" aria-label="購入者の五十音索引">
        {[...kanaGroups.map(([name])=>name),'その他','すべて'].map(name=><button type="button" key={name}
          className={group===name?'selected':''} aria-pressed={group===name} onClick={()=>setGroup(name)}>{name}</button>)}
      </div>}
      {allowAdd && (
        <>
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
                <Field label="よみがな" value={reading} onChange={e => setReading(e.target.value)} />
                <Button
                  disabled={!name.trim() || !reading.trim()}
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
                    const buyer = { id, name: clean, kana: reading.trim(), active: true, fixed: [] };
                    if (
                      await save(
                        (s) => s.buyers.push(buyer),
                        "購入者を追加",
                      )
                    ) {
                      setName("");
                      setReading("");
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
      <div className="buyer-grid">
        {state.buyers
          .filter((b) => b.id === value || (b.testOnly ? includeTest : b.active))
          .filter(b => (query || group==='すべて' || buyerGroup(b)===group) && (normalize(b.name).includes(normalize(query)) || normalize(buyerReading(b)).includes(normalize(kana(query)))))
          .sort(buyerCompare)
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
    </>
  );
}
export function CollectionList({ rows }) {
  return rows.length ? (
    <div className="stack">
      {rows.map((row) => (
        <details className="card" key={row.id}>
          <summary className="collection-person">
            <span>{row.name}</span>
            <strong>{yen(row.total)}</strong>
          </summary>
          <details className="collection-breakdown"><summary>種類別を見る</summary>
            {Object.entries(row.categories || {}).filter(([, amount]) => amount > 0)
              .map(([name, amount]) => <p key={name}>{name} {yen(amount)}</p>)}
          </details>
          <details className="collection-breakdown"><summary>内訳を見る</summary>
            <p>個人注文 {yen(row.normal)} ／ 販売用から追加 {yen(row.onsite)}</p>
            {row.lines.map((l, i) => (
              <div className="line" key={i}><span>{l.description}</span><b>{yen(l.amount)}</b></div>
            ))}
          </details>
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
