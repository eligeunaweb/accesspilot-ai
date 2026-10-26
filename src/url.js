export function normalizeUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('URL must be a string of at most 8192 characters');
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) URLs are supported');
  if (url.username || url.password) throw new Error('URLs with credentials are not supported');
  return url.toString();
}
