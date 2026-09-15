export async function readExcel(file) {
  const XLSX = await import("xlsx");
  if (file.size > 10 * 1024 * 1024)
    throw Error("10MB以下のExcelファイルを選んでください");
  const book = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: false,
  });
  return book.SheetNames.map((name) => ({
    name,
    cells: book.Sheets[name],
    merges: book.Sheets[name]["!merges"] || [],
    rows: XLSX.utils.sheet_to_json(book.Sheets[name], {
      header: 1,
      defval: "",
      raw: true,
    }),
  }));
}
const compact = (s) => String(s ?? "").normalize("NFKC").replace(/\s/g, "");
export const permanentProduct = (name) => /^(ツイストドーナツ|ミルクスティック(?:パン)?|黒糖ブレッド)$/.test(compact(name));
// Monetary values follow the workbook's visible integer format, never an
// arbitrary truncation of a decimal whose display format is unknown.
export function displayedPrice(cell, fallback) {
  const raw = cell?.v ?? fallback;
  const direct = numberPrice(raw);
  if (direct != null) return direct;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  const shown = numberPrice(cell?.w);
  return shown != null && Math.abs(shown - raw) <= 0.500001 ? shown : null;
}
const address = (r, c) => {
  let col = "";
  for (let n = c + 1; n; n = Math.floor((n - 1) / 26)) col = String.fromCharCode(65 + (n - 1) % 26) + col;
  return col + (r + 1);
};
export function analyzeSheet(sheet) {
  const { rows, cells = {}, merges = [] } = sheet;
  const title = rows.slice(0, 6).flat().map(compact).join(" ");
  const format = /わっぱん夏期定番菓子.*注文書/.test(title) ? "sweets" : /わっぱん注文書.*お届け/.test(title) ? "bread" : "unknown";
  const products = [], warnings = [], mappings = new Map();
  for (let r = 0; r < rows.length; r++) {
    const headers = detectColumns([rows[r]]).pairs;
    headers.forEach((p) => mappings.set(p.nameCol, p));
    for (const p of mappings.values()) {
      const name = String(rows[r][p.nameCol] ?? "").trim();
      if (!name || /商品名|品名|合計|小計|総計/.test(name)) continue;
      const cell = cells[address(r, p.priceCol)];
      const gross = displayedPrice(cell, rows[r][p.priceCol]);
      if (gross == null) {
        if (cell?.v !== undefined && cell.v !== "") warnings.push(`${name}：税込価格を確認してください`);
        continue;
      }
      const sectionMerge = merges.find((m) => m.s.c === p.nameCol - 1 && m.s.r <= r && m.e.r >= r);
      const section = compact(sectionMerge ? rows[sectionMerge.s.r][sectionMerge.s.c] : rows[r][p.nameCol - 1]);
      const once = /今月のおすすめ(?:パン|菓子)/.test(section);
      const lifecycle = permanentProduct(name) ? "permanent" : once ? "once" : format !== "unknown" ? "staple" : "";
      products.push({ name, gross, row: r + 1, lifecycle, category: format === "sweets" || /おすすめ菓子/.test(section) ? "焼き菓子" : "パン", section, sourceValue: cell?.v ?? gross });
      // The first bread block has a second, explicitly labelled sliced price.
      if (format === "bread") {
        const slice = merges.find((m) => m.s.r <= r && m.e.r >= r && m.s.c > p.priceCol && m.s.c < p.nameCol + 7 && /スライス/.test(compact(rows[m.s.r][m.s.c])));
        if (slice) {
          const slicedGross = displayedPrice(cells[address(r, slice.e.c + 1)], rows[r][slice.e.c + 1]);
          if (slicedGross != null) products.push({ ...products[products.length - 1], name: name + "【スライス】", gross: slicedGross });
        }
      }
    }
  }
  return { format, label: format === "sweets" ? "定番焼き菓子注文書" : format === "bread" ? "月次パン注文書" : "未判定の注文書", products, warnings };
}
export function numberPrice(v) {
  if (typeof v === "number")
    return Number.isSafeInteger(v) && v >= 0 ? v : null;
  const t = String(v)
    .normalize("NFKC")
    .replace(/[,，¥￥円\s]/g, "");
  return /^\d+$/.test(t) ? Number(t) : null;
}
export function detectColumns(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const r = rows[i].map(String),
      pairs = [];
    for (let j = 0; j < r.length; j++)
      if (/商品名|品名/.test(r[j])) {
        let p = r.findIndex((v, k) => k > j && /税込/.test(v));
        const next = r.findIndex((v, k) => k > j && /商品名|品名/.test(v));
        if (p >= 0 && (next < 0 || p < next))
          pairs.push({ nameCol: j, priceCol: p });
      }
    if (pairs.length) return { start: i + 1, pairs };
  }
  return { start: 0, pairs: [] };
}
export function extractRows(rows, pairs, start = 0) {
  const found = [];
  for (let i = start; i < rows.length; i++)
    for (const pair of pairs) {
      const name = String(rows[i][pair.nameCol] ?? "").trim(),
        gross = numberPrice(rows[i][pair.priceCol]);
      if (name && !/^(商品名|品名|合計|小計|総計)$/.test(name) && gross != null)
        found.push({ name, gross, row: i + 1 });
    }
  return found;
}
