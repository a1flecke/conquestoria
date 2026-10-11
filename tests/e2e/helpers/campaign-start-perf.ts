import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, CDPSession, Page } from '@playwright/test';

/**
 * #1439 phase 4: segmented, opt-in campaign-start diagnostic.
 *
 * Every timestamp is taken on the PAGE's own clock (an init-script recorder), never from Playwright
 * round trips, so the intervals measure the application and not the test driver. Human decision
 * time (choosing a challenge level) sits between `promptVisible` and `confirmClick` and is
 * deliberately excluded from every reported interval.
 *
 * Nothing here gates anything: it only produces numbers, and the callers assert only that the
 * measurement was well formed.
 */

/** `CONQUESTORIA_CS_FIXTURE` points the diagnostic at another legacy-style save (e.g. a many-civ game). */
const FIXTURE_TEXT = readFileSync(
  process.env.CONQUESTORIA_CS_FIXTURE
    ?? join(__dirname, '..', '..', 'fixtures', 'issue-365-crowded-map-save.json'),
  'utf8',
);

export interface CampaignStartRecorder {
  events: Array<{ name: string; t: number }>;
  longTasks: Array<{ start: number; duration: number }>;
  idb: Array<{ mode: string; start: number; end: number; outcome: string }>;
  blob: { created: number; revoked: number; firstCreate: number | null; lastRevoke: number | null; revokeTimes: number[] };
  paint: { first: number | null; count: number };
}

type RecorderWindow = typeof window & { __cs?: CampaignStartRecorder };

/** Installed before any app code. Polls cheap DOM facts every 10 ms so transitions get a page timestamp. */
export async function installCampaignStartRecorder(page: Page, resetStorage: boolean): Promise<void> {
  await page.addInitScript(({ fixtureText, resetStorage: reset }) => {
    const w = window as RecorderWindow;
    if (w.__cs) return;
    const cs: CampaignStartRecorder = {
      events: [],
      longTasks: [],
      idb: [],
      blob: { created: 0, revoked: 0, firstCreate: null, lastRevoke: null, revokeTimes: [] },
      paint: { first: null, count: 0 },
    };
    w.__cs = cs;
    const mark = (name: string) => cs.events.push({ name, t: performance.now() });

    if (reset) {
      // Fresh storage on every load: queued before the app's own open, so IndexedDB processes the
      // delete first. Gives a warm-HTTP-cache sample the same legacy-prompt flow as a cold one.
      try { indexedDB.deleteDatabase('conquestoria'); } catch { /* storage unavailable */ }
      localStorage.setItem('conquestoria-autosave', fixtureText);
    }

    document.addEventListener('click', event => {
      const el = event.target instanceof Element ? event.target.closest('button') : null;
      if (el) mark(`click:${(el.textContent ?? '').trim().slice(0, 40)}|${el.closest('#required-choice-panel') ? 'required-choice' : ''}`);
    }, true);

    const seen = new Set<string>();
    const first = (key: string, on: boolean) => {
      if (on !== seen.has(key)) {
        if (on) seen.add(key); else seen.delete(key);
        mark(`${key}:${on ? 'on' : 'off'}`);
      }
    };
    const visible = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    setInterval(() => {
      first('savePanel', document.getElementById('save-panel') !== null);
      first('challengePrompt', visible('legacy-opponent-challenge-prompt'));
      first('requiredChoice', visible('required-choice-panel'));
      first('spriteOverlay', document.getElementById('sprite-overlay') !== null);
      first('canvasVisible', visible('game-canvas'));
    }, 10);

    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) cs.longTasks.push({ start: entry.startTime, duration: entry.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch { /* longtask unsupported */ }

    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      cs.blob.created += 1;
      cs.blob.firstCreate ??= performance.now();
      return originalCreate(obj);
    };
    URL.revokeObjectURL = (url: string) => {
      cs.blob.revoked += 1;
      cs.blob.lastRevoke = performance.now();
      cs.blob.revokeTimes.push(cs.blob.lastRevoke);
      originalRevoke(url);
    };

    const originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function patched(this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      const tx = originalTransaction.apply(this, args);
      const start = performance.now();
      const mode = (args[1] as string | undefined) ?? 'readonly';
      for (const outcome of ['complete', 'abort', 'error'] as const) {
        tx.addEventListener(outcome, () => cs.idb.push({ mode, start, end: performance.now(), outcome }));
      }
      return tx;
    };

    const originalClearRect = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function patchedClearRect(x: number, y: number, ww: number, h: number) {
      if (this.canvas?.id === 'game-canvas') {
        cs.paint.count += 1;
        cs.paint.first ??= performance.now();
      }
      return originalClearRect.call(this, x, y, ww, h);
    };
  }, { fixtureText: FIXTURE_TEXT, resetStorage });
}

