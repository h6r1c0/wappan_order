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
    rows: XLSX.utils.sheet_to_json(book.Sheets[name], {
      header: 1,
      defval: "",
      raw: true,
    }),
  }));
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
