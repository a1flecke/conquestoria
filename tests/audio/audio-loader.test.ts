import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockAudioContext } from '../helpers/mock-audio-context';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AudioLoader, discardLoopSource } from '../../src/audio/audio-loader';
import { PreparedStreamedLoop } from '../../src/audio/streamed-loop';
import { FakeStreamContext } from './helpers/fake-stream-context';

function makeLoader() {
  const ctx = new MockAudioContext();
  return { ctx, loader: new AudioLoader(ctx as unknown as AudioContext) };
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOk() {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as Response);
}

function mockFetchFail() {
  vi.mocked(globalThis.fetch).mockRejectedValue(new Error('network error'));
}

describe('AudioLoader.get()', () => {
  it('fetches and returns an AudioBuffer on the first call', async () => {
    mockFetchOk();
    const { loader } = makeLoader();

    const buf = await loader.get('audio/era/era1-base.ogg');

    expect(buf).toBeTruthy();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('caches: same URL called twice → only one fetch', async () => {
    mockFetchOk();
    const { loader } = makeLoader();

    await loader.get('audio/era/era1-base.ogg');
    await loader.get('audio/era/era1-base.ogg');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('isCached() returns true after a successful fetch', async () => {
    mockFetchOk();
    const { loader } = makeLoader();

    expect(loader.isCached('audio/era/era1-base.ogg')).toBe(false);
    await loader.get('audio/era/era1-base.ogg');
    expect(loader.isCached('audio/era/era1-base.ogg')).toBe(true);
  });

  it('returns a silent fallback buffer (not a rejection) when fetch fails', async () => {
    mockFetchFail();
    const { loader } = makeLoader();

    const result = await loader.get('audio/missing.ogg');

    expect(result).toBeTruthy();
  });

  it('does not cache failed fetches (can retry)', async () => {
    mockFetchFail();
    const { loader } = makeLoader();

    await loader.get('audio/flaky.ogg');
    await loader.get('audio/flaky.ogg');

    expect(loader.isCached('audio/flaky.ogg')).toBe(false);
    // Each failed call must issue its own fetch (inflight map must clear on failure)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('concurrent fetches for the same URL share one inflight Promise', async () => {
    mockFetchOk();
    const { loader } = makeLoader();

    // Start two fetches simultaneously
    const [a, b] = await Promise.all([
      loader.get('audio/era/era1-base.ogg'),
      loader.get('audio/era/era1-base.ogg'),
    ]);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
});

describe('AudioLoader.preload()', () => {
  it('does not reject when individual URLs fail', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response)
      .mockRejectedValueOnce(new Error('gone'));

    const { loader } = makeLoader();

    await expect(
      loader.preload(['audio/era/era1-base.ogg', 'audio/missing.ogg']),
    ).resolves.toBeUndefined();
  });

  it('caches successful URLs from preload', async () => {
    mockFetchOk();
    const { loader } = makeLoader();

    await loader.preload(['audio/era/era1-base.ogg', 'audio/era/era2-base.ogg']);

    expect(loader.isCached('audio/era/era1-base.ogg')).toBe(true);
    expect(loader.isCached('audio/era/era2-base.ogg')).toBe(true);
  });
});

describe('#1439 decoded residency', () => {
  it('evicts by bytes and refreshes least-recently-used order on a hit', async () => {
    mockFetchOk();
    const ctx = new MockAudioContext();
    vi.spyOn(ctx, 'decodeAudioData').mockImplementation(async () => ctx.createBuffer(1, 2, 44100));
    const loader = new AudioLoader(ctx as unknown as AudioContext, 16);
    await loader.get('a');
    await loader.get('b');
    await loader.get('a');
    await loader.get('c');
    expect(loader.isCached('a')).toBe(true);
    expect(loader.isCached('b')).toBe(false);
    expect(loader.isCached('c')).toBe(true);
  });

  it('does not permanently cache a track larger than the byte budget', async () => {
    mockFetchOk();
    const ctx = new MockAudioContext();
    const loader = new AudioLoader(ctx as unknown as AudioContext, 8);
    expect(await loader.get('large')).toBeTruthy();
    expect(loader.isCached('large')).toBe(false);
  });

  it('clear prevents an old decode from repopulating or removing a newer inflight request', async () => {
    mockFetchOk();
    const { loader, ctx } = makeLoader();
    const resolvers: Array<(buffer: AudioBuffer) => void> = [];
    vi.spyOn(ctx, 'decodeAudioData').mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    const first = loader.get('a');
    await vi.waitFor(() => expect(resolvers).toHaveLength(1));
    loader.clear();
    const second = loader.get('a');
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[0]!(ctx.createBuffer(1, 2, 44100));
    await first;
    expect(loader.isCached('a')).toBe(false);
    expect(loader.get('a')).toBe(second);
    resolvers[1]!(ctx.createBuffer(1, 3, 44100));
    await second;
    expect(loader.isCached('a')).toBe(true);
  });

  it('fetches the offline catalog without decoding or retaining PCM', async () => {
    mockFetchOk();
    const { loader, ctx } = makeLoader();
    const decode = vi.spyOn(ctx, 'decodeAudioData');
    await loader.prefetch(['a', 'b', 'a']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(decode).not.toHaveBeenCalled();
    expect(loader.isCached('a')).toBe(false);
    await loader.get('a');
    expect(decode).toHaveBeenCalledTimes(1);
  });
});

// #1466: long looping music is streamed when the file can be played that way exactly, and is the whole buffer otherwise.
describe('AudioLoader.getLoop()', () => {
  const WAR = { file: 'audio/war/era1-war.ogg', loop: { loopStart: 0, loopEnd: 72.426 } };

  function realBytes(): ArrayBuffer {
    const raw = readFileSync(resolve(process.cwd(), 'public', WAR.file));
    return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  }

  function streamingLoader(options: { streaming?: boolean; budget?: number } = {}) {
    const ctx = Object.assign(new FakeStreamContext(), {
      createBuffer: (channels: number, length: number, sampleRate: number) => ({ length, numberOfChannels: channels, sampleRate }),
    });
    const loader = new AudioLoader(ctx as unknown as AudioContext, options.budget, options.streaming);
    return { ctx, loader };
  }

  function serve(body: () => ArrayBuffer) {
    vi.mocked(globalThis.fetch).mockImplementation(async () => ({ ok: true, arrayBuffer: async () => body() }) as unknown as Response);
  }

  it('returns a prepared stream for a streamable track and keeps no decoded whole-file buffer', async () => {
    serve(realBytes);
    const { loader } = streamingLoader();
    const source = await loader.getLoop(WAR);
    expect(source).toBeInstanceOf(PreparedStreamedLoop);
    expect(loader.isCached(WAR.file)).toBe(false);
    discardLoopSource(source);
  });

  it('reuses the parsed track: the second request does not fetch the file again', async () => {
    serve(realBytes);
    const { loader } = streamingLoader();
    discardLoopSource(await loader.getLoop(WAR));
    discardLoopSource(await loader.getLoop(WAR));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the whole buffer for a file that is not Ogg Vorbis, and remembers that verdict', async () => {
    serve(() => new ArrayBuffer(64));
    const { loader } = streamingLoader();
    expect(await loader.getLoop(WAR)).not.toBeInstanceOf(PreparedStreamedLoop);
    const afterFirst = vi.mocked(globalThis.fetch).mock.calls.length;
    expect(await loader.getLoop(WAR)).not.toBeInstanceOf(PreparedStreamedLoop);
    // Only the whole-buffer path fetches the second time: the file is not parsed for streaming again.
    expect(vi.mocked(globalThis.fetch).mock.calls.length - afterFirst).toBe(1);
  });

  it('falls back to the whole buffer when streaming is disabled', async () => {
    serve(realBytes);
    const { loader } = streamingLoader({ streaming: false });
    expect(await loader.getLoop(WAR)).not.toBeInstanceOf(PreparedStreamedLoop);
  });

  it('falls back when the request fails, without remembering a verdict about the file', async () => {
    mockFetchFail();
    const { loader } = streamingLoader();
    expect(await loader.getLoop(WAR)).not.toBeInstanceOf(PreparedStreamedLoop);
    serve(realBytes);
    const source = await loader.getLoop(WAR);
    expect(source).toBeInstanceOf(PreparedStreamedLoop);
    discardLoopSource(source);
  });

  it('treats an HTTP error status as a failed request, not as a file that cannot stream', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response);
    const { loader } = streamingLoader();
    await loader.getLoop(WAR);
    serve(realBytes);
    const source = await loader.getLoop(WAR);
    expect(source).toBeInstanceOf(PreparedStreamedLoop);
    discardLoopSource(source);
  });

  it('does not hand out a stream for a request that was superseded by clear()', async () => {
    serve(realBytes);
    const { loader } = streamingLoader();
    const pending = loader.getLoop(WAR);
    loader.clear();
    expect(await pending).not.toBeInstanceOf(PreparedStreamedLoop);
  });

  it('never retains a parsed track larger than the byte budget', async () => {
    serve(realBytes);
    const { loader } = streamingLoader({ budget: 1024 });
    discardLoopSource(await loader.getLoop(WAR));
    discardLoopSource(await loader.getLoop(WAR));
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
