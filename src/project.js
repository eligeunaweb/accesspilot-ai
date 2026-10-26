import { languageCode } from './i18n.js';
import { open } from 'node:fs/promises';

export const MAX_CONFIG_BYTES = 1024 * 1024;
export function normalizeUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('URL must be a string of at most 8192 characters');
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) URLs are supported');
  if (url.username || url.password) throw new Error('URLs with credentials are not supported');
  return url.toString();
}
function integer(value, fallback, min, max, key) {
  const result = value === undefined ? fallback : value;
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`${key} must be an integer between ${min} and ${max}`);
  return result;
}
export function validateProject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Project must be a JSON object');
  const allowed = new Set(['schemaVersion', 'name', 'urls', 'concurrency', 'timeoutMs', 'language']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new Error(`Unknown project property: ${key}`);
  if (input.schemaVersion !== 1) throw new Error('Project schemaVersion must be 1');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120 || /[\x00-\x1f\x7f]/.test(input.name)) throw new Error('Project name must contain 1–120 printable characters');
  if (!Array.isArray(input.urls) || input.urls.length < 1 || input.urls.length > 100) throw new Error('Project urls must contain 1–100 URLs');
  return {
    schemaVersion: 1, name: input.name.trim(), language:languageCode(input.language),
    urls: [...new Set(input.urls.map(normalizeUrl))],
    concurrency: integer(input.concurrency, 1, 1, 4, 'concurrency'),
    timeoutMs: integer(input.timeoutMs, 30000, 1000, 120000, 'timeoutMs')
  };
}
export async function loadProject(path) {
  // Read a bounded buffer, rather than loading an arbitrarily large input file.
  const file = await open(path, 'r');
  try {
    if (!(await file.stat()).isFile()) throw new Error('Project path must be a file');
    const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > MAX_CONFIG_BYTES) throw new Error('Project configuration exceeds 1 MiB');
    let input;
    try { input = JSON.parse(buffer.subarray(0, size).toString('utf8').replace(/^\uFEFF/, '')); }
    catch { throw new Error('Project configuration must be valid JSON'); }
    return validateProject(input);
  } finally { await file.close(); }
}
