import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { createNewGame } from '../../../src/core/game-state';
import { allSfxEntries } from '../../../src/audio/sfx-catalog';
import { TERRAIN_TILES } from '../../../src/renderer/terrain/terrain-tiles';
import { NATURAL_WONDER_TILES } from '../../../src/renderer/terrain/wonder-tiles';
import { rendererRssMb } from './campaign-start-perf';

/** Opt-in #1439 investigation. No production hooks, thresholds, strong image/buffer references,
 * unbounded polling or forced GC outside this diagnostic. All sizes are MiB, not decimal MB. */
type Experiment = 'baseline' | 'uninstrumented' | 'no-audio' | 'no-sfx' | 'no-music' | 'serial-audio' | 'no-playback' | 'no-terrain' | 'no-wonders' | 'no-overlay' | 'no-canvas';
type Motion = 'reduce' | 'no-preference';
interface ProcessRow { pid: number; ppid: number; rssMiB: number; kind: string }

function processRows(): ProcessRow[] {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' }).split('\n')
    .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map(m => ({ pid: Number(m[1]), ppid: Number(m[2]), rssMiB: Number(m[3]) / 1024,
      kind: m[4]!.match(/--type=([^ ]+)/)?.[1] ?? 'browser-or-driver' }));
  const descendants = new Set([process.pid]);
  let previous = 0;
  while (previous !== descendants.size) {
    previous = descendants.size;
    for (const row of rows) if (descendants.has(row.ppid)) descendants.add(row.pid);
  }
  return rows.filter(row => row.pid !== process.pid && descendants.has(row.pid));
}

