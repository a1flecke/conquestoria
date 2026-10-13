/**
 * Streamed playback of a long looping music track (#1466).
 *
 * `StreamedLoopTrack` is the parsed file plus its window plan (see `stream-plan.ts`). `prepare()` decodes the first
 * window, and the first time a track is used also proves, on this platform, that a window that starts mid-file
 * decodes to the same samples as the stream it was cut from. `PreparedStreamedLoop.createPlayer()` returns a
 * `StreamedLoopPlayer`, which keeps only the window that is playing and the next one decoded, scheduling each core on
 * the audio clock so consecutive cores join sample-accurately and the loop wraps at `loopEnd` exactly like a looping
 * `AudioBufferSourceNode` did.
 *
 * Failure policy: anything that stops a track being streamable (unparsable file, no plan, a failed known-answer check)
 * makes `StreamedLoopTrack.open` or `prepare` return `null`, and the caller falls back to the whole-file buffer.
 * A decode failure after playback has started is retried once, then playback ends at the last scheduled core and
 * `onFailure` fires; it never throws into the audio thread.
 */
import { buildWindowStream, parseOggVorbis, type OggVorbisStream } from './ogg-vorbis';
import { planStreamWindows, type StreamPlan, type StreamWindow } from './stream-plan';

export interface StreamContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
  createBufferSource(): AudioBufferSourceNode;
}

export interface StreamedLoopOptions {
  /** Seconds of audio each window plays. */
  coreSeconds: number;
  /** Seconds decoded before and after a core to absorb start-up transients. */
  marginSeconds: number;
  /** The next window is decoded once less than this many seconds of audio remain scheduled. */
  lookaheadSeconds: number;
}

export const DEFAULT_STREAM_OPTIONS: StreamedLoopOptions = {
  coreSeconds: 6,
  marginSeconds: 0.5,
  lookaheadSeconds: 4,
};

/** Largest sample difference tolerated between two decodes of the same audio. Float rounding is ~6e-8. */
const VERIFY_TOLERANCE = 1e-4;
const START_LEAD_SECONDS = 0.03;
const SAFETY_SECONDS = 0.01;
const PUMP_INTERVAL_MS = 500;

export class StreamedLoopTrack {
  private verification: Promise<boolean> | null = null;

  private constructor(
    readonly stream: OggVorbisStream,
    readonly plan: StreamPlan,
    readonly options: StreamedLoopOptions,
    readonly encodedBytes: number,
  ) {}

  /** Parses and plans; `null` when the file cannot be streamed exactly. */
  static open(
    ctx: Pick<StreamContext, 'sampleRate'>,
    bytes: Uint8Array,
    loop: { loopStart: number; loopEnd: number },
    options: StreamedLoopOptions = DEFAULT_STREAM_OPTIONS,
  ): StreamedLoopTrack | null {
    if (loop.loopStart !== 0) return null;
    let stream: OggVorbisStream;
    try {
      stream = parseOggVorbis(bytes);
    } catch {
      return null;
    }
    const plan = planStreamWindows(stream, {
      outputRate: ctx.sampleRate,
      loopEndSeconds: loop.loopEnd,
      coreSeconds: options.coreSeconds,
      marginSeconds: options.marginSeconds,
    });
    return plan ? new StreamedLoopTrack(stream, plan, options, bytes.byteLength) : null;
  }

  /** Decodes window `index`. */
  async decodeWindow(ctx: StreamContext, window: StreamWindow): Promise<AudioBuffer> {
    const bytes = buildWindowStream(this.stream, window.firstPacket, window.lastPacket);
    const buffer = await ctx.decodeAudioData(bytes.buffer as ArrayBuffer);
    // The core must lie wholly inside what came back, or this platform cut the window differently from the plan.
    if (buffer.length < window.coreEnd - window.startFrame) throw new Error('decoded window is shorter than its core');
    return buffer;
  }

