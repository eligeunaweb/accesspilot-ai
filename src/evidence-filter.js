import { severities } from './snapshot-detail.js';

export function evidenceFilters(params) {
  const text=params.get('text')??'',severity=params.get('severity')??'all',status=params.get('status')??'all',category=params.get('category')??'all';
  if(text.length>100||/[\x00-\x1f\x7f]/.test(text)||!['all',...severities].includes(severity)||!['all','succeeded','failed','cancelled'].includes(status)||!['all','violations','review'].includes(category)) throw new Error('Invalid evidence filters');
  return {text:text.trim(),severity,status,category};
}
export function selectEvidence(snapshot,filters) {
  const search=filters.text.toLowerCase();
  const pages=snapshot.pages.filter(page=>filters.status==='all'||page.status===filters.status).map(page=>{
    if(page.status!=='succeeded') return !search||page.url.toLowerCase().includes(search)?page:null;
    const select=rules=>(rules??[]).flatMap(rule=>{
      if(filters.severity!=='all'&&(rule.impact??'unknown')!==filters.severity) return [];
      const common=[page.url,rule.id,rule.help??'',...(rule.wcag??[])].join(' ').toLowerCase();
      const nodes=rule.nodes.filter(node=>!search||common.includes(search)||JSON.stringify(node.target).toLowerCase().includes(search));
      return nodes.length?[{...rule,nodes}]:[];
    });
    const violations=filters.category==='review'?[]:select(page.report.violations);
    const incompleteDetails=filters.category==='violations'?[]:select(page.report.incompleteDetails);
    if((search||filters.severity!=='all'||filters.category!=='all')&&!violations.length&&!incompleteDetails.length) return null;
    return {...page,report:{...page.report,violations,incompleteDetails:page.report.incompleteDetails==null?null:incompleteDetails}};
  }).filter(Boolean);
  return pages;
}