const hash = (text: string): string => {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${value >>> 0}`;
};
const svgGroups = Object.fromEntries([
  ...Object.values(TERRAIN_TILES).flat().map(svg => [hash(svg), 'terrain']),
  ...Object.values(NATURAL_WONDER_TILES).map(svg => [hash(svg), 'wonder']),
]);

function fixture(civs: number): string {
  if (civs === 2) return readFileSync(join(__dirname, '../../fixtures/issue-365-crowded-map-save.json'), 'utf8');
  const state = createNewGame({ civType: 'rome', seed: 'renderer-memory-1439-five', mapSize: 'medium',
    opponentCount: 4, gameTitle: 'Memory diagnostic' });
  delete state.opponentChallenge;
  delete state.saveSchemaVersion;
  return JSON.stringify(state);
}

async function install(page: Page, fixtureText: string, experiment: Experiment): Promise<void> {
  await page.addInitScript(({ fixtureText: text, experiment: variant, svgGroups: groups }) => {
    indexedDB.deleteDatabase('conquestoria');
    localStorage.setItem('conquestoria-autosave', text);
    if (variant === 'uninstrumented') return;
    const hashSvg = (svg: string) => {
      let value = 2166136261;
      for (let i = 0; i < svg.length; i += 1) value = Math.imul(value ^ svg.charCodeAt(i), 16777619);
      return `${svg.length}:${value >>> 0}`;
    };
    const images: Array<{ ref: WeakRef<HTMLImageElement>; group: string; created: number; loaded?: number }> = [];
    const canvases: Array<WeakRef<HTMLCanvasElement>> = [];
    const buffers: Array<{ ref: WeakRef<AudioBuffer>; bytes: number; duration: number; path: string }> = [];
    const audioPaths = new WeakMap<ArrayBuffer, string>();
    const arrayBuffer = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function () {
      const buffer = await arrayBuffer.call(this);
      audioPaths.set(buffer, this.url.replace(location.origin, ''));
      return buffer;
    };
    const blobGroups = new WeakMap<Blob, string>();
    const urlGroups = new Map<string, string>();
    const OriginalBlob = Blob;
    window.Blob = new Proxy(OriginalBlob, { construct(target, args: ConstructorParameters<typeof Blob>) {
      const blob = Reflect.construct(target, args) as Blob;
      if (args[1]?.type === 'image/svg+xml') {
        const svg = args[0]?.filter(part => typeof part === 'string').join('') ?? '';
        blobGroups.set(blob, groups[hashSvg(svg)] ?? 'other-svg');
      }
      return blob;
    } });
    const createUrl = URL.createObjectURL.bind(URL);
    const revokeUrl = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = obj => {
      const url = createUrl(obj);
      if (obj instanceof OriginalBlob) urlGroups.set(url, blobGroups.get(obj) ?? 'other');
      return url;
    };
    URL.revokeObjectURL = url => { urlGroups.delete(url); revokeUrl(url); };
    const NativeImage = Image;
    window.Image = new Proxy(NativeImage, { construct(target, args: ConstructorParameters<typeof Image>) {
      const img = Reflect.construct(target, args) as HTMLImageElement;
      const entry = { ref: new WeakRef(img), group: 'other', created: performance.now(), loaded: undefined as number | undefined };
      images.push(entry);
      img.addEventListener('load', () => { entry.loaded = performance.now(); }, { once: true });
      return img;
    } });
    const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(value: string) {
      const entry = images.find(item => item.ref.deref() === this);
      const group = urlGroups.get(value) ?? (value.includes('.png') || value.startsWith('data:image/png') ? 'png' : 'other');
      if (entry) entry.group = group;
      const suppressed = (variant === 'no-terrain' && group === 'terrain') || (variant === 'no-wonders' && group === 'wonder');
      src.set!.call(this, suppressed ? 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' : value);
    } });
    const create = document.createElement.bind(document);
    document.createElement = ((...args: Parameters<Document['createElement']>) => {
      const el = create(...args);
      if (el instanceof HTMLCanvasElement) canvases.push(new WeakRef(el));
      return el;
    }) as Document['createElement'];
    const decode = BaseAudioContext.prototype.decodeAudioData;
    if (variant === 'no-playback') {
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        start.apply(this, args);
        this.stop(); // Keep the real started/ended lifecycle valid for later teardown.
      };
    }
    let decodeTail = Promise.resolve();
    BaseAudioContext.prototype.decodeAudioData = function (...args: Parameters<BaseAudioContext['decodeAudioData']>) {
      const path = audioPaths.get(args[0]) ?? 'unknown';
      const result = variant === 'serial-audio' ? decodeTail.then(() => decode.apply(this, args)) : decode.apply(this, args);
      if (variant === 'serial-audio') decodeTail = result.then(() => {}, () => {});
      void result.then(buffer => { buffers.push({ ref: new WeakRef(buffer), bytes: buffer.length * buffer.numberOfChannels * 4,
        duration: buffer.duration, path }); }, () => {});
      return result;
    };
    if (variant === 'no-overlay' || variant === 'no-canvas') {
      const style = create('style');
      style.textContent = variant === 'no-overlay' ? '#sprite-overlay{display:none!important}' : '#game-canvas{display:none!important}';
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style), { once: true });
    }
    const read = () => {
      const imageGroups: Record<string, { created: number; live: number; loaded: number; rgbaMiB: number }> = {};
      for (const entry of images) {
        const img = entry.ref.deref();
        const meta = img ? Reflect.get(img, Symbol.for('conquestoria.spriteDiagnostic')) : undefined;
        const group = meta ? `sprite:${meta.kind}` : entry.group;
        const stats = imageGroups[group] ??= { created: 0, live: 0, loaded: 0, rgbaMiB: 0 };
        stats.created += 1;
        if (img) { stats.live += 1; if (entry.loaded !== undefined) stats.loaded += 1;
          stats.rgbaMiB += img.naturalWidth * img.naturalHeight * 4 / 1048576; }
      }
      const allCanvases = new Set([...document.querySelectorAll('canvas'), ...canvases.map(ref => ref.deref()).filter(Boolean)]);
      const canvas = [...allCanvases].map(el => ({ id: el!.id, width: el!.width, height: el!.height,
        connected: el!.isConnected, rgbaMiB: el!.width * el!.height * 4 / 1048576 }));
      return { t: performance.now(), imageGroups, canvas, audio: { decoded: buffers.length,
        totalPcmMiB: buffers.reduce((sum, entry) => sum + entry.bytes / 1048576, 0),
        livePcmMiB: buffers.reduce((sum, entry) => sum + (entry.ref.deref() ? entry.bytes / 1048576 : 0), 0),
        largest: [...buffers].sort((a, b) => b.bytes - a.bytes).slice(0, 12).map(({ bytes, duration, path }) => ({ pcmMiB: bytes / 1048576, duration, path })) },
        dom: { nodes: document.querySelectorAll('*').length, overlayNodes: document.querySelectorAll('#sprite-overlay *').length,
          overlayEntities: document.querySelectorAll('#sprite-overlay [data-entity-id]').length },
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, platform: navigator.platform },
        performanceMemory: Reflect.get(performance, 'memory') ? {
          used: Reflect.get(performance, 'memory').usedJSHeapSize, total: Reflect.get(performance, 'memory').totalJSHeapSize } : null,
        outstandingBlobs: urlGroups.size };
    };
    Reflect.set(window, '__rendererMemoryRead', read);
  }, { fixtureText, experiment, svgGroups });
}

async function enter(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('dialog', { name: 'Choose Opponent Challenge' }).waitFor();
  await page.locator('[data-opponent-challenge-selector="migration"] [data-challenge="standard"]').click();
  await page.getByRole('button', { name: 'Continue Campaign', exact: true }).click();
  const choice = page.locator('#required-choice-panel');
  await choice.waitFor({ state: 'visible', timeout: 60_000 });
  await choice.locator('section').first().getByRole('button').first().click();
  await choice.waitFor({ state: 'hidden', timeout: 60_000 });
  await page.locator('#sprite-overlay').waitFor({ state: 'attached' });
}

export async function measureRendererMemory(options: { baseUrl: string; civs: number; motion: Motion;
  cache: 'cold' | 'warm'; experiment: Experiment; index: number; dpr?: number; lifecycle?: boolean; native?: boolean;
  buildLabel?: string }) {
  const { baseUrl, civs, motion, cache, experiment, index } = options;
  const browser = await chromium.launch();
  const context = await browser.newContext({ reducedMotion: motion, baseURL: baseUrl,
    viewport: { width: 1280, height: 720 }, deviceScaleFactor: options.dpr ?? 1 });
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(30_000);
  const browserCdp = await browser.newBrowserCDPSession();
  const text = fixture(civs);
  const state = JSON.parse(text);
  const snapshots: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const pageErrors: string[] = [];
  let offlineProbe: { fetched: number; decodedFrames: number; encodedBytes: number } | null = null;
  const output = join(process.cwd(), '.verification/renderer-memory', process.env.CONQUESTORIA_MEMORY_LABEL ?? 'pilot');
  mkdirSync(output, { recursive: true });
  const name = `${options.buildLabel ? `${options.buildLabel}-` : ''}${civs}-${motion}-${cache}-${experiment}-${index}-dpr${options.dpr ?? 1}`;
  const primingRendererPids = new Set<number>();
  let measuredRendererPid: number | null = null;
  try {
    if (process.env.CONQUESTORIA_MEMORY_TRACE) await browserCdp.send('Tracing.start', {
      transferMode: 'ReturnAsStream', traceConfig: { recordMode: 'recordContinuously',
        includedCategories: ['disabled-by-default-memory-infra', 'devtools.timeline'] },
    });
    if (experiment === 'no-audio') await context.route('**/audio/**', route => route.abort());
    if (experiment === 'no-sfx') await context.route('**/audio/sfx/**', route => route.abort());
    if (experiment === 'no-music') await context.route(/\/audio\/(era|war|accent)\//, route => route.abort());
    if (cache === 'warm') {
      const prime = await context.newPage();
      await install(prime, text, experiment);
      await prime.goto(baseUrl);
      await enter(prime);
      await prime.waitForTimeout(6000);
      await prime.close();
      for (const row of processRows()) if (row.kind === 'renderer') primingRendererPids.add(row.pid);
    }
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(String(error)));
    await install(page, text, experiment);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const snapshot = async (stage: string) => {
      const processes = processRows();
      if (stage === 'blank') {
        const candidates = processes.filter(p => p.kind === 'renderer' && !primingRendererPids.has(p.pid));
        measuredRendererPid = candidates.length === 1 ? candidates[0]!.pid : null;
      }
      const measured = processes.find(p => p.kind === 'renderer' && p.pid === measuredRendererPid);
      const info = await browserCdp.send('SystemInfo.getProcessInfo').catch(error => { errors.push(String(error)); return null; });
      const metric = await cdp.send('Performance.getMetrics');
      const dom = await cdp.send('Memory.getDOMCounters');
      const usage = await cdp.send('Runtime.getHeapUsage');
      const pageData = await page.evaluate(() => Reflect.get(window, '__rendererMemoryRead')?.() ?? null);
      const row = { stage, hostTime: Date.now(), processes, systemInfo: info, hostVm: execFileSync('vm_stat', [], { encoding: 'utf8' }), legacyRendererRssMiB: rendererRssMb(process.pid),
        aggregateRendererRssMiB: processes.filter(p => p.kind === 'renderer').reduce((sum, p) => sum + p.rssMiB, 0),
        measuredRendererPid: measured?.pid ?? null, measuredRendererRssMiB: measured?.rssMiB ?? null,
        metric: Object.fromEntries(metric.metrics.map(m => [m.name, m.value])), dom, usage, page: pageData };
      snapshots.push(row);
      if (process.env.CONQUESTORIA_MEMORY_TRACE) {
        const dump = await browserCdp.send('Tracing.requestMemoryDump', { levelOfDetail: 'detailed' });
        Reflect.set(row, 'memoryDump', dump);
      }
      writeFileSync(join(output, `${name}-partial.json`), JSON.stringify({ options, snapshots, errors }, null, 2));
      console.log(`[memory-stage] ${name} ${stage} active-rss=${measured?.rssMiB.toFixed(1) ?? 'unknown'} aggregate-rss=${row.aggregateRendererRssMiB.toFixed(1)} heap=${(usage.usedSize / 1048576).toFixed(1)}`);
    };
    await snapshot('blank');
    await page.goto(baseUrl);
    await page.getByRole('button', { name: 'Continue', exact: true }).waitFor();
    await snapshot('app-shell');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('dialog', { name: 'Choose Opponent Challenge' }).waitFor();
    await page.locator('[data-opponent-challenge-selector="migration"] [data-challenge="standard"]').click();
    await snapshot('before-campaign');
    await page.getByRole('button', { name: 'Continue Campaign', exact: true }).click();
    const choice = page.locator('#required-choice-panel');
    await choice.waitFor({ state: 'visible', timeout: 60_000 });
    await choice.locator('section').first().getByRole('button').first().click();
    await choice.waitFor({ state: 'hidden', timeout: 60_000 });
    await snapshot('interactive');
    for (const seconds of [3, 6, 12]) {
      await page.waitForTimeout(seconds === 3 ? 3000 : seconds === 6 ? 3000 : 6000);
      await snapshot(`idle-${seconds}s`);
    }
    if (options.native) {
      for (const p of processRows().filter(p => p.kind === 'renderer' || p.kind === 'gpu-process')) {
        try { writeFileSync(join(output, `${name}-vmmap-${p.pid}.txt`), execFileSync('vmmap', ['-summary', String(p.pid)], { encoding: 'utf8', timeout: 30_000 })); }
        catch (error) { errors.push(`vmmap ${p.pid}: ${String(error).slice(0, 250)}`); }
      }
      try { const profile = await cdp.send('Memory.getAllTimeSamplingProfile');
        writeFileSync(join(output, `${name}-native-sampling.json`), JSON.stringify(profile)); }
      catch (error) { errors.push(`native sampling: ${String(error)}`); }
    }
    await cdp.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(2000);
    await snapshot('post-gc');
    if (process.env.CONQUESTORIA_MEMORY_OFFLINE) {
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
      await context.setOffline(true);
      try {
        offlineProbe = await page.evaluate(async paths => {
          let encodedBytes = 0;
          let decodedFrames = 0;
          const audio = new AudioContext();
          try {
            for (const [index, path] of paths.entries()) {
              const response = await fetch(new URL(path, location.href));
              if (!response.ok) throw new Error(`Offline SFX unavailable: ${path} (${response.status})`);
              const encoded = await response.arrayBuffer();
              encodedBytes += encoded.byteLength;
              if (index === 0) {
                const buffer = await audio.decodeAudioData(encoded);
                decodedFrames = buffer.length;
                const source = audio.createBufferSource();
                source.buffer = buffer;
                source.connect(audio.destination);
                source.start();
                source.stop();
                source.disconnect();
                source.buffer = null;
              }
            }
            return { fetched: paths.length, decodedFrames, encodedBytes };
          } finally { await audio.close(); }
        }, [...new Set(allSfxEntries().map(entry => entry.file))]);
      } finally { await context.setOffline(false); }
    }
    if (options.lifecycle) {
      // Actual in-page campaign/menu path; no reload or production debug access.
      await page.locator('#btn-pause-menu').click();
      await page.locator('#pause-menu').waitFor();
      await page.getByRole('button', { name: 'New Game…', exact: true }).click();
      await page.getByRole('button', { name: 'Discard & Start New Game', exact: true }).click();
      await page.locator('#mode-select').waitFor();
      await page.waitForTimeout(3000);
      await snapshot('menu');
      for (const [repeat, civ] of ['rome', 'rome', 'japan', 'japan', 'china'].entries()) {
        await page.locator('[data-action="choose-solo-mode"]').click();
        await page.locator('#campaign-setup').waitFor();
        await page.locator('[data-action="choose-civ"]').click();
        await page.locator(`#civ-select [data-civ-id="${civ}"]`).click();
        await page.locator('#civ-start').click();
        await page.getByRole('button', { name: 'Start Campaign', exact: true }).click();
        await page.locator('#campaign-setup').waitFor({ state: 'hidden' });
        if (await choice.isVisible()) {
          await choice.locator('section').first().getByRole('button').first().click();
          await choice.waitFor({ state: 'hidden' });
        }
        await page.waitForTimeout(6000);
        await snapshot(`repeat-${repeat}-${civ}`);
        await cdp.send('HeapProfiler.collectGarbage');
        await page.waitForTimeout(2000);
        await snapshot(`repeat-${repeat}-${civ}-gc`);
        await page.locator('#btn-pause-menu').click();
        await page.locator('#pause-menu').waitFor();
        await page.getByRole('button', { name: 'New Game…', exact: true }).click();
        await page.getByRole('button', { name: 'Discard & Start New Game', exact: true }).click();
        await page.locator('#mode-select').waitFor();
      }
    }
    if (process.env.CONQUESTORIA_MEMORY_TRACE) {
      const completed = new Promise<{ stream?: string }>(resolve => browserCdp.once('Tracing.tracingComplete', resolve));
      await browserCdp.send('Tracing.end');
      const { stream } = await completed;
      if (stream) {
        let trace = '';
        for (;;) {
          const chunk = await browserCdp.send('IO.read', { handle: stream });
          trace += chunk.data;
          if (chunk.eof) break;
        }
        await browserCdp.send('IO.close', { handle: stream });
        writeFileSync(join(output, `${name}-trace.json`), trace);
      }
    }
    const buildAssets = await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(elements =>
      elements.map(element => element.getAttribute('src') ?? element.getAttribute('href')));
    await page.close();
    const afterClose = processRows();
    await context.close();
    const afterContextClose = processRows();
    const result = { name, options, browserVersion: browser.version(), hostPlatform: process.platform, hostArch: process.arch,
      fixture: { width: state.map.width, height: state.map.height, civs: Object.keys(state.civilizations).length,
        units: Object.keys(state.units).length, cities: Object.keys(state.cities).length, serializedBytes: Buffer.byteLength(text) },
      snapshots, afterClose, afterContextClose, errors, pageErrors, offlineProbe, buildAssets };
    writeFileSync(join(output, `${name}.json`), JSON.stringify(result, null, 2));
    console.log(`[memory-result] ${name} ${join(output, `${name}.json`)}`);
    return result;
  } finally { await browserCdp.detach().catch(() => {}); await browser.close(); }
}

