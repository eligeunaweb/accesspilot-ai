import { languageCode } from './i18n.js';
import { wcagCriteria } from './report.js';

export const severities=['critical','serious','moderate','minor','unknown'];
function optionalText(value, limit) {
  if(value===undefined || value===null) return null;
  if(typeof value!=='string'||value.length>limit) throw new Error('Invalid history text');
  return value;
}
function count(value) {
  if(value===undefined||value===null) return null;
  if(!Number.isSafeInteger(value)||value<0||value>10000000) throw new Error('Invalid history count');
  return value;
}
export function ruleDetails(rule) {
  const impact=rule.impact??'unknown';
  if(!severities.includes(impact)) throw new Error('Invalid history severity');
  const wcag=rule.wcag??wcagCriteria(rule.tags??[]);
  if(!Array.isArray(wcag)||wcag.length>100||wcag.some(value=>typeof value!=='string'||!/^([1-4])\.[1-9]\.\d{1,2}$/.test(value))) throw new Error('Invalid history WCAG criteria');
  let recommendation=null;
  if(rule.recommendation!==undefined&&rule.recommendation!==null) {
    const advice=rule.recommendation;
    if(!['curated','general'].includes(advice.kind)) throw new Error('Invalid history recommendation');
    recommendation={kind:advice.kind,language:languageCode(advice.language),
      correction:optionalText(advice.correction,16000),verification:optionalText(advice.verification,16000)};
    if(!recommendation.correction||!recommendation.verification) throw new Error('Incomplete history recommendation');
  }
  return {impact,wcag:[...new Set(wcag)],help:optionalText(rule.help,2000),
    description:optionalText(rule.description,8000),recommendation};
}
export function reviewDetails(report, normalizeTarget) {
  let incompleteDetails=null;
  if(report.incompleteDetails!==undefined&&report.incompleteDetails!==null) {
    if(!Array.isArray(report.incompleteDetails)||report.incompleteDetails.length>5000) throw new Error('Invalid history review rules');
    incompleteDetails=report.incompleteDetails.map(rule=>{
      if(typeof rule.id!=='string'||!rule.id||rule.id.length>200||!Array.isArray(rule.nodes)||rule.nodes.length>10000) throw new Error('Invalid history review evidence');
      return {id:rule.id,...ruleDetails(rule),nodes:rule.nodes.map(node=>({target:normalizeTarget(node.target)}))};
    });
  }
  const incomplete=count(report.incomplete);
  if(incomplete!==null&&incompleteDetails!==null&&incomplete!==incompleteDetails.length) throw new Error('History review count mismatch');
  return {language:languageCode(report.language),passes:count(report.passes),incomplete,incompleteDetails};
}
