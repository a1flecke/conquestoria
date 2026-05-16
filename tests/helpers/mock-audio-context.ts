import { vi } from 'vitest';

export interface TranscriptEntry {
  time: number;
  op: string;
  nodeId: string;
  args: unknown[];
}

let nodeCounter = 0;

export class MockAudioParam {
  value = 0;

  constructor(
    private ctx: MockAudioContext,
    private transcript: TranscriptEntry[],
    public readonly nodeId: string,
  ) {}

  setValueAtTime(v: number, t: number): this {
    this.value = v;
    this.transcript.push({ time: this.ctx.currentTime, op: 'setValueAtTime', nodeId: this.nodeId, args: [v, t] });
    return this;
  }

  linearRampToValueAtTime(v: number, t: number): this {
    this.transcript.push({ time: this.ctx.currentTime, op: 'linearRampToValueAtTime', nodeId: this.nodeId, args: [v, t] });
    return this;
  }

  exponentialRampToValueAtTime(v: number, t: number): this {
    this.transcript.push({ time: this.ctx.currentTime, op: 'exponentialRampToValueAtTime', nodeId: this.nodeId, args: [v, t] });
    return this;
  }

  cancelScheduledValues(t: number): this {
    this.transcript.push({ time: this.ctx.currentTime, op: 'cancelScheduledValues', nodeId: this.nodeId, args: [t] });
    return this;
  }
}

export class MockGainNode {
  readonly id: string;
  readonly gain: MockAudioParam;
  readonly connectedTo: string[] = [];
  context: MockAudioContext;

  constructor(ctx: MockAudioContext, transcript: TranscriptEntry[]) {
    this.context = ctx;
    this.id = `gain-${nodeCounter++}`;
    this.gain = new MockAudioParam(ctx, transcript, this.id);
  }

  connect(dest: MockGainNode | MockBufferSourceNode | { id: string }): this {
    const destId = (dest as MockGainNode).id;
    this.connectedTo.push(destId);
    this.context.transcript.push({ time: this.context.currentTime, op: 'connect', nodeId: this.id, args: [destId] });
    return this;
  }

  disconnect(): void {
    this.context.transcript.push({ time: this.context.currentTime, op: 'disconnect', nodeId: this.id, args: [] });
  }
}

export class MockBufferSourceNode {
  readonly id: string;
  buffer: AudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  context: MockAudioContext;

  constructor(ctx: MockAudioContext, private transcript: TranscriptEntry[]) {
    this.context = ctx;
    this.id = `source-${nodeCounter++}`;
  }

  connect(dest: MockGainNode | { id: string }): this {
    const destId = (dest as MockGainNode).id;
    this.transcript.push({ time: this.context.currentTime, op: 'connect', nodeId: this.id, args: [destId] });
    return this;
  }

  start(when?: number): void {
    this.transcript.push({ time: this.context.currentTime, op: 'start', nodeId: this.id, args: [when ?? this.context.currentTime] });
  }

  stop(when?: number): void {
    this.transcript.push({ time: this.context.currentTime, op: 'stop', nodeId: this.id, args: [when ?? this.context.currentTime] });
    // Trigger onended synchronously so playOneShot Promise resolves in tests
    if (this.onended) {
      const cb = this.onended;
      this.onended = null;
      cb();
    }
  }
}

export class MockAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  currentTime = 0;
  sampleRate = 44100;
  transcript: TranscriptEntry[] = [];
  destination = { id: 'destination', context: undefined as unknown } as unknown as AudioDestinationNode;

  constructor() {
    (this.destination as unknown as { context: MockAudioContext }).context = this;
  }

  suspend = vi.fn().mockImplementation(() => {
    this.state = 'suspended';
    return Promise.resolve();
  });

  resume = vi.fn().mockImplementation(() => {
    this.state = 'running';
    return Promise.resolve();
  });

  close = vi.fn().mockImplementation(() => {
    this.state = 'closed';
    return Promise.resolve();
  });

  createGain(): MockGainNode {
    const node = new MockGainNode(this, this.transcript);
    this.transcript.push({ time: this.currentTime, op: 'createGain', nodeId: node.id, args: [] });
    return node;
  }

  createBufferSource(): MockBufferSourceNode {
    const node = new MockBufferSourceNode(this, this.transcript);
    this.transcript.push({ time: this.currentTime, op: 'createBufferSource', nodeId: node.id, args: [] });
    return node;
  }

  createBuffer(channels: number, frames: number, rate: number): AudioBuffer {
    return { numberOfChannels: channels, length: frames, sampleRate: rate, duration: frames / rate } as unknown as AudioBuffer;
  }

  decodeAudioData(_buf: ArrayBuffer): Promise<AudioBuffer> {
    return Promise.resolve(this.createBuffer(2, 44100, 44100));
  }

  opsOf(type: string): TranscriptEntry[] {
    return this.transcript.filter(e => e.op === type);
  }

  clearTranscript(): void {
    // Splice in place so nodes that captured a reference to this array still push here
    this.transcript.splice(0);
  }

  advanceTime(ms: number): void {
    this.currentTime += ms / 1000;
  }
}
