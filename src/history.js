import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink, readdir, lstat, rmdir } from 'node:fs/promises';
import {acquireDirectoryLock} from './directory-lock.js';
import { join, resolve } from 'node:path';
import { validateProject } from './project.js';
import { upgradeSnapshot, loadSnapshot, readSnapshotBytes } from './comparison.js';

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
async function locked(root, project, action) {
  const path = await directory(root, project);
  const lock = join(path, '.history-lock');
  await acquireDirectoryLock(lock);
  try { return await action(path); }
  finally { await rmdir(lock); }
}
export async function saveHistory(root, run) {
  // Whitelist comparison evidence. Never persist HTML, errors or arbitrary report fields.
  const snapshot = upgradeSnapshot(run);
  const data = JSON.stringify(snapshot);
  if (Buffer.byteLength(data) > 20 * 1024 * 1024) throw new Error('History snapshot exceeds 20 MiB');
  return locked(root, snapshot.project, async path => {
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
  });
}
async function records(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_[a-f0-9-]{36}\.json$/.test(entry.name))
    .map(entry => entry.name).sort().reverse();
}
export async function listHistory(root, project) {
  return locked(root, project, records);
}
export async function latestHistory(root, project) {
  return locked(root, project, async path => {
    const ids = await records(path);
    if (!ids.length) return null;
    // Corruption fails closed: never silently compare against an older successful run.
    return loadSnapshot(join(path, ids[0]));
  });
}

// Resolve record IDs under the same lock as retention; callers never supply paths.
export async function readHistory(root, project, ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 2 || ids.some(id => typeof id !== 'string')) throw new Error('Expected one or two history IDs');
  return locked(root, project, async path => {
    const available = new Set(await records(path));
    if (ids.some(id => !available.has(id))) {
      const error = new Error('History record not found'); error.code = 'HISTORY_NOT_FOUND'; throw error;
    }
    const snapshots = [];
    for (const id of ids) {
      const snapshot = await loadSnapshot(join(path, id));
      if (projectKey(snapshot.project) !== projectKey(project)) throw new Error('History record belongs to another project');
      snapshots.push(snapshot);
    }
    return snapshots;
  });
}

// Bounded analytics window. Corrupt/missing records remain explicit gaps.
export async function historyWindow(root, project) {
  return locked(root, project, async path=>{
    const ids=await records(path),rows=[];let bytes=0;
    for(const id of ids.slice(0,10)) {
      try {
        const file=join(path,id),size=(await lstat(file)).size;
        if(bytes+size>40*1024*1024) {rows.push({id,error:'budget'});continue;}
        bytes+=size;
        const snapshot=await loadSnapshot(file);
        if(projectKey(snapshot.project)!==projectKey(project)) throw new Error('Foreign record');
        rows.push({id,snapshot});
      } catch {rows.push({id,error:'invalid'});}
    }
    return {total:ids.length,rows};
  });
}

// Preview by default. Deletion is scoped to validated records of one named project.
export async function pruneHistory(root, project, {keep, apply=false} = {}) {
  if (!Number.isInteger(keep) || keep < 1 || keep > 10000) throw new Error('keep must be an integer between 1 and 10000');
  if (typeof apply !== 'boolean') throw new Error('apply must be boolean');
  return locked(root, project, async path => {
    const ids = await records(path);
    // Validate the complete plan before deleting anything. Corruption needs review.
    for (const id of ids) {
      const snapshot = await loadSnapshot(join(path, id));
      if (projectKey(snapshot.project) !== projectKey(project)) throw new Error('History record belongs to another project');
    }
    const retained = ids.slice(0, keep), removed = ids.slice(keep);
    if (apply) for (const id of removed) await unlink(join(path, id));
    return {schemaVersion:1, kind:'history-retention', applied:apply, keep, retained,
      candidates:removed, deleted:apply ? removed : []};
  });
}


// Private viewer transport: unvalidated source, never an HTTP download or canonical evidence.
// Resolve all names under the retention lock and release it before child validation.
export async function readHistorySource(root,project,ids) {
  if(!Array.isArray(ids)||ids.length<1||ids.length>2||ids.some(id=>typeof id!=='string'))throw new Error('Expected one or two history IDs');
  return locked(root,project,async path=>{
    const available=new Set(await records(path));
    if(ids.some(id=>!available.has(id))){const error=new Error('History record not found');error.code='HISTORY_NOT_FOUND';throw error;}
    const source=[];
    for(const id of ids)source.push((await readSnapshotBytes(join(path,id))).toString('base64'));
    return source;
  });
}
export async function historySourceWindow(root,project) {
  return locked(root,project,async path=>{
    const ids=await records(path),rows=[];let bytes=0;
    for(const id of ids.slice(0,10)) {
      try {
        const file=join(path,id);
        if(bytes+(await lstat(file)).size>40*1024*1024){rows.push({id,error:'budget'});continue;}
        const buffer=await readSnapshotBytes(file);
        if(bytes+buffer.length>40*1024*1024){rows.push({id,error:'budget'});continue;}
        bytes+=buffer.length;rows.push({id,source:buffer.toString('base64')});
      } catch {rows.push({id,error:'invalid'});}
    }
    return {total:ids.length,rows};
  });
}
