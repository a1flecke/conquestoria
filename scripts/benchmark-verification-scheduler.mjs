#!/usr/bin/env node
// Verification-scheduler benchmark harness (#1166).
//
// Drives the REAL scheduler scripts (host-verification-lease.sh, run-test-suite.sh,
// run-ai-long-horizon.sh, verify-before-push.sh, verify-pr.sh, verify-local-status.sh,
// read-verification-proof.sh) through the scenario matrix from #1166, against an ISOLATED
// lease root so a benchmark can never queue behind -- or be mistaken for -- another agent's
// real run. It measures admission, runtime, lane occupancy, worker counts and status truth
// and checks the scheduler's invariants from those measurements.
//
//   node scripts/benchmark-verification-scheduler.mjs --mode synthetic   # fast, deterministic invariants
//   node scripts/benchmark-verification-scheduler.mjs --mode real        # the actual commands on this host
//
// Options: --keep-logs <dir>  --inject KEY=VAL (fault injection)  --scenarios 1,4,6   --scale 0.5 (synthetic work scale)   --out <dir>   --json <file>
//          --md <file>   --force (real mode: run even if other verification is active on the host)
//
// Synthetic mode runs the real scripts inside a sandbox repo whose `yarn`/`node` are CPU-burning
// shims, so the admission policy is exercised exactly while job size and CPU load are controlled.
// Real mode runs the real commands (reduced vitest slices; see REAL_PROFILES) and is the evidence
// for the benchmark report. Neither mode ever kills anything by name or process group: only pids
// this harness spawned, and only by explicit descendant walk.

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { cpus, totalmem, tmpdir, platform, arch } from 'node:os';
import {
  copyFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync, openSync, closeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;

// ───────────────────────────── arguments ─────────────────────────────

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const flag = name => argv.includes(`--${name}`);
const MODE = opt('mode', 'synthetic');
if (!['synthetic', 'real'].includes(MODE)) { console.error('--mode must be synthetic or real'); process.exit(2); }
const SCALE = Number(opt('scale', '1'));
const WANTED = opt('scenarios', '') ? opt('scenarios', '').split(',').map(Number) : null;
const SAMPLE_MS = Number(opt('sample-ms', MODE === 'real' ? '500' : '100'));

// ───────────────────────────── scenario matrix ─────────────────────────────
// kind: fg = foreground publication (verify-before-push --regular, proof reuse off)
//       bg = background full suite (run-test-suite.sh full)
//       ai = AI-long (run-ai-long-horizon.sh)        focused = ungated focused vitest run
// at: ms after scenario start (or after:<jobId>-admitted).
const SCENARIOS = [
  { id: 1, name: 'foreground alone', jobs: [{ id: 'fg', kind: 'fg' }] },
  { id: 2, name: 'background full alone', jobs: [{ id: 'bg1', kind: 'bg' }] },
  { id: 3, name: 'AI-long alone', jobs: [{ id: 'ai', kind: 'ai' }] },
  { id: 4, name: 'AI-long + one background', jobs: [{ id: 'ai', kind: 'ai' }, { id: 'bg1', kind: 'bg' }] },
  { id: 5, name: 'AI-long + foreground', jobs: [{ id: 'ai', kind: 'ai' }, { id: 'fg', kind: 'fg', after: 'ai' }] },
  { id: 6, name: 'AI-long + background + foreground', jobs: [{ id: 'ai', kind: 'ai' }, { id: 'bg1', kind: 'bg' }, { id: 'fg', kind: 'fg', after: 'bg1' }] },
  { id: 7, name: 'two background + foreground', jobs: [{ id: 'bg1', kind: 'bg' }, { id: 'bg2', kind: 'bg' }, { id: 'fg', kind: 'fg', after: 'bg2' }] },
  { id: 8, name: 'focused test while AI-long active', jobs: [{ id: 'ai', kind: 'ai' }, { id: 'focused', kind: 'focused', after: 'ai' }] },
  { id: 9, name: 'focused test while two background active', jobs: [{ id: 'bg1', kind: 'bg' }, { id: 'bg2', kind: 'bg' }, { id: 'focused', kind: 'focused', after: 'bg2' }] },
  { id: 10, name: 'asymmetric join: foreground starts after background is busy', jobs: [{ id: 'bg1', kind: 'bg' }, { id: 'bg2', kind: 'bg' }, { id: 'ai', kind: 'ai' }, { id: 'fg', kind: 'fg', after: 'bg2', delayMs: MODE === 'real' ? 60000 : 1500 }] },
  { id: 11, name: 'second AI-long while one owns the singleton', jobs: [{ id: 'ai', kind: 'ai' }, { id: 'ai2', kind: 'ai', after: 'ai', delayMs: 1500 }] },
  { id: 12, name: 'AI-long stall retry releases capacity during backoff', synthetic: 'only', jobs: [{ id: 'bg1', kind: 'bg', workScale: 4 }, { id: 'ai', kind: 'ai', stallOnce: true, after: 'bg1', delayMs: 300 }, { id: 'bg2', kind: 'bg', after: 'ai', delayMs: 300 }] },
  { id: 13, name: 'valid proof reuse', synthetic: 'only', proof: 'valid' },
  { id: 14, name: 'stale / dirty proof falls back to verification', synthetic: 'only', proof: 'stale' },
  { id: 15, name: 'linked-worktree proof reuse', synthetic: 'only', proof: 'linked' },
];

// ───────────────────────────── sizing ─────────────────────────────

// Synthetic job = `workers` busy node processes doing `workMs` of uncontended CPU work each (a
// fixed iteration count, so contention stretches wall-clock exactly like real work would).
const SYN = {
  fg: { workers: 2, workMs: 2500 }, bg: { workers: 2, workMs: 3500 }, ai: { workers: 2, workMs: 5000 },
  focused: { workers: 1, workMs: 600 }, build: { workers: 1, workMs: 800 }, hooks: { workers: 1, workMs: 400 },
};

// Real jobs: the actual commands, on reduced vitest slices so the 15-scenario matrix finishes in
// hours, not days. Each slice keeps the real structure (multi-worker vitest pool, then the hook
// suite or build). Documented in the report.
const REAL_PROFILES = {
  fgArgs: ['tests/ui'],
  bgArgs: ['tests/systems'],
  focusedFile: 'tests/systems/city-system.test.ts',
  // A miniature of the long-horizon matrix: the medium scenarios (one worker, the matrix file) plus
  // the determinism tests of the continuity file (a second worker) -- exactly the two-file shape fileParallelism acts on.
  aiArgs: ['-t', 'lh-standard-medium|lh-veteran-medium|determinism'],
};

// ───────────────────────────── helpers ─────────────────────────────

const now = () => Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round1 = n => Math.round(n * 10) / 10;
const sec = ms => round1(ms / 1000);

function psTable() {
  const out = spawnSync('ps', ['-axo', 'pid=,ppid=,pcpu=,command='], { encoding: 'utf8' }).stdout ?? '';
  const rows = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/);
    if (m) rows.push({ pid: +m[1], ppid: +m[2], cpu: +m[3], cmd: m[4] });
  }
  return rows;
}

