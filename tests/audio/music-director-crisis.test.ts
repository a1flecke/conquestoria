import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MusicDirector } from '../../src/audio/music-director';
import { STINGER } from '../../src/audio/audio-catalog';
import type { AudioMixer } from '../../src/audio/audio-mixer';
import type { AudioLoader } from '../../src/audio/audio-loader';

const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const fakeBuffer = {} as AudioBuffer;

function makeMixer(): AudioMixer {
  return {
    setSnapshot: vi.fn(),
    playOneShot: vi.fn().mockResolvedValue(undefined),
    setBusSource: vi.fn(),
    setMasterMusicVolume: vi.fn(),
    setMusicVolume: vi.fn(),
    setMusicEnabled: vi.fn(),
    setSfxVolume: vi.fn(),
    setSfxEnabled: vi.fn(),
    getSfxRoutingNode: vi.fn(),
    dispose: vi.fn(),
  } as unknown as AudioMixer;
}

function makeLoader(): AudioLoader {
  return {
    get: vi.fn().mockResolvedValue(fakeBuffer),
    preload: vi.fn().mockResolvedValue(undefined),
    isCached: vi.fn().mockReturnValue(false),
  } as unknown as AudioLoader;
}

describe('MusicDirector crisis snapshot', () => {
  let mixer: AudioMixer;
  let loader: AudioLoader;
  let director: MusicDirector;

  beforeEach(() => {
    mixer = makeMixer();
    loader = makeLoader();
    director = new MusicDirector(mixer, loader);
  });

  it('resolves to unrest snapshot when a crisis is active for the current player, at peace otherwise', () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    expect(director.resolveSnapshot()).toBe('peace');

    director.setCrisisActiveForCurrentPlayer(true);
    expect(director.resolveSnapshot()).toBe('unrest');

    director.setCrisisActiveForCurrentPlayer(false);
    expect(director.resolveSnapshot()).toBe('peace');
  });

  it('at-war priority is unchanged: still resolves at-war even with an active crisis', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'enemy', opponentKind: 'major' });
    director.setCrisisActiveForCurrentPlayer(true);
    expect(director.resolveSnapshot()).toBe('at-war');
  });

  it('plays the war-declared stinger placeholder on crisis onset without flipping atWar', async () => {
    director.handleCrisisStarted();
    await flushPromises();
    expect(loader.get).toHaveBeenCalledWith(STINGER.warDeclared.file);
    expect(director.resolveSnapshot()).not.toBe('at-war');
  });

  it('plays the peace-signed stinger placeholder on crisis resolution without flipping inUnrest', async () => {
    director.setCrisisActiveForCurrentPlayer(true);
    director.handleCrisisResolved();
    await flushPromises();
    expect(loader.get).toHaveBeenCalledWith(STINGER.peaceSigned.file);
    // crisisActiveForCurrentPlayer is a separate flag from the stinger — resolving the
    // stinger doesn't clear it; main.ts's own recompute does that via setCrisisActiveForCurrentPlayer.
    expect(director.resolveSnapshot()).toBe('unrest');
  });
});
