import {createAuditQueue} from '../src/audit-queue.js';

const args=process.argv.slice(2);
let queue;
const controller=new AbortController(),cancel=()=>controller.abort();
process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
try {
  if ((args.length!==2 && args.length!==3) || args[0]!=='--job-store' || !args[1] || args[1].startsWith('--') || args.length===3 && args[2]!=='--apply') throw new Error('Usage: node scripts/recover-workers.js --job-store DIRECTORY [--apply]');
  queue=await createAuditQueue({directory:args[1],recovery:true});
  const report=await queue.recoverWorkers({apply:args[2]==='--apply',signal:controller.signal});
  console.log(JSON.stringify(report,null,2));
} catch (error) {console.error('Worker recovery failed: '+error.message);process.exitCode=2;}
finally {
  try {if(queue)await queue.close();}
  catch {console.error('Recovery incomplete; preserve job store and investigate ownership before retrying');process.exitCode=2;}
  process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);
}