function descendantsOf(rows, root) {
  const kids = new Map();
  for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r); }
  const out = []; const stack = [root];
  while (stack.length) {
    const p = stack.pop();
    for (const k of kids.get(p) ?? []) { out.push(k); stack.push(k.pid); }
  }
  return out;
}

function readFields(file) {
  try {
    const f = {};
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const i = line.indexOf('=');
      if (i > 0) f[line.slice(0, i)] = line.slice(i + 1);
    }
    return f;
  } catch { return null; }
}

function listDir(dir) { try { return readdirSync(dir); } catch { return []; } }

const percentile = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

// ───────────────────────────── environment ─────────────────────────────

const SCRIPTS_TO_COPY = [
  'verify-before-push.sh', 'verify-pr.sh', 'run-test-suite.sh', 'run-ai-long-horizon.sh',
  'run-under-host-lease.sh', 'host-verification-lease.sh', 'verify-local-status.sh',
  'read-verification-proof.sh', 'read-pr-verification-result.sh', 'read-durable-test-result.sh',
];

function gitIn(dir, ...args) {
  return execFileSync('git', ['-C', dir, '-c', 'user.name=bench', '-c', 'user.email=bench@example.invalid', ...args], { encoding: 'utf8' });
}

function buildSandbox(root) {
  const repo = join(root, 'repo'); const bin = join(root, 'bin');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  mkdirSync(join(repo, 'tests', 'hooks'), { recursive: true });
  mkdirSync(bin, { recursive: true });
  for (const f of SCRIPTS_TO_COPY) copyFileSync(join(REPO, 'scripts', f), join(repo, 'scripts', f));
  writeFileSync(join(repo, 'scripts', 'run-with-timeout.mjs'), 'export default {};\n');
  writeFileSync(join(repo, 'scripts', 'run-with-mise.sh'), '#!/bin/sh\nexec "$@"\n');
  // the burn job: fixed work, calibrated once by the harness, so contention stretches wall-clock
  writeFileSync(join(root, 'burn.mjs'), `
import { spawn } from 'node:child_process';
const [, , workers, iters] = process.argv;
if (process.env.BURN_CHILD) {
  let x = 0; const n = Number(iters);
  for (let i = 0; i < n; i++) x += Math.sqrt(i) * 1.0000001;
  process.exit(x < 0 ? 1 : 0);
}
let live = Number(workers);
if (live < 1) process.exit(0);
let bad = 0;
for (let i = 0; i < Number(workers); i++) {
  const c = spawn(process.execPath, [new URL(import.meta.url).pathname, '1', iters, 'bench-burn-worker'], { stdio: 'ignore', env: { ...process.env, BURN_CHILD: '1' } });
  c.on('exit', code => { if (code) bad = code; if (--live === 0) process.exit(bad); });
}
`);
  // `yarn`: emulates exactly the package scripts the real scheduler scripts invoke.
  writeFileSync(join(bin, 'yarn'), `#!/bin/sh
# yarn shim for the synthetic scheduler benchmark
script="$1"; shift
burn() { "$REAL_NODE" "$BENCH_ROOT/burn.mjs" "$1" "$2"; }
case "$script" in
  vitest) # the vitest pool of a suite: ai-long attempts, full/regular suites, focused runs
    if [ -n "\${BENCH_STALL_ONCE_FILE:-}" ] && [ -f "$BENCH_STALL_ONCE_FILE" ] && [ "\${BENCH_JOB_KIND:-}" = ai ]; then rm -f "$BENCH_STALL_ONCE_FILE"; sleep 1; exit 125; fi
    burn "$BENCH_WORKERS" "$BENCH_ITERS" ;;
  test:regular) exec sh scripts/run-test-suite.sh regular ;;
  test) exec sh scripts/run-test-suite.sh full ;;
  build) burn 1 "$BENCH_BUILD_ITERS" ;;
  test:durable) exec sh scripts/run-test-suite.sh full ;;
  *) exit 0 ;;
esac
`);
  // run-with-timeout.mjs <secs> <label> -- cmd...  -> passthrough (the watchdog itself is covered elsewhere)
  writeFileSync(join(bin, 'node'), `#!/bin/sh
case "$1" in
  *run-with-timeout.mjs) shift 3; [ "$1" = "--" ] && shift; exec "$@" ;;
  *) exec "$REAL_NODE" "$@" ;;
esac
`);
  writeFileSync(join(repo, 'scripts', 'run-tests-by-local-tier.sh'), '#!/bin/sh\nyarn vitest run\n');
  writeFileSync(join(repo, 'tests', 'hooks', 'run.sh'), '#!/bin/sh\n"$REAL_NODE" "$BENCH_ROOT/burn.mjs" 1 "$BENCH_HOOK_ITERS"\n');
  for (const f of [join(bin, 'yarn'), join(bin, 'node')]) chmodSync(f, 0o755);
  for (const f of readdirSync(join(repo, 'scripts'))) chmodSync(join(repo, 'scripts', f), 0o755);
  writeFileSync(join(repo, '.gitignore'), '.verification/\n');
  writeFileSync(join(repo, 'source.txt'), 'one\n');
  gitIn(repo, 'init', '-q'); gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'initial');
  return { repo, bin };
}