  /**
   * Known-answer check: a small window that starts mid-file must reproduce window 0's samples where they overlap.
   * Run once per track; a platform whose decoder disagrees makes the track fall back to a whole-file buffer.
   */
  private async verify(ctx: StreamContext, first: AudioBuffer): Promise<boolean> {
    const { stream } = this;
    const { p, q } = this.plan.ratio;
    const rate = ctx.sampleRate;
    const firstWindow = this.plan.windows[0]!;
    const lastFrame = firstWindow.startFrame + first.length;
    // A packet on the resampler grid between 1 s and the end of window 0 (minus room for the comparison).
    let probe = -1;
    for (let i = 1; i < stream.packets.length; i++) {
      if (stream.granules[i]! % q !== 0) continue;
      const frame = (stream.granules[i]! / q) * p;
      if (frame < rate) continue;
      if (frame + 1.6 * rate > lastFrame) break;
      probe = i;
      break;
    }
    if (probe < 0) return false;
    const probeStart = (stream.granules[probe]! / q) * p;
    let probeEnd = probe + 1;
    const targetGranule = stream.granules[probe]! + Math.ceil((1.1 * rate * q) / p);
    while (probeEnd < stream.packets.length - 1 && stream.granules[probeEnd]! < targetGranule) probeEnd++;
    let mini: AudioBuffer;
    try {
      const bytes = buildWindowStream(stream, probe, probeEnd);
      mini = await ctx.decodeAudioData(bytes.buffer as ArrayBuffer);
    } catch {
      return false;
    }
    const from = Math.round(0.3 * rate);
    const to = Math.min(Math.round(0.9 * rate), mini.length);
    if (to <= from || mini.numberOfChannels !== first.numberOfChannels) return false;
    for (let channel = 0; channel < first.numberOfChannels; channel++) {
      const a = first.getChannelData(channel);
      const b = mini.getChannelData(channel);
      let max = 0;
      for (let i = from; i < to; i++) {
        const reference = a[probeStart - firstWindow.startFrame + i];
        if (reference === undefined) return false;
        max = Math.max(max, Math.abs(reference - b[i]!));
      }
      if (!(max <= VERIFY_TOLERANCE)) return false;
    }
    return true;
  }

  /** Decodes the first window and (once per track) verifies windowed decoding; `null` means "use a buffer". */
  async prepare(ctx: StreamContext): Promise<PreparedStreamedLoop | null> {
    let first: AudioBuffer;
    try {
      first = await this.decodeWindow(ctx, this.plan.windows[0]!);
    } catch {
      return null;
    }
    this.verification ??= this.verify(ctx, first);
    if (!(await this.verification)) return null;
    return new PreparedStreamedLoop(this, ctx, first);
  }
}

/** A track with its first window decoded: ready to start without waiting. */
export class PreparedStreamedLoop {
  constructor(
    readonly track: StreamedLoopTrack,
    private readonly ctx: StreamContext,
    private first: AudioBuffer | null,
  ) {}

  createPlayer(destination: AudioNode): StreamedLoopPlayer {
    const first = this.first;
    this.first = null; // ownership moves to the player
    return new StreamedLoopPlayer(this.ctx, this.track, destination, first);
  }

  /** Drops the decoded window of a loop that will never be played. */
  discard(): void {
    this.first = null;
  }
}

type PlayerState = 'idle' | 'playing' | 'stopping' | 'ended';

interface ScheduledNode { node: AudioBufferSourceNode }

export class StreamedLoopPlayer {
  /** Fires once, after the player has stopped and released everything it scheduled. */
  onended: (() => void) | null = null;
  /** Fires if a window cannot be decoded after a retry; playback ends at the last scheduled core. */
  onFailure: ((error: unknown) => void) | null = null;

  private state: PlayerState = 'idle';
  private t0 = 0;
  private scheduledFrames = 0;
  private nextIndex = 0;
  private decoding = false;
  private firstBuffer: AudioBuffer | null;
  private nodes = new Set<ScheduledNode>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private stopAt = 0;
  private retried = false;

  constructor(
    private readonly ctx: StreamContext,
    private readonly track: StreamedLoopTrack,
    private readonly destination: AudioNode,
    first: AudioBuffer | null,
  ) {
    this.firstBuffer = first;
  }

