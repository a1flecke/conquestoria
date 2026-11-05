import { expect, test, type Page } from '@playwright/test';

// #1466: the streamed-music design only works if `decodeAudioData` reproduces the whole-file decode when a window
// that starts mid-file is decoded on its own. This spec does not assume that: it proves, on the engine it runs
// against, that (1) a track is only accepted when every window decodes to the promised frame count and the same
// samples as the whole file, (2) anything else is refused by the self-check and served as a whole-file buffer by
// `AudioLoader.getLoop`, and (3) a missing, failed, malformed or superseded request still yields a playable source
// instead of an unhandled rejection.
//
// Run across engines with:
//   CONQUESTORIA_PLAYWRIGHT_CROSS_ENGINE=1 yarn test:web-smoke:cross-engine
// Chromium and Firefox accept windows; Playwright WebKit (Safari's engine) trims one short block from the end of
// every standalone stream and must therefore fall back.

test.use({ serviceWorkers: 'block' });

const MATRIX = [
  { file: 'audio/era/era1-base.ogg', loopEnd: 165.356, note: '44.1 kHz source into a 48 kHz context' },
  { file: 'audio/war/era2-war.ogg', loopEnd: 91.152, note: 'native 48 kHz source; loop ends at the file end' },
  { file: 'audio/accent/mediterranean-antiquity.ogg', loopEnd: 68.759, note: 'loop ends before the file duration' },
] as const;

async function openPage(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
}

interface MatrixRow {
  file: string;
  note: string;
  sampleRate: number;
  nativeRate: number;
  opened: boolean;
  accepted: boolean;
  windows: number;
  worstLengthDelta: number;
  maxAbs: number;
  /** Core frames the whole-file decode does not contain (the platform decoded the file shorter than the loop end). */
  uncoveredFrames: number;
  coverageOk: boolean;
}

test('only a decoder whose windows are exact may stream; everything else falls back', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openPage(page);
  const rows = (await page.evaluate(async (matrix) => {
    const base = '/conquestoria/';
    const { StreamedLoopTrack, DEFAULT_STREAM_OPTIONS } = await import(/* @vite-ignore */ `${base}src/audio/streamed-loop.ts`);
    const ctx = new AudioContext({ sampleRate: 48000 });
    const out: MatrixRow[] = [];
    try {
      for (const entry of matrix) {
        const bytes = new Uint8Array(await (await fetch(`${base}${entry.file}`)).arrayBuffer());
        const reference = await ctx.decodeAudioData(bytes.slice().buffer);
        const track = StreamedLoopTrack.open(ctx, bytes, { loopStart: 0, loopEnd: entry.loopEnd }, DEFAULT_STREAM_OPTIONS);
        const row: MatrixRow = {
          file: entry.file,
          note: entry.note,
          sampleRate: ctx.sampleRate,
          nativeRate: track?.stream.nativeRate ?? 0,
          opened: !!track,
          accepted: false,
          windows: track?.plan.windows.length ?? 0,
          worstLengthDelta: 0,
          maxAbs: 0,
          uncoveredFrames: 0,
          coverageOk: false,
        };
        out.push(row);
        if (!track) continue;
        const prepared = await track.prepare(ctx);
        row.accepted = prepared !== null;
        if (!prepared) continue;
        // Accepted: every window must decode, cover its core, and match the whole-file decode sample for sample.
        let expectedStart = 0;
        row.coverageOk = true;
        for (const window of track.plan.windows) {
          if (window.coreStart !== expectedStart) row.coverageOk = false;
          expectedStart = window.coreEnd;
          const buffer = await track.decodeWindow(ctx, window);
          let maxAbs = 0;
          const coveredTo = Math.min(window.coreEnd, reference.length);
          if (coveredTo > window.coreStart) {
            for (let channel = 0; channel < reference.numberOfChannels; channel++) {
              const a = reference.getChannelData(channel);
              const b = buffer.getChannelData(channel);
              for (let frame = window.coreStart; frame < coveredTo; frame++) {
                maxAbs = Math.max(maxAbs, Math.abs(a[frame]! - b[frame - window.startFrame]!));
              }
            }
          }
          row.uncoveredFrames += Math.max(0, window.coreEnd - coveredTo);
          row.worstLengthDelta = Math.max(row.worstLengthDelta, Math.abs(buffer.length - window.expectedFrames));
          row.maxAbs = Math.max(row.maxAbs, maxAbs);
        }
        row.coverageOk = row.coverageOk && expectedStart === track.plan.loopFrames;
      }
    } finally {
      await ctx.close();
    }
    return out;
  }, MATRIX)) as MatrixRow[];

  for (const row of rows) {
    testInfo.annotations.push({ type: 'decoder-matrix', description: JSON.stringify(row) });
  }
  expect(rows).toHaveLength(MATRIX.length);
  for (const row of rows) {
    expect(row.opened, `${row.file}: the plan must be offered`).toBe(true);
    if (row.accepted) {
      // A streaming decision is a promise that every window is playable exactly as planned.
      expect(row.coverageOk, `${row.file}: accepted windows must tile the whole loop`).toBe(true);
      expect(row.worstLengthDelta, `${row.file}: accepted windows must match the planned frame count`).toBeLessThanOrEqual(2);
      // Some decoders (Firefox, WebKit) return the whole file a few dozen frames shorter than its final granule,
      // while a window cut from the end decodes at full length. That is at most one Vorbis short block.
      expect(row.uncoveredFrames, `${row.file}: the whole-file decode must cover the loop`).toBeLessThanOrEqual(128);
      expect(row.maxAbs, `${row.file}: accepted windows must equal the whole-file decode`).toBeLessThan(1e-5);
    }
  }
});