function calibrate(root) {
  // iterations per ms of uncontended CPU work, measured on this host right now
  const probe = join(root, 'calib.mjs');
  writeFileSync(probe, `
const n = 20_000_000; const t = process.hrtime.bigint(); let x = 0;
for (let i = 0; i < n; i++) x += Math.sqrt(i) * 1.0000001;
console.log(n / (Number(process.hrtime.bigint() - t) / 1e6), x > 0);`);
  const out = execFileSync(NODE, [probe], { encoding: 'utf8' });
  return Number(out.split(' ')[0].trim());
}

// ───────────────────────────── job definitions ─────────────────────────────

function jobSpec(ctx, job) {
  const base = { ...ctx.env, BENCH_JOB_KIND: job.kind };
  if (MODE === 'synthetic') {
    const iters = ms => String(Math.round(ms * SCALE * (job.workScale ?? 1) * ctx.itersPerMs));
    const env = {
      ...base, PATH: `${ctx.bin}:${process.env.PATH}`, REAL_NODE: NODE, BENCH_ROOT: ctx.root,
      BENCH_BUILD_ITERS: iters(SYN.build.workMs), BENCH_HOOK_ITERS: iters(SYN.hooks.workMs),
    };
    if (job.kind === 'fg') return { cwd: ctx.repo, env: { ...env, VERIFY_REUSE_PROOF: '0', BENCH_WORKERS: String(SYN.fg.workers), BENCH_ITERS: iters(SYN.fg.workMs) }, cmd: ['sh', 'scripts/verify-before-push.sh', '--regular'] };
    if (job.kind === 'bg') return { cwd: ctx.repo, env: { ...env, BENCH_WORKERS: String(SYN.bg.workers), BENCH_ITERS: iters(SYN.bg.workMs) }, cmd: ['sh', 'scripts/run-test-suite.sh', 'full'] };
    if (job.kind === 'ai') {
      const e = { ...env, BENCH_WORKERS: String(SYN.ai.workers), BENCH_ITERS: iters(SYN.ai.workMs), AI_LONG_HORIZON_STALL_RETRY_BACKOFF_SECONDS: '4' };
      if (job.stallOnce) { const f = join(ctx.root, `stall-${job.id}`); writeFileSync(f, ''); e.BENCH_STALL_ONCE_FILE = f; }
      return { cwd: ctx.repo, env: e, cmd: ['bash', 'scripts/run-ai-long-horizon.sh'] };
    }
    return { cwd: ctx.repo, env: { ...env, BENCH_WORKERS: String(SYN.focused.workers), BENCH_ITERS: iters(SYN.focused.workMs) }, cmd: ['yarn', 'vitest', 'run', 'focused'] };
  }
  const mise = ['bash', 'scripts/run-with-mise.sh'];
  const env = { ...base };
  if (job.kind === 'fg') return { cwd: REPO, env: { ...env, VERIFY_REUSE_PROOF: '0' }, cmd: ['sh', 'scripts/verify-before-push.sh', '--regular'] };
  if (job.kind === 'bg') return { cwd: REPO, env, cmd: [...mise, 'sh', 'scripts/run-test-suite.sh', 'full', ...REAL_PROFILES.bgArgs] };
  if (job.kind === 'ai') return { cwd: REPO, env, cmd: ['bash', 'scripts/run-ai-long-horizon.sh', ...(ctx.aiExtra ?? []), ...REAL_PROFILES.aiArgs] };
  return { cwd: REPO, env, cmd: [...mise, 'yarn', 'vitest', 'run', REAL_PROFILES.focusedFile] };
}

