import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink, readdir, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateProject } from './project.js';
import { validateSnapshot, loadSnapshot } from './comparison.js';

// Scope changes share a history; comparison itself decides which pages are comparable.
export function projectKey(project) {
  const validated = validateProject(project);
  return createHash('sha256').update(validated.name).digest('hex');
}
async function directory(root, project) {
  const base = resolve(root);
  await mkdir(base, { recursive: true, mode: 0o700 });
  const path = join(base, projectKey(project));
  await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('History project path must be a real directory');
  return path;
}
export async function saveHistory(root, run) {
  // Whitelist comparison evidence. Never persist HTML, errors or arbitrary report fields.
  const snapshot = validateSnapshot(run);
  const data = JSON.stringify(snapshot);
  if (Buffer.byteLength(data) > 20 * 1024 * 1024) throw new Error('History snapshot exceeds 20 MiB');
  const path = await directory(root, snapshot.project);
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID()}.json`;
  const pending = join(path, `.${id}.tmp`);
  let file;
  try {
    file = await open(pending, 'wx', 0o600);
    await file.writeFile(data, 'utf8');
    await file.sync();
    await file.close(); file = null;
    await rename(pending, join(path, id));
    return id;
  } finally {
    if (file) await file.close();
    await unlink(pending).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
export async function listHistory(root, project) {
  const path = await directory(root, project);
  const entries = await readdir(path, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_[a-f0-9-]{36}\.json$/.test(entry.name))
    .map(entry => entry.name).sort().reverse();
}
export async function latestHistory(root, project) {
  const ids = await listHistory(root, project);
  if (!ids.length) return null;
  // Corruption fails closed: never silently compare against an older successful run.
  return loadSnapshot(join(resolve(root), projectKey(project), ids[0]));
}
