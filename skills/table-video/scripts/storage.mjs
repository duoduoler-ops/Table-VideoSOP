import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { setTimeout as delay } from 'node:timers/promises';

export const CONTROL = '00_本期控制';
const STORE = `${CONTROL}/.storage`;
const LOCK = `${CONTROL}/.workflow-lock`;
const PENDING = `${STORE}/pending.json`;
const TARGETS = Object.freeze({
  state: `${CONTROL}/state.json`,
  qa: '06_审片与QA/QA状态表.md',
  plan: `${CONTROL}/制作大段表.md`,
});
const WRITE_ORDER = ['qa', 'state', 'plan'];
const PHASES = new Set(['before-journal', 'after-journal', 'after-qa', 'after-state', 'after-plan']);
const PROCESS_START = `${new Date(Date.now() - process.uptime() * 1000).toISOString()}:${randomUUID()}`;
const lockContext = new AsyncLocalStorage();

function failure(code, message, details = {}) {
  return Object.assign(new Error(message), { code, ...details });
}
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function rootKey(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
function parseJson(value, code, label) {
  try { return JSON.parse(value.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw failure(code, `${label} is not valid JSON.`); }
}
async function statIfPresent(file) {
  try { return await fs.lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// All persistent paths are fixed descendants. Check every existing component,
// including project ancestors: a junction cannot silently redirect control files.
async function checkedPath(projectRoot, relative = '') {
  if (typeof projectRoot !== 'string' || !projectRoot) throw failure('PATH_INVALID', 'A project directory is required.');
  const root = path.resolve(projectRoot);
  const target = path.resolve(root, relative);
  const below = path.relative(root, target);
  if (below === '..' || below.startsWith(`..${path.sep}`) || path.isAbsolute(below)) {
    throw failure('PATH_ESCAPE', 'Path is outside the project.');
  }
  const parsed = path.parse(target);
  let current = parsed.root;
  const parts = target.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    const info = await statIfPresent(current);
    if (!info) continue;
    if (info.isSymbolicLink()) throw failure('PATH_REDIRECTED', 'Symbolic links and directory junctions are not supported in storage paths.', { path: current });
    if (index < parts.length - 1 && !info.isDirectory()) throw failure('PATH_NOT_DIRECTORY', 'An intermediate storage path is not a directory.', { path: current });
  }
  const rootInfo = await statIfPresent(root);
  if (!rootInfo?.isDirectory()) throw failure('PROJECT_NOT_FOUND', 'The project directory must already exist.', { path: root });
  return target;
}
async function ensureDirectory(projectRoot, relative) {
  await checkedPath(projectRoot, relative);
  let current = '';
  for (const part of relative.split('/').filter(Boolean)) {
    current = current ? `${current}/${part}` : part;
    const destination = await checkedPath(projectRoot, current);
    try { await fs.mkdir(destination); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = await fs.lstat(destination);
    if (info.isSymbolicLink() || !info.isDirectory()) throw failure('PATH_REDIRECTED', 'Storage directory has been redirected or replaced.', { path: destination });
  }
}
async function readOptional(projectRoot, relative) {
  const file = await checkedPath(projectRoot, relative);
  const info = await statIfPresent(file);
  if (!info) return null;
  if (!info.isFile()) throw failure('PATH_NOT_FILE', 'Expected a regular file.', { path: file });
  return fs.readFile(file);
}
async function syncDirectory(directory) {
  // Windows does not expose directory fsync through Node. File flush + same-volume
  // rename is retained; unsupported rename is an error, never an overwrite fallback.
  if (process.platform === 'win32') return;
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
async function atomicWrite(projectRoot, relative, contents) {
  const directory = path.posix.dirname(relative);
  await ensureDirectory(projectRoot, directory);
  const destination = await checkedPath(projectRoot, relative);
  const existing = await statIfPresent(destination);
  if (existing && !existing.isFile()) throw failure('PATH_NOT_FILE', 'Cannot replace a non-file storage target.', { path: destination });
  const temporaryRelative = `${relative}.${randomUUID()}.tmp`;
  const temporary = await checkedPath(projectRoot, temporaryRelative);
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await checkedPath(projectRoot, relative);
    await fs.rename(temporary, destination);
    await syncDirectory(path.dirname(destination));
  } finally {
    if (handle) await handle.close();
    // Only this invocation's exact temporary file is disposable.
    await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

function processStatus(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'unknown';
  try { process.kill(pid, 0); return 'alive'; }
  catch (error) { return error.code === 'ESRCH' ? 'dead' : 'unknown'; }
}
async function readOwner(projectRoot) {
  const raw = await readOptional(projectRoot, `${LOCK}/owner.json`);
  if (!raw) throw failure('LOCK_OWNER_UNKNOWN', 'Lock owner is missing; automatic takeover is unsafe.');
  const owner = parseJson(raw, 'LOCK_OWNER_UNKNOWN', 'Lock owner');
  if (!owner || typeof owner.token !== 'string' || typeof owner.hostname !== 'string' ||
      typeof owner.processStart !== 'string' || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 ||
      owner.project !== rootKey(projectRoot)) {
    throw failure('LOCK_OWNER_UNKNOWN', 'Lock owner identity is incomplete or belongs to a different project.');
  }
  return owner;
}
async function archiveDeadLock(projectRoot, observed) {
  const claim = await checkedPath(projectRoot, `${LOCK}/recovery.claim`);
  let claimHandle;
  try { claimHandle = await fs.open(claim, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw failure('LOCK_RECOVERY_IN_PROGRESS', 'Another recovery claim exists; its ownership must be resolved.');
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  let archived = false;
  try {
    await claimHandle.writeFile(JSON.stringify({ pid: process.pid, hostname: os.hostname(), processStart: PROCESS_START, at: new Date().toISOString() }));
    await claimHandle.sync();
    await claimHandle.close();
    claimHandle = undefined;
    const owner = await readOwner(projectRoot);
    if (owner.token !== observed.token || owner.hostname !== os.hostname() || processStatus(owner.pid) !== 'dead') return false;
    await ensureDirectory(projectRoot, `${STORE}/recovered-locks`);
    const archive = await checkedPath(projectRoot, `${STORE}/recovered-locks/${randomUUID()}`);
    await fs.rename(await checkedPath(projectRoot, LOCK), archive);
    archived = true;
    return true;
  } finally {
    if (claimHandle) await claimHandle.close();
    if (!archived) await fs.unlink(claim).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
async function assertOwnedLock(projectRoot) {
  const token = lockContext.getStore()?.get(rootKey(projectRoot));
  if (!token) throw failure('LOCK_REQUIRED', 'commitFiles and recoverFiles must run inside withProjectLock.');
  const owner = await readOwner(projectRoot);
  if (owner.token !== token || owner.pid !== process.pid || owner.processStart !== PROCESS_START) {
    throw failure('LOCK_LOST', 'The storage lock no longer belongs to this operation.');
  }
}

export async function withProjectLock(projectRoot, callback) {
  const key = rootKey(projectRoot);
  if (lockContext.getStore()?.has(key)) throw failure('LOCK_REENTRANT', 'Do not acquire a second lock inside the same project operation.');
  await ensureDirectory(projectRoot, CONTROL);
  const lockDirectory = await checkedPath(projectRoot, LOCK);
  const deadline = Date.now() + 2000;
  const owner = { project: key, hostname: os.hostname(), pid: process.pid, processStart: PROCESS_START,
    token: randomUUID(), operationId: randomUUID(), acquiredAt: new Date().toISOString() };
  for (;;) {
    try { await fs.mkdir(lockDirectory); break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    let existing;
    try { existing = await readOwner(projectRoot); }
    catch (error) {
      // An active acquirer may be between mkdir and writing owner.json. Give it a
      // bounded opportunity to finish, without ever reclaiming an unknown owner.
      if (error.code === 'LOCK_OWNER_UNKNOWN' && Date.now() < deadline) { await delay(25); continue; }
      throw error;
    }
    if (existing.hostname !== os.hostname()) throw failure('LOCK_FOREIGN_HOST', 'A lock from another host cannot be reclaimed automatically.');
    const status = processStatus(existing.pid);
    if (status === 'dead') {
      if (await archiveDeadLock(projectRoot, existing)) continue;
    } else if (status === 'unknown') {
      throw failure('LOCK_OWNER_UNKNOWN', 'The lock owner process cannot be checked safely.');
    }
    if (Date.now() >= deadline) throw failure('LOCK_BUSY', 'A live writer holds the project lock.');
    await delay(25);
  }
  const ownerPath = await checkedPath(projectRoot, `${LOCK}/owner.json`);
  try {
    const handle = await fs.open(ownerPath, 'wx', 0o600);
    try { await handle.writeFile(`${JSON.stringify(owner, null, 2)}\n`); await handle.sync(); }
    finally { await handle.close(); }
  } catch (error) {
    // Preserve an uncertain lock rather than deleting something another process
    // may have changed. A missing owner is reported on the next attempt.
    throw failure('LOCK_CREATE_FAILED', 'Could not record lock ownership.', { causeCode: error.code });
  }
  const context = new Map(lockContext.getStore() || []);
  context.set(key, owner.token);
  try { return await lockContext.run(context, callback); }
  finally {
    const current = await readOwner(projectRoot);
    if (current.token !== owner.token) throw failure('LOCK_LOST', 'Refusing to release a different writer lock.');
    await fs.unlink(ownerPath);
    await fs.rmdir(lockDirectory);
  }
}

function validateJournal(journal) {
  if (!journal || journal.format !== 1 || typeof journal.transactionId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(journal.transactionId) || typeof journal.createdAt !== 'string' ||
      !Array.isArray(journal.entries) || journal.entries.length !== 3) {
    throw failure('JOURNAL_INVALID', 'Pending transaction has an unsupported structure.');
  }
  const seen = new Set();
  for (const entry of journal.entries) {
    if (!entry || !Object.hasOwn(TARGETS, entry.id) || seen.has(entry.id) || entry.target !== TARGETS[entry.id]) {
      throw failure('JOURNAL_INVALID', 'Pending transaction must contain exactly the three fixed targets.');
    }
    seen.add(entry.id);
    if (typeof entry.content !== 'string' || entry.sha256 !== digest(entry.content) ||
        !(entry.previousHash === null || /^[0-9a-f]{64}$/.test(entry.previousHash))) {
      throw failure('JOURNAL_INVALID', 'Pending transaction content or digest is invalid.');
    }
  }
  const state = parseJson(journal.entries.find(item => item.id === 'state').content, 'JOURNAL_INVALID', 'Pending state');
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw failure('JOURNAL_INVALID', 'Pending state must be an object.');
  return journal;
}
async function readJournal(projectRoot) {
  const raw = await readOptional(projectRoot, PENDING);
  return raw ? validateJournal(parseJson(raw, 'JOURNAL_INVALID', 'Pending transaction')) : null;
}
export async function inspectPending(projectRoot) {
  const journal = await readJournal(projectRoot);
  return journal ? { requiresRecovery: true, transactionId: journal.transactionId, createdAt: journal.createdAt,
    targets: journal.entries.map(entry => entry.target) } : null;
}
export async function readState(projectRoot) {
  const pending = await inspectPending(projectRoot);
  if (pending) throw failure('RECOVERY_REQUIRED', 'A prepared transaction must be recovered before reading authoritative state.', pending);
  const raw = await readOptional(projectRoot, TARGETS.state);
  if (!raw) return null;
  const state = parseJson(raw, 'STATE_INVALID', 'State');
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw failure('STATE_INVALID', 'State must be an object.');
  return state;
}
async function finishJournal(projectRoot, journal, recovered) {
  await ensureDirectory(projectRoot, `${STORE}/history`);
  const archive = await checkedPath(projectRoot, `${STORE}/history/${journal.transactionId}.${recovered ? 'recovered' : 'completed'}.json`);
  if (await statIfPresent(archive)) throw failure('JOURNAL_CONFLICT', 'A transaction archive with the same ID already exists.');
  await fs.rename(await checkedPath(projectRoot, PENDING), archive);
  await syncDirectory(path.dirname(archive));
}
async function checkTargetVersions(projectRoot, journal) {
  // Redo may replace only the captured old version or the exact prepared version.
  // A user edit after interruption is a conflict, not permission to overwrite it.
  for (const entry of journal.entries) {
    const current = await readOptional(projectRoot, entry.target);
    const hash = current === null ? null : digest(current);
    if (hash !== entry.previousHash && hash !== entry.sha256) {
      throw failure('RECOVERY_CONFLICT', 'A transaction target was independently changed; preserve it and resolve the conflict.', { target: entry.target });
    }
  }
}

export async function commitFiles(projectRoot, { state, qaMarkdown, planMarkdown }, { fault } = {}) {
  await assertOwnedLock(projectRoot);
  if (!state || typeof state !== 'object' || Array.isArray(state) || typeof qaMarkdown !== 'string' || typeof planMarkdown !== 'string') {
    throw failure('COMMIT_INVALID', 'State, QA Markdown and plan Markdown are required.');
  }
  if (fault !== undefined && (state.testOnly !== true || process.env.TABLE_VIDEO_TEST_FAULTS !== '1')) {
    throw failure('FAULT_NOT_ALLOWED', 'Fault injection requires testOnly state and TABLE_VIDEO_TEST_FAULTS=1.');
  }
  if (fault !== undefined && typeof fault !== 'function' && !PHASES.has(fault)) throw failure('FAULT_INVALID', 'Unknown test fault phase.');
  const inject = async phase => {
    if (typeof fault === 'function') await fault(phase);
    else if (fault === phase) throw failure('TEST_FAULT', `Injected interruption at ${phase}.`, { phase });
  };
  if (await readJournal(projectRoot)) throw failure('RECOVERY_REQUIRED', 'Recover the existing transaction before preparing another.');
  const transactionId = randomUUID();
  const contents = { state: `${JSON.stringify(state, null, 2)}\n`, qa: qaMarkdown, plan: planMarkdown };
  const entries = [];
  const snapshotDirectory = `${STORE}/snapshots/${transactionId}`;
  await ensureDirectory(projectRoot, snapshotDirectory);
  for (const id of ['state', 'qa', 'plan']) {
    const previous = await readOptional(projectRoot, TARGETS[id]);
    entries.push({ id, target: TARGETS[id], previousHash: previous === null ? null : digest(previous),
      content: contents[id], sha256: digest(contents[id]) });
    if (previous !== null) await atomicWrite(projectRoot, `${snapshotDirectory}/${id}.previous`, previous);
  }
  const journal = { format: 1, transactionId, createdAt: new Date().toISOString(), entries };
  await atomicWrite(projectRoot, `${snapshotDirectory}/manifest.json`, `${JSON.stringify({ transactionId,
    files: entries.map(({ id, target, previousHash }) => ({ id, target, previousHash })) }, null, 2)}\n`);
  await inject('before-journal');
  await checkTargetVersions(projectRoot, journal);
  await atomicWrite(projectRoot, PENDING, `${JSON.stringify(journal, null, 2)}\n`);
  await inject('after-journal');
  for (const id of WRITE_ORDER) {
    await assertOwnedLock(projectRoot);
    const entry = entries.find(item => item.id === id);
    await atomicWrite(projectRoot, entry.target, entry.content);
    await inject(`after-${id}`);
  }
  await finishJournal(projectRoot, journal, false);
  return { transactionId, revision: state.revision };
}

export async function recoverFiles(projectRoot) {
  await assertOwnedLock(projectRoot);
  const journal = await readJournal(projectRoot);
  if (!journal) return { recovered: false };
  await checkTargetVersions(projectRoot, journal);
  for (const id of WRITE_ORDER) {
    await assertOwnedLock(projectRoot);
    const entry = journal.entries.find(item => item.id === id);
    await atomicWrite(projectRoot, entry.target, entry.content);
  }
  await finishJournal(projectRoot, journal, true);
  return { recovered: true, transactionId: journal.transactionId };
}
