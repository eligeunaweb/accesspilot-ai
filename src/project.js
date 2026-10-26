import { normalizeUrl } from './url.js';
import { validateNetwork, createNetworkPolicy } from './network-policy.js';
import { languageCode } from './i18n.js';
import { open } from 'node:fs/promises';
import { validateAuthentication } from './session.js';
import { validateViewports } from './viewport.js';

export const MAX_CONFIG_BYTES = 1024 * 1024;
export { normalizeUrl } from './url.js';

function integer(value, fallback, min, max, key) {
  const result = value === undefined ? fallback : value;
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`${key} must be an integer between ${min} and ${max}`);
  return result;
}

function validateCrawl(input, seedCount) {
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new Error('crawl must be an object');
  const keys=['maxPages','maxDepth','maxLinksPerPage','maxRequestsPerPage','maxRedirects','maxBytesPerPage','maxDurationMs','excludePaths','followFragments'];
  for(const key of Object.keys(input)) if(!keys.includes(key)) throw new Error(`Unknown crawl property: ${key}`);
  const excludePaths=input.excludePaths ?? ['/logout','/signout','/delete'];
  if(!Array.isArray(excludePaths)||excludePaths.length>50||excludePaths.some(p=>typeof p!=='string'||!p.startsWith('/')||p.length>2000||/[?#\\\x00-\x1f]/.test(p))) throw new Error('excludePaths must contain at most 50 absolute path prefixes');
  if(input.followFragments!==undefined&&typeof input.followFragments!=='boolean') throw new Error('followFragments must be boolean');
  const result={followFragments:input.followFragments ?? false,maxPages:integer(input.maxPages,Math.max(seedCount,20),seedCount,100,'maxPages'),
    maxDepth:integer(input.maxDepth,2,0,5,'maxDepth'),maxLinksPerPage:integer(input.maxLinksPerPage,200,1,500,'maxLinksPerPage'),
    maxRequestsPerPage:integer(input.maxRequestsPerPage,200,1,1000,'maxRequestsPerPage'),maxRedirects:integer(input.maxRedirects,5,0,10,'maxRedirects'),
    maxBytesPerPage:integer(input.maxBytesPerPage,16*1024*1024,65536,64*1024*1024,'maxBytesPerPage'),
    maxDurationMs:integer(input.maxDurationMs,120000,1000,900000,'maxDurationMs'),excludePaths:[...new Set(excludePaths)].sort()};
  return result;
}

export function validateProject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Project must be a JSON object');
  const allowed = new Set(['schemaVersion', 'name', 'urls', 'concurrency', 'timeoutMs', 'language', 'crawl', 'network','viewports','authentication']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new Error(`Unknown project property: ${key}`);
  if (input.schemaVersion !== 1) throw new Error('Project schemaVersion must be 1');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120 || /[\x00-\x1f\x7f]/.test(input.name)) throw new Error('Project name must contain 1–120 printable characters');
  if (!Array.isArray(input.urls) || input.urls.length < 1 || input.urls.length > 100) throw new Error('Project urls must contain 1–100 URLs');
  const urls=[...new Set(input.urls.map(normalizeUrl))];
  const viewports=input.viewports===undefined?undefined:validateViewports(input.viewports);
  const crawl=input.crawl===undefined?undefined:validateCrawl(input.crawl,urls.length);
  if((crawl?.maxPages??urls.length)*(viewports?.length??1)>100) throw new Error('Project is limited to 100 page/viewport combinations');
  const network=input.authentication!==undefined||input.crawl!==undefined||input.network!==undefined ? validateNetwork(input.network) : undefined;
  if(network) {const policy=createNetworkPolicy(urls,network);for(const url of urls) policy.check(url,true);}
  const authentication=input.authentication===undefined?undefined:validateAuthentication(input.authentication,urls,network);
  return {
    ...(authentication?{authentication}:{}),
    ...(crawl ? {crawl} : {}),
    ...(viewports ? {viewports} : {}),
    ...(input.authentication!==undefined || input.crawl !== undefined || input.network !== undefined ? {network} : {}),
    schemaVersion: 1, name: input.name.trim(), language:languageCode(input.language),
    urls,
    concurrency: integer(input.concurrency, 1, 1, 4, 'concurrency'),
    timeoutMs: integer(input.timeoutMs, 30000, 1000, 120000, 'timeoutMs')
  };
}
export async function readConfiguration(path, label='Project') {
  // Read a bounded buffer, rather than loading an arbitrarily large input file.
  const file = await open(path, 'r');
  try {
    if (!(await file.stat()).isFile()) throw new Error(`${label} path must be a file`);
    const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > MAX_CONFIG_BYTES) throw new Error(`${label} configuration exceeds 1 MiB`);
    let input;
    try { input = JSON.parse(buffer.subarray(0, size).toString('utf8').replace(/^\uFEFF/, '')); }
    catch { throw new Error(`${label} configuration must be valid JSON`); }
    return input;
  } finally { await file.close(); }
}
export async function loadProject(path) {
  return validateProject(await readConfiguration(path));
}
