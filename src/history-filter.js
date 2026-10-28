function date(value) {
  if(!value) return '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value) throw new Error('Expected a valid UTC date YYYY-MM-DD');
  return value;
}
export function historyFilters(params) {
  const q=params.get('q')??'';
  if(q.length>100 || /[\x00-\x1f\x7f]/.test(q)) throw new Error('Search must contain at most 100 printable characters');
  const from=date(params.get('from')),to=date(params.get('to'));
  if(from&&to&&from>to) throw new Error('Date range is reversed');
  return {q:q.trim(),from,to};
}
export function filterHistory(ids,{q='',from='',to=''}={}) {
  const search=q.toLowerCase();
  return ids.filter(id=>(!search||id.toLowerCase().includes(search))&&(!from||id.slice(0,10)>=from)&&(!to||id.slice(0,10)<=to));
}