  get playing(): boolean {
    return this.state === 'playing';
  }

  start(): void {
    if (this.state !== 'idle') return;
    this.state = 'playing';
    this.t0 = this.ctx.currentTime + START_LEAD_SECONDS;
    this.timer = setInterval(() => this.pump(), PUMP_INTERVAL_MS);
    const first = this.firstBuffer;
    this.firstBuffer = null;
    if (first) {
      this.schedule(this.track.plan.windows[0]!, first);
      this.nextIndex = 1 % this.track.plan.windows.length;
    }
    this.pump();
  }

  /** Stops everything scheduled at context time `when` (now if it is in the past) and releases it afterwards. */
  stop(when: number): void {
    if (this.state === 'ended') return;
    if (this.state === 'idle') { this.finish(); return; }
    this.state = 'stopping';
    this.generation += 1; // abandons any decode in flight
    this.stopAt = Math.max(when, this.ctx.currentTime);
    for (const { node } of this.nodes) {
      try { node.stop(this.stopAt); } catch { /* already ended */ }
    }
    if (this.nodes.size === 0) this.finish();
  }

  /** Immediately silences and releases everything. */
  dispose(): void {
    if (this.state === 'ended') return;
    this.generation += 1;
    for (const { node } of [...this.nodes]) this.release(node);
    this.finish();
  }

  private finish(): void {
    if (this.state === 'ended') return;
    this.state = 'ended';
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.firstBuffer = null;
    const callback = this.onended;
    this.onended = null;
    callback?.();
  }

  private release(node: AudioBufferSourceNode): void {
    for (const entry of this.nodes) {
      if (entry.node === node) { this.nodes.delete(entry); break; }
    }
    node.onended = null;
    try { node.disconnect(); } catch { /* not connected */ }
    node.buffer = null;
  }

  private aheadSeconds(): number {
    return this.t0 + this.scheduledFrames / this.ctx.sampleRate - this.ctx.currentTime;
  }

  private pump(): void {
    if (this.state !== 'playing' || this.decoding) return;
    if (this.aheadSeconds() >= this.track.options.lookaheadSeconds) return;
    const windows = this.track.plan.windows;
    const window = windows[this.nextIndex]!;
    const generation = this.generation;
    this.decoding = true;
    this.track.decodeWindow(this.ctx, window).then(buffer => {
      this.decoding = false;
      if (generation !== this.generation || this.state !== 'playing') return; // stopped meanwhile: drop the buffer
      this.retried = false;
      this.schedule(window, buffer);
      this.nextIndex = (this.nextIndex + 1) % windows.length;
      this.pump();
    }, error => {
      this.decoding = false;
      if (generation !== this.generation || this.state !== 'playing') return;
      if (!this.retried) { this.retried = true; return; } // the interval tries once more
      this.state = 'stopping';
      if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
      this.onFailure?.(error);
      if (this.nodes.size === 0) this.finish();
    });
  }

  private schedule(window: StreamWindow, buffer: AudioBuffer): void {
    const rate = this.ctx.sampleRate;
    const coreFrames = window.coreEnd - window.coreStart;
    let offsetFrames = window.coreStart - window.startFrame;
    let frames = coreFrames;
    let when = this.t0 + this.scheduledFrames / rate;
    // The timeline is the audio clock's: if decoding ran late, skip what has already passed rather than slip.
    const earliest = this.ctx.currentTime + SAFETY_SECONDS;
    if (when < earliest) {
      const skip = Math.ceil((earliest - when) * rate);
      this.scheduledFrames += coreFrames;
      if (skip >= frames) return;
      offsetFrames += skip;
      frames -= skip;
      when += skip / rate;
    } else {
      this.scheduledFrames += coreFrames;
    }
    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(this.destination);
    const entry: ScheduledNode = { node };
    this.nodes.add(entry);
    node.onended = () => {
      this.release(node);
      if (this.state === 'stopping' && this.nodes.size === 0) this.finish();
    };
    node.start(when, offsetFrames / rate, frames / rate);
  }
}