export interface ProfileFunction { name: string; file: string; selfMs: number; totalMs: number }

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  children?: number[];
}
interface CpuProfile { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] }

export function summarizeProfile(profile: CpuProfile): { functions: ProfileFunction[]; byFile: Array<{ file: string; selfMs: number }> } {
  const byId = new Map<number, ProfileNode>();
  const parent = new Map<number, number>();
  for (const node of profile.nodes) {
    byId.set(node.id, node);
    for (const child of node.children ?? []) parent.set(child, node.id);
  }
  const keyOf = (node: ProfileNode) => {
    const file = node.callFrame.url.replace(/^https?:\/\/[^/]+\/conquestoria\//, '').replace(/\?.*$/, '') || '(native)';
    return { key: `${node.callFrame.functionName || '(anonymous)'}@${file}`, name: node.callFrame.functionName || '(anonymous)', file };
  };
  const self = new Map<string, number>();
  const total = new Map<string, number>();
  const files = new Map<string, number>();
  const meta = new Map<string, { name: string; file: string }>();
  for (let i = 0; i < profile.samples.length; i += 1) {
    const delta = (profile.timeDeltas[i] ?? 0) / 1000;
    let id: number | undefined = profile.samples[i];
    const leaf = id !== undefined ? byId.get(id) : undefined;
    if (leaf) {
      const k = keyOf(leaf);
      meta.set(k.key, { name: k.name, file: k.file });
      self.set(k.key, (self.get(k.key) ?? 0) + delta);
      files.set(k.file, (files.get(k.file) ?? 0) + delta);
    }
    const counted = new Set<string>();
    while (id !== undefined) {
      const node = byId.get(id);
      if (node) {
        const k = keyOf(node);
        if (!counted.has(k.key)) {
          counted.add(k.key);
          meta.set(k.key, { name: k.name, file: k.file });
          total.set(k.key, (total.get(k.key) ?? 0) + delta);
        }
      }
      id = parent.get(id);
    }
  }
  const functions = [...total.keys()].map(key => ({
    ...meta.get(key)!,
    selfMs: Math.round((self.get(key) ?? 0) * 10) / 10,
    totalMs: Math.round((total.get(key) ?? 0) * 10) / 10,
  })).sort((a, b) => b.totalMs - a.totalMs);
  const byFile = [...files.entries()].map(([file, selfMs]) => ({ file, selfMs: Math.round(selfMs * 10) / 10 }))
    .sort((a, b) => b.selfMs - a.selfMs);
  return { functions, byFile };
}

export interface CampaignStartSample {
  scenario: string;
  cache: 'cold' | 'warm';
  reducedMotion: 'reduce' | 'no-preference';
  navigation: { domContentLoadedMs: number; loadMs: number };
  /** Page-clock intervals in ms; `null` when the transition never happened. */
  intervals: {
    /** Continue click -> legacy challenge prompt visible: save read, clone, normalize, prompt render. */
    continueToPrompt: number | null;
    /** Continue Campaign click -> save panel removed: durable persistence + enterCampaign entry. */
    confirmToEntered: number | null;
    /** Save panel removed -> first required choice visible: startGame sync work + publication + first paint. */
    enteredToChoice: number | null;
    /** Continue Campaign click -> first canvas paint. */
    confirmToFirstPaint: number | null;
    /** Continue Campaign click -> required-choice panel dismissed (genuinely interactive). */
    confirmToPlayable: number | null;
    /** Continue Campaign click -> the last sprite blob finished loading. */
    confirmToAssetsDone: number | null;
    /** Continue Campaign click -> 55% of sprite images loaded (about the at-rest set when scheduled by priority). */
    confirmToAssets55pct: number | null;
  };
  idbTransactions: number;
  idbWriteMs: number;
  /** Long-task time (>50 ms tasks) between the confirm click and playable, and in the 3 s after. */
  longTaskMsToPlayable: number;
  longTaskMsAfterPlayable3s: number;
  /** CDP deltas from the confirm click to playable. */
  taskDurationMs: number;
  scriptDurationMs: number;
  blobImages: number;
  paintsToPlayable: number;
  /** Renderer resident memory before the confirm click and after sprites settled (MB; null if unknown). */
  rendererRssMbBefore: number | null;
  rendererRssMbAfter: number | null;
}

const round = (value: number) => Math.round(value * 100) / 100;

async function metrics(cdp: CDPSession): Promise<Record<string, number>> {
  const sample = await cdp.send('Performance.getMetrics') as { metrics: Array<{ name: string; value: number }> };
  return Object.fromEntries(sample.metrics.map(metric => [metric.name, metric.value]));
}

/**
 * Resident memory (MB) of the renderer processes below `browserPid` (the test worker, whose only child
 * browser is the one under test), from `ps`.
 * Null when the browser pid is unknown or `ps` is unavailable. Images decode in the renderer, so this
 * is where sprite volume shows up (the JS heap barely moves).
 */
export function rendererRssMb(browserPid: number | undefined): number | null {
  if (!browserPid) return null;
  try {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' })
      .split('\n')
      .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map(match => ({ pid: Number(match[1]), ppid: Number(match[2]), rssKb: Number(match[3]), command: match[4]! }));
    const descendants = new Set<number>([browserPid]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const row of rows) {
        if (!descendants.has(row.pid) && descendants.has(row.ppid)) { descendants.add(row.pid); grew = true; }
      }
    }
    const kb = rows.filter(row => descendants.has(row.pid) && row.command.includes('--type=renderer'))
      .reduce((sum, row) => sum + row.rssKb, 0);
    return Math.round(kb / 1024);
  } catch {
    return null;
  }
}

