import { expect, test, type Page } from '@playwright/test';

// #1466: long music is played from small decoded windows instead of one whole-file AudioBuffer. These run in real
// Chromium against the real shipped assets because the claim under test is about what the browser's decoder and
// audio clock do: (1) a window cut from the middle of a file decodes to the same samples as the file; (2) the
// scheduled windows join sample-accurately, including at the loop wrap, so the streamed output is the buffer
// output.

test.use({ serviceWorkers: 'block', launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

async function openPage(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
}

test('windows cut from the middle of a file decode to the same samples as the whole file', async ({ page }) => {
  test.setTimeout(120_000);
  await openPage(page);
  const results = await page.evaluate(async () => {
    const base = '/conquestoria/';
    const { StreamedLoopTrack, DEFAULT_STREAM_OPTIONS } = await import(/* @vite-ignore */ `${base}src/audio/streamed-loop.ts`);
    const ctx = new AudioContext({ sampleRate: 48000 });
    const out: Array<{ file: string; nativeRate: number; windows: number; maxAbs: number; worstLenDelta: number; decodeMs: number[] }> = [];
    for (const [file, loopEnd] of [
      ['audio/era/era1-base.ogg', 165.356], // 44.1 kHz into 48 kHz: the resampler-grid case
      ['audio/war/era2-war.ogg', 91.152], // 48 kHz: no resampling
      ['audio/accent/mediterranean-antiquity.ogg', 68.759], // loop ends before the file does
    ] as const) {
      const bytes = new Uint8Array(await (await fetch(`${base}${file}`)).arrayBuffer());
      const reference = await ctx.decodeAudioData(bytes.slice().buffer);
      const track = StreamedLoopTrack.open(ctx, bytes, { loopStart: 0, loopEnd }, DEFAULT_STREAM_OPTIONS)!;
      let maxAbs = 0;
      let worstLenDelta = 0;
      const decodeMs: number[] = [];
      const windows = track.plan.windows;
      for (const w of windows) {
        const began = performance.now();
        const buffer = await track.decodeWindow(ctx, w);
        decodeMs.push(performance.now() - began);
        worstLenDelta = Math.max(worstLenDelta, Math.abs(buffer.length - w.expectedFrames));
        for (let channel = 0; channel < reference.numberOfChannels; channel++) {
          const a = reference.getChannelData(channel);
          const b = buffer.getChannelData(channel);
          for (let frame = w.coreStart; frame < w.coreEnd; frame++) {
            maxAbs = Math.max(maxAbs, Math.abs(a[frame]! - b[frame - w.startFrame]!));
          }
        }
      }
      out.push({ file, nativeRate: track.stream.nativeRate, windows: windows.length, maxAbs, worstLenDelta, decodeMs });
    }
    return out;
  });
  for (const row of results) {
    const sorted = [...row.decodeMs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    // Reported, not gated on wall time (machine-dependent); the structural gate is that a 6 s core decodes far
    // faster than it plays, with a generous bound that only a real regression would breach.
    test.info().annotations.push({
      type: 'decode-cost',
      description: `${row.file}: ${row.windows} windows, median ${median.toFixed(1)} ms, max ${sorted[sorted.length - 1]!.toFixed(1)} ms, maxAbs ${row.maxAbs.toExponential(2)}`,
    });
    expect(sorted[sorted.length - 1]!, `${row.file} slowest window decode`).toBeLessThan(2000);
    expect(row.windows, row.file).toBeGreaterThan(5);
    // Float rounding only: 1e-6 is -120 dBFS.
    expect(row.maxAbs, row.file).toBeLessThan(1e-6);
    expect(row.worstLenDelta, row.file).toBeLessThanOrEqual(2);
  }
});

interface Recording { samples: number[]; sampleRate: number }

/** Records the left channel of whatever `play` connects to its argument for `seconds`. */
async function record(page: Page, mode: 'buffer' | 'stream', seconds: number): Promise<Recording> {
  return page.evaluate(async ({ mode, seconds }) => {
    const base = '/conquestoria/';
    const { StreamedLoopTrack, DEFAULT_STREAM_OPTIONS } = await import(/* @vite-ignore */ `${base}src/audio/streamed-loop.ts`);
    const ctx = new AudioContext({ sampleRate: 48000 });
    await ctx.resume();
    const sink = ctx.createGain();
    sink.gain.value = 0;
    sink.connect(ctx.destination);
    const processor = ctx.createScriptProcessor(4096, 2, 2);
    const chunks: Float32Array[] = [];
    processor.onaudioprocess = event => { chunks.push(new Float32Array(event.inputBuffer.getChannelData(0))); };
    processor.connect(sink);
    // A short loop of the real era-1 base track: five 4 s cores, so the wrap and four joins happen in the capture.
    const loopEnd = 20;
    const bytes = new Uint8Array(await (await fetch(`${base}audio/era/era1-base.ogg`)).arrayBuffer());
    let stop: () => void;
    if (mode === 'buffer') {
      const buffer = await ctx.decodeAudioData(bytes.slice().buffer);
      const source = ctx.createBufferSource();
      source.buffer = buffer; source.loop = true; source.loopStart = 0; source.loopEnd = loopEnd;
      source.connect(processor);
      source.start();
      stop = () => source.stop();
    } else {
      const track = StreamedLoopTrack.open(ctx, bytes, { loopStart: 0, loopEnd }, { ...DEFAULT_STREAM_OPTIONS, coreSeconds: 4 })!;
      const prepared = await track.prepare(ctx);
      if (!prepared) throw new Error('stream refused');
      const player = prepared.createPlayer(processor);
      player.start();
      stop = () => player.dispose();
    }
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    stop();
    processor.disconnect();
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
    return { samples: Array.from(samples), sampleRate: ctx.sampleRate };
  }, { mode, seconds });
}

test('streamed output equals the whole-buffer loop across window joins and the loop wrap', async ({ page }) => {
  test.setTimeout(180_000);
  await openPage(page);
  const reference = await record(page, 'buffer', 52);
  const streamed = await record(page, 'stream', 52);
  expect(reference.sampleRate).toBe(48000);

  // Each capture starts a little after its source; find where the music begins, then compare 46 s from there.
  const onset = (rec: Recording): number => rec.samples.findIndex(value => Math.abs(value) > 1e-4);
  const a0 = onset(reference);
  const b0 = onset(streamed);
  expect(a0).toBeGreaterThanOrEqual(0);
  expect(b0).toBeGreaterThanOrEqual(0);
  const span = 46 * 48000;
  // Align on the first 0.5 s (the two sources start at slightly different render quanta).
  let best = { lag: 0, error: Infinity };
  for (let lag = -2048; lag <= 2048; lag++) {
    let error = 0;
    for (let i = 0; i < 24000; i += 7) {
      const x = reference.samples[a0 + 2000 + i] ?? 0;
      const y = streamed.samples[b0 + 2000 + i + lag] ?? 0;
      error += (x - y) * (x - y);
    }
    if (error < best.error) best = { lag, error };
  }
  let maxAbs = 0;
  let worstAt = 0;
  for (let i = 0; i < span; i++) {
    const x = reference.samples[a0 + i];
    const y = streamed.samples[b0 + i + best.lag];
    if (x === undefined || y === undefined) break;
    const d = Math.abs(x - y);
    if (d > maxAbs) { maxAbs = d; worstAt = i; }
  }
  // 20 s loop captured for ~46 s: two full wraps and nine joins. Float rounding only.
  expect(maxAbs, `worst difference at ${(worstAt / 48000).toFixed(3)} s (lag ${best.lag})`).toBeLessThan(1e-5);
});
