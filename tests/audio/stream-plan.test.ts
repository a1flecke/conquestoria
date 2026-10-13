import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOggVorbis } from '@/audio/ogg-vorbis';
import { planStreamWindows } from '@/audio/stream-plan';
import { ACCENT, ERA_BASE, UNREST_LAYER, DEFEAT_LAYER, WAR_LAYER, BEAST_TERRITORY_LAYER, type TrackEntry } from '@/audio/audio-catalog';

// #1466: the plan cuts a looping track into windows whose decoded output, once the cores are laid end to end,
// is exactly the track's first `loopFrames` frames. The decoder resamples each window separately, so every window
// must start where the resampler's output grid coincides with the whole file's grid: at a packet whose native
// sample position is a multiple of the input period (147 for 44.1 kHz into 48 kHz).

function stream(file: string) {
  return parseOggVorbis(new Uint8Array(readFileSync(resolve(process.cwd(), 'public', file))));
}

const OUTPUT_RATE = 48000;
const options = { outputRate: OUTPUT_RATE, coreSeconds: 6, marginSeconds: 0.5 };

describe('planStreamWindows', () => {
  const entry = ERA_BASE[1];
  const parsed = stream(entry.file);

  it('tiles [0, loopFrames) exactly with consecutive, non-overlapping cores', () => {
    const plan = planStreamWindows(parsed, { ...options, loopEndSeconds: entry.loop.loopEnd })!;
    expect(plan).not.toBeNull();
    expect(plan.loopFrames).toBe(Math.round(entry.loop.loopEnd * OUTPUT_RATE));
    expect(plan.windows[0]!.coreStart).toBe(0);
    for (let i = 1; i < plan.windows.length; i++) {
      expect(plan.windows[i]!.coreStart).toBe(plan.windows[i - 1]!.coreEnd);
    }
    expect(plan.windows[plan.windows.length - 1]!.coreEnd).toBe(plan.loopFrames);
    expect(plan.windows.map(w => w.index)).toEqual(plan.windows.map((_, i) => i));
  });

  it('starts every window on the resampler grid with enough lead-in before its core', () => {
    const plan = planStreamWindows(parsed, { ...options, loopEndSeconds: entry.loop.loopEnd })!;
    const { q } = plan.ratio;
    for (const w of plan.windows) {
      expect(parsed.granules[w.firstPacket]! % q).toBe(0);
      expect(Number.isInteger(w.startFrame)).toBe(true);
      // The lead-in absorbs the resampler's start-up; the first window starts at the top of the file.
      if (w.index > 0) expect(w.coreStart - w.startFrame).toBeGreaterThanOrEqual(0.5 * OUTPUT_RATE - 1);
      expect(w.coreStart - w.startFrame).toBeLessThan(options.coreSeconds * OUTPUT_RATE + 15 * OUTPUT_RATE);
    }
    expect(plan.windows[0]!.firstPacket).toBe(0);
  });

  it('decodes past the end of each core by the margin, and each window ends after it starts', () => {
    const plan = planStreamWindows(parsed, { ...options, loopEndSeconds: entry.loop.loopEnd })!;
    for (const w of plan.windows) {
      expect(w.lastPacket).toBeGreaterThan(w.firstPacket);
      expect(w.startFrame + w.expectedFrames).toBeGreaterThanOrEqual(Math.min(w.coreEnd + 0.5 * OUTPUT_RATE - 1, plan.loopFrames));
    }
  });

  it('is deterministic', () => {
    const a = planStreamWindows(parsed, { ...options, loopEndSeconds: entry.loop.loopEnd });
    const b = planStreamWindows(parsed, { ...options, loopEndSeconds: entry.loop.loopEnd });
    expect(a).toEqual(b);
  });

  it('refuses a loop end beyond the decoded content instead of planning silence', () => {
    expect(planStreamWindows(parsed, { ...options, loopEndSeconds: entry.loop.loopEnd + 30 })).toBeNull();
  });

  it('refuses a degenerate configuration', () => {
    expect(planStreamWindows(parsed, { ...options, loopEndSeconds: 0 })).toBeNull();
    expect(planStreamWindows(parsed, { ...options, coreSeconds: 0, loopEndSeconds: 10 })).toBeNull();
  });

  it('plans a 48 kHz file with no resampling (every packet is on the grid)', () => {
    const war = WAR_LAYER[2];
    const p48 = stream(war.file);
    expect(p48.nativeRate).toBe(48000);
    const plan = planStreamWindows(p48, { ...options, loopEndSeconds: war.loop.loopEnd })!;
    expect(plan.ratio).toEqual({ p: 1, q: 1 });
    // With no resampling the lead-in is just the nearest packet, a fraction of a second.
    for (const w of plan.windows.slice(1)) expect(w.coreStart - w.startFrame).toBeLessThan(0.5 * OUTPUT_RATE + 4096);
  });

  it('plans a context that runs at the file rate (no resampling the other way round)', () => {
    const plan = planStreamWindows(parsed, { ...options, outputRate: 44100, loopEndSeconds: entry.loop.loopEnd })!;
    expect(plan.ratio).toEqual({ p: 1, q: 1 });
    expect(plan.loopFrames).toBe(Math.round(entry.loop.loopEnd * 44100));
  });
});

describe('every catalogued long loop can be planned', () => {
  const entries: TrackEntry[] = [
    ...Object.values(ERA_BASE),
    ...Object.values(WAR_LAYER),
    ...Object.values(UNREST_LAYER).slice(0, 1),
    ...Object.values(DEFEAT_LAYER).slice(0, 1),
    BEAST_TERRITORY_LAYER,
    ...Object.values(ACCENT),
  ];

  for (const entry of entries) {
    it(`${entry.id} at 48 kHz and 44.1 kHz`, () => {
      const parsed = stream(entry.file);
      for (const outputRate of [48000, 44100]) {
        const plan = planStreamWindows(parsed, { outputRate, coreSeconds: 6, marginSeconds: 0.5, loopEndSeconds: entry.loop.loopEnd });
        expect(plan, `${entry.id} @ ${outputRate}`).not.toBeNull();
        expect(plan!.windows[plan!.windows.length - 1]!.coreEnd).toBe(plan!.loopFrames);
      }
    });
  }
});