test('a decoder that trims every window is detected, and the loader serves the whole-file buffer', async ({ page }) => {
  test.setTimeout(120_000);
  await openPage(page);
  const result = await page.evaluate(async () => {
    const base = '/conquestoria/';
    const { AudioLoader } = await import(/* @vite-ignore */ `${base}src/audio/audio-loader.ts`);
    const { PreparedStreamedLoop } = await import(/* @vite-ignore */ `${base}src/audio/streamed-loop.ts`);
    const ctx = new AudioContext({ sampleRate: 48000 });
    const original = ctx.decodeAudioData.bind(ctx);
    const unhandled: string[] = [];
    const onUnhandled = (event: PromiseRejectionEvent): void => { unhandled.push(String(event.reason)); };
    window.addEventListener('unhandledrejection', onUnhandled);
    // A platform whose standalone-stream decoder drops the final short block, as Safari's engine does.
    ctx.decodeAudioData = async (data: ArrayBuffer) => {
      const buffer = await original(data);
      const length = buffer.length - 128;
      return { ...buffer, length, getChannelData: () => new Float32Array(length) } as unknown as AudioBuffer;
    };
    try {
      const loader = new AudioLoader(ctx);
      const source = await loader.getLoop({ file: 'audio/era/era1-base.ogg', loop: { loopStart: 0, loopEnd: 165.356 } });
      return {
        streamed: source instanceof PreparedStreamedLoop,
        playable: typeof (source as AudioBuffer).length === 'number' && (source as AudioBuffer).length > 0,
        unhandled,
      };
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
      await ctx.close();
    }
  });
  expect(result.streamed, 'a trimming decoder must not be accepted').toBe(false);
  expect(result.playable, 'the fallback must be a real decoded buffer').toBe(true);
  expect(result.unhandled).toEqual([]);
});

test('refused plans, malformed files, failed requests and superseded loads all yield a safe source', async ({ page }) => {
  test.setTimeout(120_000);
  await openPage(page);
  const result = await page.evaluate(async () => {
    const base = '/conquestoria/';
    const { StreamedLoopTrack } = await import(/* @vite-ignore */ `${base}src/audio/streamed-loop.ts`);
    const { AudioLoader } = await import(/* @vite-ignore */ `${base}src/audio/audio-loader.ts`);
    const { PreparedStreamedLoop } = await import(/* @vite-ignore */ `${base}src/audio/streamed-loop.ts`);
    const ctx = new AudioContext({ sampleRate: 48000 });
    const bytes = new Uint8Array(await (await fetch(`${base}audio/era/era1-base.ogg`)).arrayBuffer());
    const isPlayable = (source: unknown): boolean =>
      source instanceof PreparedStreamedLoop
      || (typeof (source as AudioBuffer)?.length === 'number' && (source as AudioBuffer).length > 0);
    const unhandled: string[] = [];
    const onUnhandled = (event: PromiseRejectionEvent): void => { unhandled.push(String(event.reason)); };
    window.addEventListener('unhandledrejection', onUnhandled);
    try {
      // A loop that does not start at 0, one that runs past the file, and bytes that are not Ogg at all.
      const refusedPlans = [
        StreamedLoopTrack.open(ctx, bytes, { loopStart: 2, loopEnd: 60 }) === null,
        StreamedLoopTrack.open(ctx, bytes, { loopStart: 0, loopEnd: 500 }) === null,
        StreamedLoopTrack.open(ctx, new Uint8Array(64), { loopStart: 0, loopEnd: 20 }) === null,
      ];
      // A request for a file that is not a decodable asset: the stream path refuses it and the whole-buffer path
      // substitutes its documented one-frame silent buffer.
      const missing = new AudioLoader(ctx);
      const missingSource = await missing.getLoop({ file: 'audio/missing-track.ogg', loop: { loopStart: 0, loopEnd: 20 } });
      // A load superseded by clear() must resolve to a buffer, not to a stream that nobody owns.
      const superseded = new AudioLoader(ctx);
      const pending = superseded.getLoop({ file: 'audio/era/era1-base.ogg', loop: { loopStart: 0, loopEnd: 165.356 } });
      superseded.clear();
      const supersededSource = await pending;
      return {
        refusedPlans,
        missingStreamed: missingSource instanceof PreparedStreamedLoop,
        missingPlayable: isPlayable(missingSource),
        supersededStreamed: supersededSource instanceof PreparedStreamedLoop,
        supersededPlayable: isPlayable(supersededSource),
        unhandled,
      };
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
      await ctx.close();
    }
  });
  expect(result.refusedPlans).toEqual([true, true, true]);
  expect(result.missingStreamed).toBe(false);
  expect(result.missingPlayable).toBe(true);
  expect(result.supersededStreamed).toBe(false);
  expect(result.supersededPlayable).toBe(true);
  expect(result.unhandled).toEqual([]);
});