export async function runMemoryMatrix(baseUrl: string): Promise<void> {
  const samples = Number(process.env.CONQUESTORIA_MEMORY_SAMPLES ?? 5);
  const experiments = (process.env.CONQUESTORIA_MEMORY_EXPERIMENTS ?? 'baseline').split(',') as Experiment[];
  const civs = (process.env.CONQUESTORIA_MEMORY_CIVS ?? '2,5').split(',').map(Number);
  const motions = (process.env.CONQUESTORIA_MEMORY_MOTIONS ?? 'reduce,no-preference').split(',') as Motion[];
  const caches = (process.env.CONQUESTORIA_MEMORY_CACHES ?? 'cold,warm').split(',') as Array<'cold' | 'warm'>;
  if (!Number.isInteger(samples) || samples < 1) throw new Error('CONQUESTORIA_MEMORY_SAMPLES must be a positive integer');
  if (civs.some(count => count !== 2 && count !== 5)) throw new Error('CONQUESTORIA_MEMORY_CIVS supports only 2 and 5');
  if (motions.some(motion => motion !== 'reduce' && motion !== 'no-preference')) throw new Error('Invalid memory motion');
  if (caches.some(cache => cache !== 'cold' && cache !== 'warm')) throw new Error('Invalid memory cache scenario');
  const allowed: Experiment[] = ['baseline', 'uninstrumented', 'no-audio', 'no-sfx', 'no-music', 'serial-audio',
    'no-playback', 'no-terrain', 'no-wonders', 'no-overlay', 'no-canvas'];
  if (experiments.some(experiment => !allowed.includes(experiment))) throw new Error('Invalid memory experiment');
  const builds = process.env.CONQUESTORIA_MEMORY_COMPARE_URL
    ? [{ baseUrl: process.env.CONQUESTORIA_MEMORY_COMPARE_URL, buildLabel: 'control' }, { baseUrl, buildLabel: 'candidate' }]
    : [{ baseUrl, buildLabel: undefined }];
  // Interleave A/B variants, rather than running all controls and then all candidates.
  for (let index = 0; index < samples; index += 1) {
    for (const count of civs) for (const motion of motions) for (const cache of caches) for (const experiment of experiments) {
      for (const build of builds) await measureRendererMemory({ ...build, civs: count, motion, cache, experiment, index,
        dpr: Number(process.env.CONQUESTORIA_MEMORY_DPR ?? 1), lifecycle: Boolean(process.env.CONQUESTORIA_MEMORY_LIFECYCLE),
        native: Boolean(process.env.CONQUESTORIA_MEMORY_NATIVE) && index === 0 });
    }
  }
}
