import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_STREAM_OPTIONS,
  PreparedStreamedLoop,
  StreamedLoopPlayer,
  StreamedLoopTrack,
} from '@/audio/streamed-loop';
import { FakeStreamContext, type FakeSourceNode } from './helpers/fake-stream-context';

// #1466: the player keeps only the window that is playing and the next one, and lays the cores end to end on the
// audio clock. The decoding itself is proven against the real decoder in tests/e2e/issue-1466-streamed-music.spec.ts;
// here the clock, the node lifecycle and the failure paths are driven deterministically.

const WAR = { file: 'audio/war/era1-war.ogg', loop: { loopStart: 0, loopEnd: 72.426 } };

function bytes(file: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(process.cwd(), 'public', file)));
}

function openTrack(ctx: FakeStreamContext, options = DEFAULT_STREAM_OPTIONS): StreamedLoopTrack {
  const track = StreamedLoopTrack.open(ctx, bytes(WAR.file), WAR.loop, options);
  if (!track) throw new Error('war track should be streamable');
  return track;
}

/** Advance the audio clock and the pump timer together, letting decodes settle. */
async function tick(ctx: FakeStreamContext, seconds: number): Promise<void> {
  const step = 0.25;
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += step) {
    ctx.advance(step);
    await vi.advanceTimersByTimeAsync(step * 1000);
  }
}

const destination = {} as AudioNode;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('StreamedLoopTrack.open', () => {
  const ctx = new FakeStreamContext();

  it('opens a real track and plans windows that tile the loop', () => {
    const track = openTrack(ctx);
    expect(track.plan.windows.length).toBeGreaterThan(5);
    expect(track.encodedBytes).toBeGreaterThan(500_000);
  });

  it('refuses what it cannot stream exactly', () => {
    expect(StreamedLoopTrack.open(ctx, new Uint8Array(100), WAR.loop)).toBeNull();
    expect(StreamedLoopTrack.open(ctx, bytes(WAR.file), { loopStart: 2, loopEnd: 60 })).toBeNull();
    expect(StreamedLoopTrack.open(ctx, bytes(WAR.file), { loopStart: 0, loopEnd: 500 })).toBeNull();
  });
});

describe('StreamedLoopTrack.prepare', () => {
  it('decodes the first window and verifies windowed decoding once per track', async () => {
    const ctx = new FakeStreamContext();
    const track = openTrack(ctx);
    const prepared = await track.prepare(ctx);
    expect(prepared).toBeInstanceOf(PreparedStreamedLoop);
    expect(ctx.decodes).toHaveLength(2); // window 0 plus the small known-answer window
    await track.prepare(ctx);
    expect(ctx.decodes).toHaveLength(3); // the second prepare re-decodes window 0 only: it is already verified
  });

  it('answers null when the first window cannot be decoded', async () => {
    const ctx = new FakeStreamContext();
    ctx.decodeFails = () => true;
    expect(await openTrack(ctx).prepare(ctx)).toBeNull();
  });

  it('answers null when a mid-file window disagrees with the file it was cut from', async () => {
    const ctx = new FakeStreamContext();
    const decode = ctx.decodeAudioData.bind(ctx);
    let calls = 0;
    ctx.decodeAudioData = async (data: ArrayBuffer) => {
      const buffer = await decode(data);
      calls += 1;
      if (calls === 2) {
        // The known-answer window: return audio that differs from window 0 (a platform that cut it differently).
        return { ...buffer, getChannelData: () => new Float32Array(buffer.length).fill(0.5) } as unknown as AudioBuffer;
      }
      return buffer;
    };
    expect(await openTrack(ctx).prepare(ctx)).toBeNull();
  });

  it('answers null when the known-answer window cannot be decoded', async () => {
    const ctx = new FakeStreamContext();
    let calls = 0;
    ctx.decodeFails = () => ++calls === 2;
    expect(await openTrack(ctx).prepare(ctx)).toBeNull();
  });
});

