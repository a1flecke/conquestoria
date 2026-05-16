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

    // Two attempts for a failed URL is acceptable
    expect(loader.isCached('audio/flaky.ogg')).toBe(false);
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