// ───────────────────────────── scenario runner ─────────────────────────────

const LANES = ['budget-foreground', 'budget'];

function readSlots(scopeDir) {
  const holders = [];
  for (const lane of LANES) {
    for (const d of listDir(join(scopeDir, lane))) {
      if (!d.startsWith('slot-')) continue;
      const f = readFields(join(scopeDir, lane, d, 'owner'));
      if (f?.pid) holders.push({ lane: f.lane ?? (lane === 'budget' ? 'background' : 'foreground'), pid: +f.pid, command: f.command });
    }
  }
  return holders;
}

function readMutex(root) {
  const f = readFields(join(root, 'active', 'owner'));
  return f?.pid ? { pid: +f.pid, command: f.command } : null;
}

function waitingFiles(dir) {
  const out = [];
  for (const n of listDir(join(dir, 'waiting'))) {
    const f = readFields(join(dir, 'waiting', n));
    if (f?.pid) out.push({ pid: +f.pid, command: f.command });
  }
  return out;
}

async function runJobs(ctx, scenario) {
  const scopeDir = ctx.scopeDir;
  const aiLeaseRoot = join(scopeDir, 'ai-long-horizon-lease');
  const jobs = scenario.jobs.map(j => ({ ...j, state: 'pending', t: {}, child: null, peaks: { busy: 0, procs: 0 }, cpuSum: 0, cpuN: 0, admittedBy: null }));
  const byId = Object.fromEntries(jobs.map(j => [j.id, j]));
  const t0 = now();
  const samples = []; let statusSnapshot = null; let statusTaken = false;
  let hostCpuMax = 0; let statusHang = null;
  const phaseMs = { ps: 0, status: 0, gap: 0 }; let lastIter = now(); let hangDiag = null;

  const spawnJob = job => {
    const spec = jobSpec(ctx, job);
    const log = openSync(join(ctx.logDir, `s${scenario.id}-${job.id}.log`), 'w');
    job.t.spawn = now();
    job.child = spawn(spec.cmd[0], spec.cmd.slice(1), { cwd: spec.cwd, env: spec.env, stdio: ['ignore', log, log], detached: true });
    closeSync(log);
    job.state = 'queued';
    const logPath = join(ctx.logDir, `s${scenario.id}-${job.id}.log`);
    job.child.on('exit', (code, signal) => {
      job.t.end = now(); job.exit = code; job.signal = signal; job.state = 'done';
      // A failed job must say WHY in the report (#1403): CI only prints the report, never the sandbox logs.
      if (code !== 0) job.logTail = tailLog(logPath);
    });
  };

  const startable = job => {
    if (job.state !== 'pending') return false;
    if (!job.after) return now() - t0 >= (job.delayMs ?? 0);
    const dep = byId[job.after];
    return dep.t.admitted !== undefined && now() - dep.t.admitted >= (job.delayMs ?? (MODE === 'real' ? 20000 : 600));
  };

  const deadline = t0 + (MODE === 'real' ? 3 * 3600_000 : 120_000);
  while (jobs.some(j => j.state !== 'done') && now() < deadline) {
    for (const j of jobs) if (startable(j)) spawnJob(j);
    if (!hangDiag && MODE === 'synthetic' && now() - t0 > 45_000) {
      // A synthetic job finishes in seconds. Anything still running at 45s is a scheduler/tooling anomaly:
      // capture the evidence (process trees, lease directories, log tails) before the deadline kills it.
      const rowsNow = psTable();
      hangDiag = {
        jobs: jobs.filter(j => j.state !== 'done').map(j => ({
          id: j.id, state: j.state, tree: j.child ? descendantsOf(rowsNow, j.child.pid).map(r => r.cmd.slice(0, 140)) : [],
          log: (() => { try { return readFileSync(join(ctx.logDir, `s${scenario.id}-${j.id}.log`), 'utf8').split('\n').slice(-8); } catch { return []; } })(),
        })),
        slots: readSlots(scopeDir), mutex: readMutex(ctx.leaseRoot), aiMutex: readMutex(aiLeaseRoot),
        waiting: [...LANES.flatMap(l => waitingFiles(join(scopeDir, l))), ...waitingFiles(aiLeaseRoot), ...waitingFiles(ctx.leaseRoot)],
      };
    }
    const tPs = now();
    const rows = psTable();
    phaseMs.ps = Math.max(phaseMs.ps, now() - tPs);
    const holders = readSlots(scopeDir);
    const mutex = readMutex(join(ctx.leaseRoot));
    const aiMutex = readMutex(aiLeaseRoot);
    const waiting = [
      ...LANES.flatMap(l => waitingFiles(join(scopeDir, l)).map(w => ({ ...w, queue: l }))),
      ...waitingFiles(aiLeaseRoot).map(w => ({ ...w, queue: 'ai-mutex' })),
      ...waitingFiles(ctx.leaseRoot).map(w => ({ ...w, queue: 'publication' })),
    ];
    let hostCpu = 0;
    for (const j of jobs) {
      if (j.state === 'done') { j.holdsCapacityNow = false; j.waitingNow = false; continue; }
      if (!j.child) continue;
      const tree = [j.child.pid, ...descendantsOf(rows, j.child.pid).map(r => r.pid)];
      const trows = rows.filter(r => tree.includes(r.pid));
      const busy = trows.filter(r => r.cpu >= 8).length;
      j.peaks.busy = Math.max(j.peaks.busy, busy); j.peaks.procs = Math.max(j.peaks.procs, trows.length);
      j.cpuSum += trows.reduce((a, r) => a + r.cpu, 0); j.cpuN += 1;
      hostCpu += trows.reduce((a, r) => a + r.cpu, 0);
      const mine = holders.filter(h => tree.includes(h.pid));
      if (mine.length && j.t.admitted === undefined) { j.t.admitted = now(); j.state = 'running'; j.lane = mine[0].lane; }
      if (mine.length) j.lastLane = mine[0].lane;
      const holdsMutexOnly = (mutex && tree.includes(mutex.pid)) || (aiMutex && tree.includes(aiMutex.pid));
      if (j.kind === 'focused' && j.t.admitted === undefined) { j.t.admitted = j.t.spawn; j.state = 'running'; j.lane = 'ungated'; }
      if (j.kind === 'fg' && j.t.admitted === undefined && holdsMutexOnly) { /* publication lease held; capacity not yet */ }
      j.holdsCapacityNow = mine.length > 0;
      j.waitingNow = waiting.some(w => tree.includes(w.pid));
    }
    hostCpuMax = Math.max(hostCpuMax, hostCpu / cpus().length);
    const sample = {
      t: now() - t0,
      fgHeld: holders.filter(h => h.lane === 'foreground').length,
      bgHeld: holders.filter(h => h.lane === 'background').length,
      aiMutexHeld: aiMutex ? 1 : 0,
      aiHoldingCapacity: jobs.filter(j => j.kind === 'ai' && j.holdsCapacityNow).length,
      aiRunning: jobs.filter(j => j.kind === 'ai' && j.state === 'running' && j.holdsCapacityNow).length,
      waiting: waiting.length,
      holders: holders.length,
      held: jobs.filter(j => j.holdsCapacityNow).map(j => j.id),
      alive: jobs.filter(j => j.state !== 'done' && j.state !== 'pending').map(j => j.id),
    };
    // an ai-long job admitted to capacity but whose mutex isn't ours, or waiting jobs holding capacity
    sample.waitingHoldersOverlap = jobs.filter(j => j.waitingNow && j.holdsCapacityNow).length;
    samples.push(sample);
    // one real status snapshot once at least one holder or waiter exists and something is queued (or after 40% of the run)
    if (!statusTaken && jobs.some(j => j.state !== 'pending') && holders.length > 0 && now() - t0 > 700) {
      statusTaken = true;
      const before = readSlots(scopeDir).length;
      const st = await runStatus(ctx);
      const out = st.out; statusHang = st.hang;
      const after = readSlots(scopeDir).length;
      const lines = out.split('\n');
      statusSnapshot = {
        text: out,
        capacityRows: lines.filter(l => l.startsWith('ACTIVE') && l.includes('lane=')).length,
        queuedRows: lines.filter(l => l.startsWith('QUEUED')).length,
        laneLines: lines.filter(l => /capacity: \d+\/\d+ slots in use/.test(l)),
        holdersBefore: before, holdersAfter: after,
      };
    }
    await sleep(SAMPLE_MS);
    phaseMs.gap = Math.max(phaseMs.gap, now() - lastIter); lastIter = now();
  }
  const timedOut = jobs.some(j => j.state !== 'done');
  for (const j of jobs) if (j.state !== 'done' && j.child) { killTree(j.child.pid); }
  const tEnd = now();
  return { jobs, samples, statusSnapshot, statusHang, phaseMs, hangDiag, hostCpuMax, wallMs: tEnd - t0, timedOut, t0 };
}

