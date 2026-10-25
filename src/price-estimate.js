// A suggestion only. The supplier's documented tax basis and pack unit must
// still be checked by the person adopting it for a specific order round.
export function estimatePrice(products, cost) {
  const samples = products.filter(p => !p.retiredDuplicate && Number.isSafeInteger(p.cost) && p.cost > 0 && Number.isSafeInteger(p.gross) && p.gross > 0 && !p.discounted);
  if (!Number.isSafeInteger(cost) || cost <= 0 || samples.length < 12) return null;
  const median = values => values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const ratios = samples.map(p => p.gross / p.cost);
  const errors = samples.map((p,i) => Math.abs(Math.round(p.cost * median(ratios.filter((_,j)=>j!==i))) - p.gross));
  const matches = samples.filter((p,i) => Math.floor(Math.round(p.cost * median(ratios.filter((_,j)=>j!==i))) / 10) === Math.floor(p.gross / 10)).length;
  if (matches / samples.length < .9 || Math.max(...errors) > 3) return null;
  const multiplier = median(ratios), gross = Math.round(cost * multiplier);
  return {gross, price:Math.floor(gross / 10)*10, multiplier, count:samples.length,
    exact:matches, meanError:errors.reduce((a,b)=>a+b,0)/samples.length,
    examples:samples.slice(0,3).map(p=>({name:p.name,cost:p.cost,gross:p.gross}))};
}
