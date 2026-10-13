import { parseOggVorbis } from '@/audio/ogg-vorbis';
import type { StreamContext } from '@/audio/streamed-loop';

/**
 * A fake audio context for the streamed-loop tests: a clock the test advances, decodes that return silent buffers of
 * exactly the length a real decode of the given window stream would, and scheduled source nodes that end when the
 * clock passes their end (or their `stop` time), like the real thing.
 */
export class FakeSourceNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  started: { when: number; offset: number; duration: number } | null = null;
  stoppedAt: number | null = null;
  connectedTo: unknown = null;
  disconnected = false;
  ended = false;

  start(when: number, offset: number, duration: number): void {
    this.started = { when, offset, duration };
  }

  stop(when: number): void {
    this.stoppedAt = when;
  }

  connect(destination: unknown): void {
    this.connectedTo = destination;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  /** The time this node stops producing sound. */
  get endTime(): number {
    if (!this.started) return Infinity;
    const natural = this.started.when + this.started.duration;
    // Web Audio: a node stopped before it starts never sounds, and still fires `ended` at the stop time.
    return this.stoppedAt === null ? natural : Math.min(natural, this.stoppedAt);
  }
}

export interface FakeDecode { frames: number; channels: number }

export class FakeStreamContext implements StreamContext {
  currentTime = 0;
  readonly nodes: FakeSourceNode[] = [];
  readonly decodes: FakeDecode[] = [];
  /** Delay (in advance() ticks) before a decode resolves; 0 resolves on the next microtask. */
  decodeFails: (() => boolean) | null = null;
  private pendingDecodes: Array<() => void> = [];
  holdDecodes = false;

  constructor(readonly sampleRate = 48000, private readonly channels = 2) {}

  async decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    const stream = parseOggVorbis(new Uint8Array(data));
    const native = stream.granules[stream.granules.length - 1]!;
    const frames = Math.round((native * this.sampleRate) / stream.nativeRate);
    this.decodes.push({ frames, channels: this.channels });
    if (this.holdDecodes) await new Promise<void>(resolve => this.pendingDecodes.push(resolve));
    if (this.decodeFails?.()) throw new Error('decode failed');
    const channels = this.channels;
    return {
      length: frames,
      numberOfChannels: channels,
      sampleRate: this.sampleRate,
      duration: frames / this.sampleRate,
      getChannelData: () => new Float32Array(frames),
    } as unknown as AudioBuffer;
  }

  /** Lets held decodes finish. */
  releaseDecodes(): void {
    const waiting = this.pendingDecodes;
    this.pendingDecodes = [];
    for (const resolve of waiting) resolve();
  }

  createBufferSource(): AudioBufferSourceNode {
    const node = new FakeSourceNode();
    this.nodes.push(node);
    return node as unknown as AudioBufferSourceNode;
  }

  /** Moves the clock forward and ends every node whose time has come. */
  advance(seconds: number): void {
    this.currentTime += seconds;
    for (const node of this.nodes) {
      if (!node.started || node.ended) continue;
      if (node.endTime <= this.currentTime) {
        node.ended = true;
        node.onended?.();
      }
    }
  }

  /** Nodes that are connected and not yet ended: what is actually holding a decoded buffer. */
  liveNodes(): FakeSourceNode[] {
    return this.nodes.filter(node => !node.ended && !node.disconnected);
  }

  liveBuffers(): AudioBuffer[] {
    return this.liveNodes().map(node => node.buffer).filter((buffer): buffer is AudioBuffer => buffer !== null);
  }
}
