import {richRunView,historyTrendView} from './history-detail-view.js';
import {compareAudits} from './comparison.js';
import {comparisonView,copy} from './viewer-html.js';
import {renderShareReport} from './share-report.js';
import {exportHistory} from './history-export.js';

// Fixed trusted entrypoint; never evaluates page content or launches audit jobs.
process.once('message',message=>{
  try {
    if(typeof message.input!=='string'||Buffer.byteLength(message.input)>64*1024*1024||!Number.isSafeInteger(message.maxOutputBytes)||message.maxOutputBytes<1||message.maxOutputBytes>40*1024*1024)throw new Error();
    const p=JSON.parse(message.input);let body;
    switch(message.operation) {
      case 'detail':body=richRunView(p.snapshot,p.evidence,p.lang,p.base,p.run);break;
      case 'compare':body=comparisonView(compareAudits(...p.snapshots),copy[p.lang]);break;
      case 'trends':body=historyTrendView(p.window,p.lang,p.base);break;
      case 'export':body=p.shared?renderShareReport(p.snapshot,p.format,p.lang):exportHistory(p.snapshot,p.format,p.lang);break;
      default:throw new Error();
    }
    if(typeof body!=='string'||Buffer.byteLength(body)>message.maxOutputBytes)throw new Error();
    process.send({ok:true,body},()=>process.disconnect());
  } catch {process.send({ok:false},()=>process.disconnect());}
});