export interface RunOptions {
  browser: Browser;
  baseUrl: string;
  reducedMotion: 'reduce' | 'no-preference';
  cache: 'cold' | 'warm';
  /** Attach a sampling CPU profile of confirm-click -> playable. */
  profile?: boolean;
  /** Reused context for warm samples. */
  warmContext?: import('@playwright/test').BrowserContext;
}

let currentStage = 'start';
const step = (label: string) => {
  currentStage = label;
  if (process.env.CONQUESTORIA_CS_DEBUG) console.log(`[cs-step] ${new Date().toISOString()} ${label}`);
};

export async function runCampaignStartSample(options: RunOptions): Promise<{
  sample: CampaignStartSample;
  profile?: ReturnType<typeof summarizeProfile>;
}> {
  const { browser, baseUrl, reducedMotion, cache } = options;
  const context = options.warmContext ?? await browser.newContext({ reducedMotion, baseURL: baseUrl });
  const page = await context.newPage();
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    await page.emulateMedia({ reducedMotion });
    await installCampaignStartRecorder(page, true);
    if (process.env.CONQUESTORIA_CS_DEBUG) {
      const debugCdp = await context.newCDPSession(page);
      await debugCdp.send('Debugger.enable');
      debugCdp.on('Debugger.paused', (e: { callFrames: Array<{ functionName: string; url: string; location: { lineNumber: number } }> }) => {
        console.log('[hang-stack]', JSON.stringify(e.callFrames.slice(0, 14).map(f => `${f.functionName || '(anon)'} ${f.url.replace(/.*conquestoria\//, '')}:${f.location.lineNumber}`)));
      });
      watchdog = setTimeout(() => { console.log(`[hang] stuck at ${currentStage}`); void debugCdp.send('Debugger.pause').catch(() => undefined); }, 45_000);
    }
    step('goto');
    await page.goto(baseUrl);

    const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
    step('click-continue');
    await continueButton.click();
    step('dialog');
    await page.getByRole('dialog', { name: 'Choose Opponent Challenge' }).waitFor({ state: 'visible' });
    await page.locator('[data-opponent-challenge-selector="migration"] [data-challenge="standard"]').click();

    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    if (options.profile) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
    }
    step('profiler-start');
    const rssBefore = rendererRssMb(process.pid);
    const before = await metrics(cdp);
    step('click-confirm');
    await page.getByRole('button', { name: 'Continue Campaign', exact: true }).click();
    const requiredChoices = page.locator('#required-choice-panel');
    step('wait-choice');
    await requiredChoices.waitFor({ state: 'visible', timeout: 60_000 });
    step('click-choice');
    await requiredChoices.locator('section').first().getByRole('button').first().click();
    step('wait-hidden');
    await requiredChoices.waitFor({ state: 'hidden', timeout: 60_000 });
    await page.locator('#sprite-overlay').waitFor({ state: 'attached' });
    const after = await metrics(cdp);
    let profileSummary: ReturnType<typeof summarizeProfile> | undefined;
    if (options.profile) {
      const stopped = await cdp.send('Profiler.stop') as { profile: CpuProfile };
      profileSummary = summarizeProfile(stopped.profile);
    }

    // Let background asset work finish and measure how long it keeps competing after playable.
    step('tail');
    await page.waitForTimeout(Number(process.env.CONQUESTORIA_CS_SETTLE_MS ?? 3_500));
    const recorder = await page.evaluate(() => (window as RecorderWindow).__cs!);
    const navigation = await page.evaluate(() => {
      const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      return { domContentLoadedMs: entry?.domContentLoadedEventEnd ?? 0, loadMs: entry?.loadEventEnd ?? 0 };
    });

    const last = (name: string) => [...recorder.events].reverse().find(event => event.name === name)?.t ?? null;
    const firstOf = (name: string) => recorder.events.find(event => event.name === name)?.t ?? null;
    const confirm = recorder.events.find(event => event.name.startsWith('click:Continue Campaign'))?.t ?? null;
    const continueClick = recorder.events.find(event => event.name === 'click:Continue|')?.t ?? null;
    const prompt = firstOf('challengePrompt:on');
    const entered = last('savePanel:off');
    const choice = firstOf('requiredChoice:on');
    const playable = last('requiredChoice:off');
    const delta = (a: number | null, b: number | null) => (a !== null && b !== null ? round(b - a) : null);
    const longTasksIn = (from: number | null, to: number | null) => from === null || to === null ? 0
      : round(recorder.longTasks.filter(task => task.start >= from && task.start < to).reduce((sum, task) => sum + task.duration, 0));
    const idbWrites = recorder.idb.filter(entry => entry.mode === 'readwrite' && confirm !== null && entry.start >= confirm);

    const sample: CampaignStartSample = {
      scenario: reducedMotion === 'reduce' ? 'reduced-motion' : 'motion-allowed',
      cache,
      reducedMotion,
      navigation: { domContentLoadedMs: round(navigation.domContentLoadedMs), loadMs: round(navigation.loadMs) },
      intervals: {
        continueToPrompt: delta(continueClick, prompt),
        confirmToEntered: delta(confirm, entered),
        enteredToChoice: delta(entered, choice),
        confirmToFirstPaint: delta(confirm, recorder.paint.first),
        confirmToPlayable: delta(confirm, playable),
        confirmToAssetsDone: delta(confirm, recorder.blob.lastRevoke),
        confirmToAssets55pct: delta(confirm, recorder.blob.revokeTimes[Math.floor(recorder.blob.revokeTimes.length * 0.55)] ?? null),
      },
      idbTransactions: idbWrites.length,
      idbWriteMs: round(idbWrites.reduce((sum, entry) => sum + (entry.end - entry.start), 0)),
      longTaskMsToPlayable: longTasksIn(confirm, playable),
      longTaskMsAfterPlayable3s: longTasksIn(playable, playable === null ? null : playable + 3_000),
      taskDurationMs: round(((after.TaskDuration ?? 0) - (before.TaskDuration ?? 0)) * 1000),
      scriptDurationMs: round(((after.ScriptDuration ?? 0) - (before.ScriptDuration ?? 0)) * 1000),
      blobImages: recorder.blob.created,
      paintsToPlayable: recorder.paint.count,
      rendererRssMbBefore: rssBefore,
      rendererRssMbAfter: rendererRssMb(process.pid),
    };
    await cdp.detach();
    return { sample, profile: profileSummary };
  } finally {
    if (watchdog) clearTimeout(watchdog);
    step('close-page');
    await page.close();
    step('close-context');
    if (!options.warmContext) await context.close();
  }
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function summarize(samples: CampaignStartSample[]): Record<string, { median: number; min: number; max: number }> {
  const out: Record<string, { median: number; min: number; max: number }> = {};
  const add = (key: string, values: Array<number | null>) => {
    const clean = values.filter((value): value is number => value !== null);
    if (clean.length === 0) return;
    out[key] = { median: median(clean), min: Math.min(...clean), max: Math.max(...clean) };
  };
  for (const key of Object.keys(samples[0]?.intervals ?? {}) as Array<keyof CampaignStartSample['intervals']>) {
    add(key, samples.map(sample => sample.intervals[key]));
  }
  add('taskDurationMs', samples.map(sample => sample.taskDurationMs));
  add('scriptDurationMs', samples.map(sample => sample.scriptDurationMs));
  add('longTaskMsToPlayable', samples.map(sample => sample.longTaskMsToPlayable));
  add('longTaskMsAfterPlayable3s', samples.map(sample => sample.longTaskMsAfterPlayable3s));
  add('idbWriteMs', samples.map(sample => sample.idbWriteMs));
  add('rendererRssMbAfter', samples.map(sample => sample.rendererRssMbAfter));
  add('rendererRssMbBefore', samples.map(sample => sample.rendererRssMbBefore));
  add('domContentLoadedMs', samples.map(sample => sample.navigation.domContentLoadedMs));
  add('loadMs', samples.map(sample => sample.navigation.loadMs));
  return out;
}
