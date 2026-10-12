import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockAudioContext } from '../helpers/mock-audio-context';
import { AudioLoader } from '../../src/audio/audio-loader';

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
