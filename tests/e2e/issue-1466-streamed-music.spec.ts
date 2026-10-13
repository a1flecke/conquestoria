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

// The comparison below is deterministic on purpose. A first version captured two real-time runs through a
// ScriptProcessor and aligned them by cross-correlation; on a loaded CI runner the two captures drift by a few
// render quanta and that alone produces large differences, which says nothing about window joins. An
// OfflineAudioContext renders both graphs on the same sample grid, so any difference is the scheduling itself.
test('scheduled windows render identically to the whole-buffer loop across every join and the loop wrap', async ({ page }) => {
  test.setTimeout(180_000);
  await openPage(page);
  const result = await page.evaluate(async () => {
    const base = '/conquestoria/';
    const { StreamedLoopTrack, DEFAULT_STREAM_OPTIONS } = await import(/* @vite-ignore */ `${base}src/audio/streamed-loop.ts`);
    const rate = 48000;
    const seconds = 46;
    const loopEnd = 20; // five 4 s cores: nine joins and two wraps inside the render
    const bytes = new Uint8Array(await (await fetch(`${base}audio/era/era1-base.ogg`)).arrayBuffer());

    const reference = new OfflineAudioContext(2, seconds * rate, rate);
    const buffer = await reference.decodeAudioData(bytes.slice().buffer);
    const source = reference.createBufferSource();
    source.buffer = buffer; source.loop = true; source.loopStart = 0; source.loopEnd = loopEnd;
    source.connect(reference.destination);
    source.start(0);

    const streamed = new OfflineAudioContext(2, seconds * rate, rate);
    const track = StreamedLoopTrack.open(streamed, bytes, { loopStart: 0, loopEnd }, { ...DEFAULT_STREAM_OPTIONS, coreSeconds: 4 })!;
    const windows = track.plan.windows;
    let scheduled = 0;
    let joins = 0;
    for (let index = 0; scheduled < seconds * rate; index = (index + 1) % windows.length) {
      const w = windows[index]!;
      const decoded = await track.decodeWindow(streamed, w);
      const node = streamed.createBufferSource();
      node.buffer = decoded;
      node.connect(streamed.destination);
      node.start(scheduled / rate, (w.coreStart - w.startFrame) / rate, (w.coreEnd - w.coreStart) / rate);
      scheduled += w.coreEnd - w.coreStart;
      joins += 1;
    }

    const [a, b] = await Promise.all([reference.startRendering(), streamed.startRendering()]);
    let maxAbs = 0;
    let rms = 0;
    for (let channel = 0; channel < 2; channel++) {
      const x = a.getChannelData(channel);
      const y = b.getChannelData(channel);
      for (let i = 0; i < x.length; i++) {
        maxAbs = Math.max(maxAbs, Math.abs(x[i]! - y[i]!));
        rms += x[i]! * x[i]!;
      }
    }
    return { maxAbs, rms: Math.sqrt(rms / (2 * a.length)), joins, windows: windows.length };
  });
  expect(result.windows).toBe(5);
  expect(result.joins).toBeGreaterThanOrEqual(10);
  expect(result.rms, 'the reference must not be silent').toBeGreaterThan(0.001);
  expect(result.maxAbs).toBeLessThan(1e-5);
});

// The real player on the real audio clock: it must start, keep producing sound across several joins and report no
// failure. Timing-sensitive equality is covered above and by the fake-clock unit tests, so this asserts only
// outcomes that do not depend on runner speed.
test('the real player keeps sounding across window joins on the live audio clock', async ({ page }) => {
  test.setTimeout(120_000);
  await openPage(page);
  const result = await page.evaluate(async () => {
    const base = '/conquestoria/';
    const { StreamedLoopTrack, DEFAULT_STREAM_OPTIONS } = await import(/* @vite-ignore */ `${base}src/audio/streamed-loop.ts`);
    const ctx = new AudioContext({ sampleRate: 48000 });
    await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    const sink = ctx.createGain();
    sink.gain.value = 0;
    analyser.connect(sink);
    sink.connect(ctx.destination);
    const bytes = new Uint8Array(await (await fetch(`${base}audio/era/era1-base.ogg`)).arrayBuffer());
    const track = StreamedLoopTrack.open(ctx, bytes, { loopStart: 0, loopEnd: 20 }, { ...DEFAULT_STREAM_OPTIONS, coreSeconds: 4 })!;
    const prepared = await track.prepare(ctx);
    if (!prepared) return { prepared: false, failures: 0, silentSeconds: 0, started: 0 };
    const player = prepared.createPlayer(analyser);
    let failures = 0;
    player.onFailure = () => { failures += 1; };
    player.start();
    const samples = new Float32Array(analyser.fftSize);
    let silentSeconds = 0;
    for (let second = 0; second < 14; second++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      analyser.getFloatTimeDomainData(samples);
      if (!samples.some(value => Math.abs(value) > 1e-4)) silentSeconds += 1;
    }
    const started = ctx.currentTime;
    player.dispose();
    return { prepared: true, failures, silentSeconds, started };
  });
  expect(result.prepared).toBe(true);
  expect(result.failures).toBe(0);
  expect(result.started).toBeGreaterThan(8);
  expect(result.silentSeconds).toBeLessThanOrEqual(2);
});