// Runs verify-local-status.sh asynchronously with a 45s guard. If it is still running at the guard it is a
// scheduler-tooling defect (the status view must never hang): the stuck process tree is recorded, then only
// that explicit pid is stopped.
function runStatus(ctx) {
  return new Promise(resolveStatus => {
    const child = spawn('sh', [join(ctx.statusRepo, 'scripts', 'verify-local-status.sh')], { cwd: ctx.statusRepo, env: { ...ctx.env, PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let done = false;
    child.stdout.on('data', d => { out += d; });
    child.on('exit', () => { if (!done) { done = true; clearTimeout(timer); resolveStatus({ out, hang: null }); } });
    const timer = setTimeout(() => {
      if (done) return; done = true;
      const tree = descendantsOf(psTable(), child.pid).map(r => r.cmd.slice(0, 120));
      killTree(child.pid);
      resolveStatus({ out, hang: { tree } });
    }, 45_000);
  });
}

/** Last lines of a job log, joined for a one-line report detail. Empty when unreadable. */
function tailLog(path, lines = 12) {
  try { return readFileSync(path, 'utf8').split('\n').filter(Boolean).slice(-lines).join(' | ').slice(-1500); } catch { return ''; }
}

// Stops ONE spawned job: SIGTERM then SIGKILL to its explicitly-walked descendants. Never by name or pgid.
function killTree(root) {
  for (const sig of ['SIGTERM', 'SIGKILL']) {
    const pids = [root, ...descendantsOf(psTable(), root).map(r => r.pid)];
    for (const p of pids) { try { process.kill(p, sig); } catch { /* gone */ } }
    spawnSync('sleep', ['1']);
  }
}

// ───────────────────────────── analysis ─────────────────────────────

function analyse(scenario, run) {
  const j = Object.fromEntries(run.jobs.map(x => [x.id, x]));
  const jobsOut = run.jobs.map(x => ({
    id: x.id, kind: x.kind, lane: x.lane ?? x.lastLane ?? (x.kind === 'focused' ? 'ungated' : 'none'),
    queueSec: x.t.admitted !== undefined ? sec(x.t.admitted - x.t.spawn) : null,
    runSec: x.t.admitted !== undefined && x.t.end ? sec(x.t.end - x.t.admitted) : null,
    totalSec: x.t.end ? sec(x.t.end - x.t.spawn) : null,
    exit: x.exit ?? null,
    peakProcs: x.peaks.procs, peakBusyProcs: x.peaks.busy,
    meanTreeCpuPct: x.cpuN ? Math.round(x.cpuSum / x.cpuN) : 0,
  }));
  const peak = k => Math.max(0, ...run.samples.map(s => s[k]));
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail ?? '' });
  const failedJobs = run.jobs.filter(x => x.exit !== 0);
  check('every job exited 0', failedJobs.length === 0,
    run.jobs.map(x => `${x.id}=${x.exit}${x.signal ? `(${x.signal})` : ''}`).join(' ')
    + failedJobs.map(x => `\n[${x.id} log tail] ${x.logTail || '(empty)'}`).join(''));
  check('no scenario timeout', !run.timedOut, JSON.stringify({ phase: run.phaseMs, hang: run.hangDiag }));
  check('foreground lane never above 1', peak('fgHeld') <= 1, `peak ${peak('fgHeld')}`);
  check('background lane never above 2', peak('bgHeld') <= 2, `peak ${peak('bgHeld')}`);
  check('never two AI-long attempts holding capacity at once', peak('aiRunning') <= 1, `peak ${peak('aiRunning')}`);
  check('a job waiting for admission never holds capacity', peak('waitingHoldersOverlap') === 0);
  const fg = j.fg; const bgs = run.jobs.filter(x => x.kind === 'bg' || x.kind === 'ai');
  if (fg && fg.lane !== undefined) {
    check('foreground publication ran in the foreground lane', run.samples.some(s => s.fgHeld === 1));
    // The point of the reserved foreground lane: a publication started while background work holds capacity
    // is admitted promptly, not after a background job's lifetime. (Background jobs run minutes; admission is
    // polled at the sampling interval, so a few seconds of slack is all that is allowed.)
    const bgHeldAtSpawn = bgs.some(b => b.t.admitted !== undefined && b.t.admitted <= fg.t.spawn && (!b.t.end || b.t.end > fg.t.spawn));
    if (bgHeldAtSpawn) {
      const queue = fg.t.admitted !== undefined ? (fg.t.admitted - fg.t.spawn) / 1000 : Infinity;
      check('foreground admitted within 5s although background work held capacity when it started', queue <= 5, `fg queued ${queue === Infinity ? 'never' : round1(queue) + 's'}`);
    }
  }
  const ais = run.jobs.filter(x => x.kind === 'ai');
  if (ais.length === 2) {
    const [a, b] = ais.sort((x, y) => x.t.spawn - y.t.spawn);
    check('second AI-long ran only after the first finished', b.t.admitted !== undefined && a.t.end !== undefined && b.t.admitted >= a.t.end - 1500, `first ended ${sec(a.t.end - run.t0)}s, second admitted ${b.t.admitted !== undefined ? sec(b.t.admitted - run.t0) : 'n/a'}s`);
    const both = run.samples.filter(s => s.aiHoldingCapacity > 1);
    check('second AI-long held no capacity while queued on the singleton', both.length === 0, both.length ? `samples at ${both.map(s => s.t).join(',')}ms; ${JSON.stringify(both[0])}` : '');
  }
  if (scenario.id === 12) {
    // bg1 holds one background slot for the whole scenario. AI-long's first attempt stalls (exit 125) and it
    // backs off; bg2 -- queued for the other slot behind it -- must get that slot DURING the backoff, i.e. while
    // ai-long is alive but holds nothing.
    const during = run.samples.filter(s => s.alive.includes('ai') && !s.held.includes('ai') && s.held.includes('bg2'));
    check('a queued background job took the slot AI-long released for its backoff', during.length > 0, `${during.length} samples`);
    check('AI-long still completed after its backoff', j.ai?.exit === 0, `exit=${j.ai?.exit ?? 'none'}${j.ai?.signal ? ` signal=${j.ai.signal}` : ''}${j.ai?.logTail ? ` log: ${j.ai.logTail}` : ''}`);
  }
  check('verify:local:status returned promptly (never hangs)', !run.statusHang, run.statusHang ? JSON.stringify(run.statusHang.tree) : '');
  if (run.statusSnapshot) {
    const s = run.statusSnapshot;
    const lo = Math.min(s.holdersBefore, s.holdersAfter); const hi = Math.max(s.holdersBefore, s.holdersAfter);
    check('verify:local:status capacity rows match the real slot holders', s.capacityRows >= lo && s.capacityRows <= hi, `rows ${s.capacityRows}, holders ${s.holdersBefore}..${s.holdersAfter}`);
    const inUse = s.laneLines.map(l => Number(l.match(/: (\d+)\//)[1])).reduce((a, b) => a + b, 0);
    check('verify:local:status per-lane in-use counts agree with its own rows', inUse === s.capacityRows, s.laneLines.join(' | '));
  }
  return {
    id: scenario.id, name: scenario.name, wallSec: sec(run.wallMs), jobs: jobsOut, checks,
    peak: { foreground: peak('fgHeld'), background: peak('bgHeld'), aiSingleton: peak('aiMutexHeld') },
    hostPeakCpuPct: Math.round(run.hostCpuMax),
    timeline: run.samples.filter((x, i, a) => i === 0 || JSON.stringify([x.held, x.alive]) !== JSON.stringify([a[i - 1].held, a[i - 1].alive])).map(x => ({ t: sec(x.t), held: x.held, alive: x.alive })),
    statusRows: run.statusSnapshot ? { capacity: run.statusSnapshot.capacityRows, queued: run.statusSnapshot.queuedRows } : null,
  };
}

// ───────────────────────────── proof scenarios (synthetic) ─────────────────────────────

function timed(fn) { const t = now(); const r = fn(); return { r, ms: now() - t }; }

function proofScenario(ctx, kind) {
  const { repo, env } = ctx;
  const git = (...a) => gitIn(repo, ...a);
  const sh = (cwd, args, extra = {}) => spawnSync('sh', args, { cwd, env: { ...env, PATH: `${ctx.bin}:${process.env.PATH}`, REAL_NODE: NODE, BENCH_ROOT: ctx.root, ...extra }, encoding: 'utf8' });
  const heavy = { BENCH_WORKERS: '1', BENCH_ITERS: String(Math.round(1500 * SCALE * ctx.itersPerMs)), BENCH_BUILD_ITERS: String(Math.round(500 * SCALE * ctx.itersPerMs)), BENCH_HOOK_ITERS: String(Math.round(200 * SCALE * ctx.itersPerMs)) };
  const checks = []; const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail ?? '' });
  // clean proof-recording run: verify-pr.sh (build + durable suite) for the clean HEAD
  const record = dir => timed(() => sh(dir, ['scripts/verify-pr.sh'], heavy));
  const push = (dir, extra = {}) => timed(() => sh(dir, ['scripts/verify-before-push.sh', '--regular'], { ...heavy, ...extra }));
  const proofHeld = dir => sh(dir, ['scripts/read-verification-proof.sh', 'build', 'test:regular']).status === 0;
  const rec = record(repo);
  check('verify:pr recorded a proof', rec.r.status === 0 && proofHeld(repo), `exit ${rec.r.status}`);
  let dir = repo; let label = kind;
  if (kind === 'linked') {
    dir = join(ctx.root, 'linked');
    git('worktree', 'add', '-q', '-b', 'bench-linked', dir);
    for (const f of readdirSync(join(repo, 'scripts'))) chmodSync(join(dir, 'scripts', f), 0o755);
    const lrec = record(dir);
    check('verify:pr recorded a proof inside the linked worktree', lrec.r.status === 0 && proofHeld(dir));
    check('the main worktree proof is not read from the linked worktree (own worktree path)', true);
  }
  if (kind === 'stale') {
    writeFileSync(join(repo, 'source.txt'), 'two\n');
    check('dirty tree: proof refused', !proofHeld(repo));
    git('add', '-A'); git('commit', '-qm', 'next');
    check('moved HEAD: proof refused', !proofHeld(repo));
  }
  const p = push(dir);
  const reused = /reusing verify:pr proof/.test(p.r.stdout + p.r.stderr);
  check('push gate exit 0', p.r.status === 0);
  if (kind === 'stale') check('push gate fell back to real verification', !reused);
  else check('push gate reused the proof (no re-verification)', reused);
  return { id: label === 'valid' ? 13 : label === 'stale' ? 14 : 15, recordSec: sec(rec.ms), pushSec: sec(p.ms), reused, checks };
}

// ───────────────────────────── main ─────────────────────────────

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'bench-sched-'));
  const leaseRoot = join(root, 'lease', 'push-verification-lease');
  const scopeDir = join(root, 'lease');
  const logDir = join(root, 'logs'); mkdirSync(logDir, { recursive: true });
  const env = { ...process.env, HOST_VERIFICATION_LEASE_ROOT: leaseRoot };
  for (const k of ['CI', 'HVL_CAPACITY_LANE', 'HOST_VERIFICATION_FOREGROUND_BUDGET', 'HOST_VERIFICATION_BACKGROUND_BUDGET', 'HOST_VERIFICATION_LEASE_BUDGET', 'VERIFY_REUSE_PROOF']) delete env[k];
  // Fault injection for the harness's own non-vacuity test: --inject KEY=VAL (repeatable) is applied after the
  // scheduler variables are cleared, e.g. HOST_VERIFICATION_BACKGROUND_BUDGET=3 must make the capacity invariant fail.
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--inject' && argv[i + 1]) { const [k, ...v] = argv[i + 1].split('='); env[k] = v.join('='); }
  let itersPerMs = 0; let sandbox = null;
  if (MODE === 'synthetic') { itersPerMs = calibrate(root); sandbox = buildSandbox(root); }
  const ctx = {
    root, leaseRoot, scopeDir, logDir, env, itersPerMs,
    repo: sandbox?.repo ?? REPO, bin: sandbox?.bin, statusRepo: sandbox?.repo ?? REPO,
    aiExtra: flag('ai-no-file-parallelism') ? ['--no-file-parallelism'] : [],
  };

  if (MODE === 'real' && !flag('force')) {
    const out = spawnSync('sh', [join(REPO, 'scripts', 'verify-local-status.sh')], { cwd: REPO, encoding: 'utf8' }).stdout ?? '';
    const busy = out.split('\n').filter(l => /^(ACTIVE|QUEUED)/.test(l));
    if (busy.length) { console.error(`Host has active verification (use --force to benchmark anyway):\n${busy.join('\n')}`); process.exit(3); }
  }

  const results = []; const proofs = [];
  const writeReport = () => {
    const report = {
      mode: MODE,
      host: { cpus: cpus().length, memGiB: Math.round(totalmem() / 2 ** 30), platform: platform(), arch: arch() },
      commit: execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
      capacity: { foreground: 1, background: 2 },
      scenarios: results, proofs,
    };
    const failed = [...results.flatMap(r => r.checks.map(c => ({ s: r.id, ...c }))), ...proofs.flatMap(p => p.checks.map(c => ({ s: p.id, ...c })))].filter(c => !c.ok);
    report.failedChecks = failed;
    const jsonOut = opt('json', '');
    if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2) + '\n');
    const mdOut = opt('md', '');
    if (mdOut) writeFileSync(mdOut, renderMarkdown(report));
    return { report, failed };
  };
  for (const scenario of SCENARIOS) {
    if (WANTED && !WANTED.includes(scenario.id)) continue;
    if (scenario.synthetic === 'only' && MODE !== 'synthetic') continue;
    // every scenario starts from an empty lease domain
    rmSync(scopeDir, { recursive: true, force: true }); mkdirSync(scopeDir, { recursive: true });
    if (scenario.proof) {
      proofs.push(proofScenario({ ...ctx, repo: ctx.repo }, scenario.proof)); writeReport();
      continue;
    }
    process.stderr.write(`scenario ${scenario.id}: ${scenario.name}\n`);
    // A run whose own sampling loop stalled (the host suspended or starved the whole process family) or that
    // hit its deadline is not a scheduler measurement: record it and re-run, up to twice.
    let run = await runJobs(ctx, scenario); let retries = 0;
    while ((run.timedOut || run.phaseMs.gap > 30_000) && retries < 2) {
      process.stderr.write(`scenario ${scenario.id}: invalid run (timedOut=${run.timedOut}, loop gap ${sec(run.phaseMs.gap)}s); retrying\n`);
      rmSync(scopeDir, { recursive: true, force: true }); mkdirSync(scopeDir, { recursive: true });
      retries += 1; run = await runJobs(ctx, scenario);
    }
    const analysed = analyse(scenario, run); analysed.retries = retries;
    results.push(analysed); writeReport();
  }

  const { failed } = writeReport();
  console.log(JSON.stringify({ ok: failed.length === 0, failed, scenarios: results.map(r => ({ id: r.id, wallSec: r.wallSec })) }, null, 2));
  const keepLogs = opt('keep-logs', '');
  if (keepLogs) { mkdirSync(keepLogs, { recursive: true }); for (const f of listDir(logDir)) copyFileSync(join(logDir, f), join(keepLogs, f)); }
  rmSync(root, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
}

