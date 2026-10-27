import { randomUUID } from 'node:crypto';
import { mkdir, lstat, readFile, open, rename, unlink, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const terminal = new Set(['succeeded', 'failed', 'cancelled', 'interrupted']);
const states = new Set(['queued', 'running', ...terminal]);
function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
}
function cancelled() { return new Error('Audit queue job cancelled'); }

// One supervisor owns the directory. An abandoned lock is never stolen automatically.
// Only opaque IDs and lifecycle states are persisted; task payloads/results stay in memory.
export async function createAuditQueue({directory, maxWorkers = 2, memoryMiB = 2048, cpu = 2, maxQueued = 100} = {}) {
  integer(maxWorkers, 1, 4, 'maxWorkers');
  integer(memoryMiB, 1024, 4096, 'memoryMiB');
  integer(cpu, 1, 4, 'cpu');
  integer(maxQueued, 1, 100, 'maxQueued');
  const capacity = Math.min(maxWorkers, Math.floor(memoryMiB / 1024), cpu);
  let ownsLock = false, closing, unsafeCleanup = false;
  let root, lock, records = [], closed = false, fatal = false, active = 0;
  let serial = Promise.resolve();
  const waiting = [], running = new Set(), idle = new Set();
  async function persist() {
    if (!root) return;
    const pending = join(root, `.jobs-${randomUUID()}.tmp`);
    let file;
    try {
      file = await open(pending, 'wx', 0o600);
      await file.writeFile(JSON.stringify({schemaVersion: 1, records}));
      await file.sync();
      await file.close(); file = null;
      await rename(pending, join(root, 'jobs.json'));
    } finally {
      if (file) await file.close();
      await unlink(pending).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  function save() {
    const operation = serial.then(persist);
    serial = operation.catch(() => {
      fatal = true;
      for (const job of running) job.controller.abort();
    });
    return operation;
  }
  try {
    if (directory !== undefined) {
      if (typeof directory !== 'string' || !directory) throw new Error('Invalid queue directory');
      root = resolve(directory);
      await mkdir(root, {recursive: true, mode: 0o700});
      const stat = await lstat(root);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Queue directory must be a real directory');
      lock = join(root, '.queue-lock');
      await mkdir(lock, {mode: 0o700}); ownsLock = true;
      try {
        const path = join(root, 'jobs.json');
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) throw new Error('Invalid queue journal');
        const data = JSON.parse(await readFile(path, 'utf8'));
        if (data.schemaVersion !== 1 || Object.keys(data).sort().join() !== 'records,schemaVersion' || !Array.isArray(data.records) || data.records.length > 1000) throw new Error('Invalid queue journal');
        const ids = new Set();
        for (const row of data.records) {
          if (!row || Object.keys(row).sort().join() !== 'id,state' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.id) || ids.has(row.id) || !states.has(row.state)) throw new Error('Invalid queue journal');
          ids.add(row.id);
        }
        records = data.records.map(row => ({id: row.id, state: terminal.has(row.state) ? row.state : 'interrupted'}));
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await persist();
    }
  } catch (error) {
    // Remove only the lock acquired by this invocation.
    if (ownsLock) {
      await rmdir(lock).catch(() => {});
    }
    throw error;
  }
  function notifyIdle() {
    if (!active && !waiting.length) { for (const resolve of idle) resolve(); idle.clear(); }
  }
  function pump() {
    while (!closed && !fatal && active < capacity && waiting.length && waiting[0].ready) {
      const job = waiting.shift(); active++; running.add(job);
      void execute(job);
    }
    if (fatal) {
      for (const job of waiting.splice(0)) {
        job.row.state = 'interrupted'; job.dispose(); job.reject(new Error('Queue journal failed; queue stopped'));
      }
    }
    notifyIdle();
  }
  async function execute(job) {
    try {
      job.row.state = 'running'; await save();
      if (job.controller.signal.aborted) throw cancelled();
      const result = await job.task(job.controller.signal);
      job.row.state = job.controller.signal.aborted ? 'cancelled' : 'succeeded';
      await save();
      if (job.controller.signal.aborted) job.reject(cancelled()); else job.resolve(result);
    } catch (error) {
      if (error?.code === 'ACCESSPILOT_CLEANUP_UNVERIFIED') {
        unsafeCleanup = true;
        fatal = true;
        for (const activeJob of running) activeJob.controller.abort();
      }
      job.row.state = fatal ? 'interrupted' : job.controller.signal.aborted ? 'cancelled' : 'failed';
      try { await save(); } catch { job.row.state = 'interrupted'; }
      // Never journal or expose arbitrary task errors, which can contain session/page data.
      job.reject(new Error(job.row.state === 'cancelled' ? 'Audit queue job cancelled' : 'Audit queue job failed'));
    } finally {
      job.dispose(); running.delete(job); active--; pump();
    }
  }
  return {
    capacity,
    snapshot() { return {capacity, active, queued: waiting.length, closed, failed: fatal, records: structuredClone(records)}; },
    submit(task, {signal} = {}) {
      if (signal !== undefined && !(signal instanceof AbortSignal)) return Promise.reject(new Error('Expected an AbortSignal'));
      if (typeof task !== 'function') return Promise.reject(new Error('Expected an audit task'));
      if (closed || fatal) return Promise.reject(new Error('Audit queue is closed or failed'));
      if (signal?.aborted) return Promise.reject(cancelled());
      if (waiting.length >= maxQueued) return Promise.reject(new Error('Audit queue is full'));
      // Bounded journal; remove only terminal entries, never live work.
      while (records.length >= 1000) {
        const index = records.findIndex(row => terminal.has(row.state));
        if (index < 0) return Promise.reject(new Error('Audit queue journal is full'));
        records.splice(index, 1);
      }
      const row = {id: randomUUID(), state: 'queued'};
      records.push(row);
      const controller = new AbortController();
      return new Promise((resolve, reject) => {
        const abort = () => {
          controller.abort();
          const index = waiting.indexOf(job);
          if (index >= 0) {
            waiting.splice(index, 1); row.state = 'cancelled'; job.dispose();
            void save().then(() => reject(cancelled()), () => reject(new Error('Queue journal failed'))).finally(pump);
          }
        };
        const job = {row, controller, task, resolve, reject, dispose: () => signal?.removeEventListener('abort', abort)};
        signal?.addEventListener('abort', abort, {once: true});
        waiting.push(job);
        // Persist admission before the task can start. Pending admissions count toward capacity.
        void save().then(() => {
          if (!waiting.includes(job)) return;
          job.ready = true; pump();
        }).catch(() => {
          const index = waiting.indexOf(job);
          if (index >= 0) waiting.splice(index, 1);
          row.state = 'interrupted'; job.dispose(); reject(new Error('Queue journal failed')); pump();
        });
      });
    },
    close() {
      if (closing) return closing;
      closing = (async () => {
      closed = true;
      for (const job of waiting.splice(0)) { job.row.state = 'cancelled'; job.dispose(); job.reject(cancelled()); }
      for (const job of running) job.controller.abort();
      if (active) await new Promise(resolve => idle.add(resolve));
      await serial;
      try { await persist(); } finally { if (lock && !unsafeCleanup) await rmdir(lock); }
      if (unsafeCleanup) throw new Error('Unverified container cleanup; operator recovery required');
      })();
      return closing;
    }
  };
}
