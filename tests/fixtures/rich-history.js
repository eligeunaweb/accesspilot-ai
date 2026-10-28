import { recommendation } from '../../src/i18n.js';

export function richFixture() {
  const rule={id:'image-alt',impact:'serious',help:'Images need alternatives',description:'Describe the image',wcag:['1.1.1'],recommendation:recommendation('image-alt','es'),
    nodes:[{target:['#image'],html:'PRIVATE HTML',failureSummary:'PRIVATE ERROR'}]};
  return {schemaVersion:1,kind:'project-audit',tool:'AccessPilot AI',version:'0.1.0',generatedAt:'2026-10-26T12:00:00.000Z',
    project:{schemaVersion:1,name:'Rich fixture',urls:['https://example.org'],language:'es'},
    pages:[{url:'https://example.org',status:'succeeded',report:{schemaVersion:1,kind:'page-audit',url:'https://example.org',language:'es',
      engine:{name:'axe-core',version:'4.14.0'},passes:10,incomplete:1,violations:[rule],
      incompleteDetails:[{...rule,id:'color-contrast',impact:'moderate',wcag:['1.4.3'],nodes:[{target:['#contrast']}],recommendation:recommendation('color-contrast','es')}]}}]};
}