describe('StreamedLoopPlayer', () => {
  async function started(options = DEFAULT_STREAM_OPTIONS) {
    const ctx = new FakeStreamContext();
    const track = openTrack(ctx, options);
    const prepared = (await track.prepare(ctx))!;
    const player = prepared.createPlayer(destination);
    player.start();
    return { ctx, track, player };
  }

  const startedNodes = (ctx: FakeStreamContext): FakeSourceNode[] =>
    ctx.nodes.filter(node => node.started).sort((a, b) => a.started!.when - b.started!.when);

  it('schedules the first core immediately, offset into its window by the lead-in', async () => {
    const { ctx, track } = await started();
    const [first] = startedNodes(ctx);
    const window0 = track.plan.windows[0]!;
    expect(first!.started!.when).toBeCloseTo(0.03, 6);
    expect(first!.started!.offset).toBeCloseTo((window0.coreStart - window0.startFrame) / 48000, 9);
    expect(first!.started!.duration).toBeCloseTo((window0.coreEnd - window0.coreStart) / 48000, 9);
    expect(first!.connectedTo).toBe(destination);
  });

  it('lays consecutive cores end to end with no gap or overlap, across the loop wrap', async () => {
    const { ctx, track } = await started();
    await tick(ctx, 160); // more than two trips round a 72 s loop
    const nodes = startedNodes(ctx);
    expect(nodes.length).toBeGreaterThan(track.plan.windows.length * 2);
    for (let i = 1; i < nodes.length; i++) {
      const previous = nodes[i - 1]!.started!;
      expect(nodes[i]!.started!.when).toBeCloseTo(previous.when + previous.duration, 9);
    }
    // The first window after the wrap starts exactly one loop length after the first window did.
    const loop = track.plan.loopFrames / 48000;
    const wrapNode = nodes[track.plan.windows.length]!;
    expect(wrapNode.started!.when - nodes[0]!.started!.when).toBeCloseTo(loop, 9);
    expect(wrapNode.started!.offset).toBeCloseTo(nodes[0]!.started!.offset, 9);
  });

  it('holds at most the playing window, the next one and one finishing: memory stays bounded', async () => {
    const { ctx } = await started();
    let peak = 0;
    for (let i = 0; i < 200; i++) {
      await tick(ctx, 1);
      peak = Math.max(peak, ctx.liveBuffers().length);
    }
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThanOrEqual(2);
  });

  it('does not decode ahead of need: a window is fetched only once less than the lookahead remains', async () => {
    const { ctx } = await started();
    const decodesAfterStart = ctx.decodes.length;
    await tick(ctx, 1); // nothing needed yet beyond the next window
    expect(ctx.decodes.length).toBeLessThanOrEqual(decodesAfterStart + 1);
    const before = ctx.decodes.length;
    await tick(ctx, 0.5);
    expect(ctx.decodes.length).toBe(before);
  });

  it('stop(when) stops every scheduled node at that time and releases them once they have ended', async () => {
    const { ctx, player } = await started();
    await tick(ctx, 3);
    const ended = vi.fn();
    player.onended = ended;
    player.stop(ctx.currentTime + 2);
    expect(startedNodes(ctx).every(node => node.stoppedAt === ctx.currentTime + 2)).toBe(true);
    expect(ended).not.toHaveBeenCalled();
    const decodes = ctx.decodes.length;
    await tick(ctx, 2.5);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ctx.liveNodes()).toHaveLength(0);
    expect(ctx.nodes.every(node => node.buffer === null)).toBe(true);
    expect(ctx.decodes.length).toBe(decodes); // nothing more was decoded after the stop
  });

  it('drops a window that finished decoding after stop', async () => {
    const { ctx, player } = await started();
    ctx.holdDecodes = true;
    await tick(ctx, 3); // the pump wants the next window; its decode is held
    const nodesBefore = ctx.nodes.length;
    player.stop(ctx.currentTime);
    ctx.holdDecodes = false;
    ctx.releaseDecodes();
    await tick(ctx, 1);
    expect(ctx.nodes.length).toBe(nodesBefore); // the late window was never scheduled
  });

  it('dispose releases everything at once and stops decoding', async () => {
    const { ctx, player } = await started();
    await tick(ctx, 3);
    const ended = vi.fn();
    player.onended = ended;
    const decodes = ctx.decodes.length;
    player.dispose();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ctx.liveNodes()).toHaveLength(0);
    await tick(ctx, 10);
    expect(ctx.decodes.length).toBe(decodes);
    player.dispose(); // idempotent
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('stopping a player that was never started just releases it', async () => {
    const ctx = new FakeStreamContext();
    const prepared = (await openTrack(ctx).prepare(ctx))!;
    const player = prepared.createPlayer(destination);
    const ended = vi.fn();
    player.onended = ended;
    player.stop(1);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(player.playing).toBe(false);
  });

  it('catches up when a decode finishes late: skips what already played and stays on the clock grid', async () => {
    const { ctx, track } = await started();
    ctx.holdDecodes = true;
    await tick(ctx, 5); // window 1 is due at t = 6.03 but its decode is held
    ctx.advance(2.5); // now 7.5 s: 1.47 s of window 1 has already gone by
    ctx.holdDecodes = false;
    ctx.releaseDecodes();
    await vi.advanceTimersByTimeAsync(0);
    await tick(ctx, 0.5);
    const nodes = startedNodes(ctx);
    const late = nodes[1]!;
    const window1 = track.plan.windows[1]!;
    const skipped = late.started!.offset - (window1.coreStart - window1.startFrame) / 48000;
    expect(skipped).toBeGreaterThan(1.3);
    expect(late.started!.when).toBeGreaterThanOrEqual(7.5);
    // The audio that does play is the right audio at the right time: its end is where the window's core ends.
    expect(late.started!.when + late.started!.duration).toBeCloseTo(0.03 + window1.coreEnd / 48000, 6);
    // And the next window is back on the original grid.
    ctx.holdDecodes = false;
    await tick(ctx, 6);
    const next = startedNodes(ctx)[2]!;
    expect(next.started!.when).toBeCloseTo(0.03 + track.plan.windows[2]!.coreStart / 48000, 6);
  });

  it('retries a failed decode once and reports failure if it fails again, ending at the last scheduled core', async () => {
    const { ctx, player } = await started();
    const failure = vi.fn();
    const ended = vi.fn();
    player.onFailure = failure;
    player.onended = ended;
    ctx.decodeFails = () => true;
    await tick(ctx, 5);
    expect(failure).toHaveBeenCalledTimes(1);
    await tick(ctx, 4); // the first core finishes
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ctx.liveNodes()).toHaveLength(0);
  });

  it('recovers silently from a single failed decode', async () => {
    const { ctx, player } = await started();
    const failure = vi.fn();
    player.onFailure = failure;
    let first = true;
    ctx.decodeFails = () => { if (first) { first = false; return true; } return false; };
    await tick(ctx, 8);
    expect(failure).not.toHaveBeenCalled();
    expect(startedNodes(ctx).length).toBeGreaterThanOrEqual(2);
  });

  it('start is idempotent', async () => {
    const { ctx, player } = await started();
    const count = ctx.nodes.length;
    player.start();
    expect(ctx.nodes.length).toBe(count);
  });
});

describe('PreparedStreamedLoop', () => {
  it('hands its decoded window to exactly one player, and discard releases it', async () => {
    const ctx = new FakeStreamContext();
    const prepared = (await openTrack(ctx).prepare(ctx))!;
    prepared.discard();
    const player = prepared.createPlayer(destination);
    player.start(); // no first window to schedule: it waits for the pump to decode one
    expect(ctx.nodes.filter(node => node.started)).toHaveLength(0);
    player.dispose();
    expect(player).toBeInstanceOf(StreamedLoopPlayer);
  });
});
