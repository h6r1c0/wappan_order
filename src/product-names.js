// Product IDs and order snapshots remain the accounting identity. This label is
// only for current screens; the supplier spelling is kept in sourceName.
export function productDisplayName(name = '') {
  const source = String(name).replace(/【(?:(\d+個)・)?\d+月\d+日資料】/gu,(_,pack)=>pack?` ${pack}`:'')
    .replace(/[\s\u3000]+/gu, ' ').trim();
  const packed = source.replace(/[・･]\s*(\d+)個入り/gu, ' $1個').replace(/(\d+)個入り/gu, '$1個');
  // Both pack sizes exist for these families, so even the single pack needs a size.
  if (/^(?:くるみパン|(?:リーン)?(?:天然酵母)?(?:ちび)?ハイジの白パン) 1個$/u.test(packed)) return packed;
  return packed.replace(/ 1個(?=\s*[,、､]\s*約\d|$)/u, '')
    .replace(/\s+([,、､])/gu, '$1').trim();
}

export function productSearchText(product) {
  return [productDisplayName(product.name), product.sourceName || '', product.name].join(' ');
}

export function productImportIdentity(name) {
  return productDisplayName(name).replace(/^ミルクスティックパン$/u, 'ミルクスティック');
}
