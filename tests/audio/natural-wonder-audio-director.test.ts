import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NaturalWonderAudioDirector } from '../../src/audio/natural-wonder-audio-director';

describe('NaturalWonderAudioDirector', () => {
  const mixer = {
    setAmbienceLoop: vi.fn(),
    stopAmbience: vi.fn(),
  };
  const loader = {
    get: vi.fn(async (path: string) => ({ path }) as unknown as AudioBuffer),
  };
  const playStingerWithDuck = vi.fn(async () => {});
  const timers = {
    setTimeout: vi.fn((_fn: () => void, _ms: number) => 7),
    clearTimeout: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays a ducked discovery stinger for complete MR1 entries', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await expect(director.playDiscoveryStinger('great_volcano')).resolves.toBe(true);

    expect(playStingerWithDuck).toHaveBeenCalledWith('audio/wonders/great-volcano-stinger.ogg');
  });

  it('does nothing for pending entries', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await expect(director.playDiscoveryStinger('sacred_mountain')).resolves.toBe(false);
    await expect(director.startCodexAmbient('sacred_mountain')).resolves.toBe(false);

    expect(loader.get).not.toHaveBeenCalled();
    expect(playStingerWithDuck).not.toHaveBeenCalled();
    expect(mixer.setAmbienceLoop).not.toHaveBeenCalled();
  });

  it('starts Codex ambience through the ambience loop path', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await expect(director.startCodexAmbient('coral_reef')).resolves.toBe(true);

    expect(loader.get).toHaveBeenCalledWith('audio/wonders/coral-reef-ambient.ogg');
    expect(mixer.setAmbienceLoop).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'audio/wonders/coral-reef-ambient.ogg' }),
      { loopStart: 0, loopEnd: 20 },
      700,
      0.30,
    );
  });

  it('starts map-focus ambience and schedules timeout cleanup', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await director.startMapFocusAmbient('ancient_forest');

    expect(timers.setTimeout).toHaveBeenCalledWith(expect.any(Function), 12000);
  });

  it('clears previous map-focus timeout when ambience changes or stops', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await director.startMapFocusAmbient('great_volcano');
    await director.startMapFocusAmbient('coral_reef');
    director.stopAmbient('panel-closed');

    expect(timers.clearTimeout).toHaveBeenCalledWith(7);
    expect(mixer.stopAmbience).toHaveBeenCalled();
  });

  it('replay plays a stinger and restarts ambient for complete entries', async () => {
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      loader as never,
      playStingerWithDuck,
      timers,
    );

    await expect(director.playCodexReplay('ancient_forest')).resolves.toBe(true);

    expect(playStingerWithDuck).toHaveBeenCalledWith('audio/wonders/ancient-forest-stinger.ogg');
    expect(loader.get).toHaveBeenCalledWith('audio/wonders/ancient-forest-ambient.ogg');
  });

  it('does not let stale map-focus loading override newer Codex ambience', async () => {
    const resolves = new Map<string, (buffer: AudioBuffer) => void>();
    const deferredLoader = {
      get: vi.fn((path: string) => new Promise<AudioBuffer>(resolve => {
        resolves.set(path, resolve);
      })),
    };
    const director = new NaturalWonderAudioDirector(
      mixer as never,
      deferredLoader as never,
      playStingerWithDuck,
      timers,
    );

    const mapFocus = director.startMapFocusAmbient('great_volcano');
    const codex = director.startCodexAmbient('coral_reef');
    resolves.get('audio/wonders/coral-reef-ambient.ogg')?.({ path: 'codex' } as unknown as AudioBuffer);
    await expect(codex).resolves.toBe(true);
    resolves.get('audio/wonders/great-volcano-ambient.ogg')?.({ path: 'map' } as unknown as AudioBuffer);
    await expect(mapFocus).resolves.toBe(false);

    expect(mixer.setAmbienceLoop).toHaveBeenCalledTimes(1);
    expect(timers.setTimeout).not.toHaveBeenCalled();
  });
});
