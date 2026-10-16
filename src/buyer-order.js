export const kana = text => String(text||'').normalize('NFKC').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
export const buyerReading = buyer => kana(buyer.kana || (/^[ぁ-ゖァ-ヶー]+$/.test(buyer.name) ? buyer.name : ''));
export const buyerCompare = (a,b) => (buyerReading(a)||'ん'+a.name).localeCompare(buyerReading(b)||'ん'+b.name,'ja');
