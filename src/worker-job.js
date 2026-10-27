import {fields} from './worker-protocol.js';
import {validateProject,normalizeUrl} from './project.js';
import {createNetworkPolicy} from './network-policy.js';
import {validateSessionState} from './session.js';

export function validateJob(input) {
  fields(input,['url','scopeUrls','network','timeoutMs','language','crawl','viewport','authentication','sessionState','journey']);
  const url=normalizeUrl(input.url);
  const project=validateProject({schemaVersion:1,name:'Isolated worker',urls:input.scopeUrls===undefined?[url]:input.scopeUrls,network:input.network===undefined?{}:input.network,
    timeoutMs:input.timeoutMs,language:input.language,...(input.crawl!==undefined?{crawl:input.crawl}:{}),
    ...(input.viewport!==undefined?{viewports:[input.viewport]}:{}),...(input.journey!==undefined?{journeys:[input.journey]}:{}),...(input.authentication!==undefined?{authentication:input.authentication}:{})});
  createNetworkPolicy(project.urls,project.network).check(url,true);
  if(project.crawl?.maxBytesPerPage>16*1024*1024)throw new Error('Worker response budget cannot exceed 16 MiB');
  const state=input.sessionState===undefined?undefined:validateSessionState(input.sessionState,project);
  if(project.authentication&&!state)throw new Error('Authenticated worker requires session state');
  const result={url,scopeUrls:project.urls,network:project.network,timeoutMs:project.timeoutMs,language:project.language,
    ...(project.crawl?{crawl:project.crawl}:{}),...(project.viewports?{viewport:project.viewports[0]}:{}),
    ...(project.journeys?{journey:project.journeys[0]}:{}),...(project.authentication?{authentication:project.authentication,sessionState:state}:{})};
  if(Buffer.byteLength(JSON.stringify(result))>1024*1024)throw new Error('Worker job exceeds 1 MiB');
  return result;
}
