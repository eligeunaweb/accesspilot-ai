import {createAuditQueue} from '../src/audit-queue.js';

const args=process.argv.slice(2);
let queue;
const controller=new AbortController(),cancel=()=>controller.abort();
process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
try {
  if(args[0]!=='--job-store'||!args[1]||args[1].startsWith('--'))throw new Error('Usage: node scripts/recover-workers.js --job-store DIRECTORY [--resource-store SHARED_DIRECTORY] [--apply]');
  let resourceDirectory,apply=false;
  for(let i=2;i<args.length;i++) {
    if(args[i]==='--apply'&&!apply)apply=true;
    else if(args[i]==='--resource-store'&&resourceDirectory===undefined&&args[i+1]&&!args[i+1].startsWith('--'))resourceDirectory=args[++i];
    else throw new Error('Usage: node scripts/recover-workers.js --job-store DIRECTORY [--resource-store SHARED_DIRECTORY] [--apply]');
  }
  queue=await createAuditQueue({directory:args[1],recovery:true,resourceDirectory});
  const report=await queue.recoverWorkers({apply,signal:controller.signal});
  console.log(JSON.stringify(report,null,2));
} catch (error) {console.error('Worker recovery failed: '+error.message);process.exitCode=2;}
finally {
  try {if(queue)await queue.close();}
  catch {console.error('Recovery incomplete; preserve job store and investigate ownership before retrying');process.exitCode=2;}
  process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);
}