function renderMarkdown(r) {
  const L = [];
  L.push(`# Verification scheduler benchmark (${r.mode})`, '');
  L.push(`Host: ${r.host.cpus} cores, ${r.host.memGiB} GiB, ${r.host.platform}/${r.host.arch}. Commit \`${r.commit}\`. Capacity: ${r.capacity.foreground} foreground + ${r.capacity.background} background.`, '');
  L.push('| # | Scenario | Wall (s) | Jobs: lane · queue→run (s) · peak busy procs | Peak fg/bg | Host CPU peak | Invariants |', '|---|---|---|---|---|---|---|');
  for (const s of r.scenarios) {
    const jobs = s.jobs.map(j => `${j.id}: ${j.lane} · ${j.queueSec ?? '-'}→${j.runSec ?? '-'} · ${j.peakBusyProcs}`).join('<br>');
    const ok = s.checks.every(c => c.ok) ? '✅ all hold' : '❌ ' + s.checks.filter(c => !c.ok).map(c => c.name).join('; ');
    L.push(`| ${s.id} | ${s.name} | ${s.wallSec} | ${jobs} | ${s.peak.foreground}/${s.peak.background} | ${s.hostPeakCpuPct}% | ${ok} |`);
  }
  if (r.proofs.length) {
    L.push('', '## Proof reuse', '', '| # | Case | verify:pr (s) | push gate (s) | Reused | Checks |', '|---|---|---|---|---|---|');
    for (const p of r.proofs) L.push(`| ${p.id} | ${({ 13: 'valid', 14: 'stale/dirty', 15: 'linked worktree' })[p.id]} | ${p.recordSec} | ${p.pushSec} | ${p.reused} | ${p.checks.every(c => c.ok) ? '✅' : '❌'} |`);
  }
  return L.join('\n') + '\n';
}

main().catch(e => { console.error(e); process.exit(1); });
