import {projectKey} from './history.js';
import {richRunView,historyTrendView} from './history-detail-view.js';
import {parseSnapshotBytes,compareAudits} from './comparison.js';
import {comparisonView,copy} from './viewer-html.js';
import {renderShareReport} from './share-report.js';
import {exportHistory} from './history-export.js';

// Fixed trusted entrypoint; never evaluates page content or launches audit jobs.
process.once('message',message=>{
  try {
    if(typeof message.input!=='string'||Buffer.byteLength(message.input)>64*1024*1024||!Number.isSafeInteger(message.maxOutputBytes)||message.maxOutputBytes<1||message.maxOutputBytes>40*1024*1024)throw new Error();
    const p=JSON.parse(message.input);let body;
    const decode=source=>{
      if(typeof source!=='string'||source.length>Math.ceil(20*1024*1024/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(source))throw new Error();
      const snapshot=parseSnapshotBytes(Buffer.from(source,'base64'));
      if(typeof p.expectedKey!=='string'||projectKey(snapshot.project)!==p.expectedKey)throw new Error();
      return snapshot;
    };
    if(p.records!==undefined) {
      const count=message.operation==='compare'?2:1;
      if(!Array.isArray(p.records)||p.records.length!==count)throw new Error();
      const snapshots=p.records.map(decode);
      if(message.operation==='compare')p.snapshots=snapshots;else p.snapshot=snapshots[0];
    }
    if(message.operation==='trends'&&p.sourceWindow!==undefined) {
      if(!Array.isArray(p.sourceWindow.rows)||p.sourceWindow.rows.length>10)throw new Error();
      p.window={total:p.sourceWindow.total,rows:p.sourceWindow.rows.map(row=>{
        if(row.error)return {id:row.id,error:row.error};
        try{return {id:row.id,snapshot:decode(row.source)};}catch{return {id:row.id,error:'invalid'};}
      })};
    }
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
