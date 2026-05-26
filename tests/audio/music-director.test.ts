import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MusicDirector } from '../../src/audio/music-director';
import type { AudioMixer } from '../../src/audio/audio-mixer';
import type { AudioLoader } from '../../src/audio/audio-loader';

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

// Flush all pending microtasks + one macrotask turn
const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('MusicDirector', () => {
  let mixer: AudioMixer;
  let loader: AudioLoader;
  let director: MusicDirector;

  beforeEach(() => {
    mixer = makeMixer();
    loader = makeLoader();
    director = new MusicDirector(mixer, loader);
  });

  // --- handleEraAdvanced ---

  it('transitions to peace snapshot when era advances from silent', () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    expect(mixer.setSnapshot).toHaveBeenCalledWith('peace', expect.any(Number));
  });

  it('stays at-war when era advances while at war', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'enemy', opponentKind: 'major' });
    vi.mocked(mixer.setSnapshot).mockClear();
    director.handleEraAdvanced({ era: 2, civType: 'rome' });
    expect(mixer.setSnapshot).toHaveBeenCalledWith('at-war', expect.any(Number));
  });

  it('plays era-transition stinger when era advances', async () => {
    director.handleEraAdvanced({ era: 2, civType: 'rome' });
    await flushPromises();
    expect(mixer.playOneShot).toHaveBeenCalledWith('stinger', fakeBuffer);
  });

  // --- handleWarDeclared ---

  it('transitions to at-war snapshot on war declared', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'enemy', opponentKind: 'major' });
    expect(mixer.setSnapshot).toHaveBeenCalledWith('at-war', expect.any(Number));
  });

  it('plays war-stinger on war declared', async () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'enemy', opponentKind: 'major' });
    await flushPromises();
    expect(mixer.playOneShot).toHaveBeenCalledWith('stinger', fakeBuffer);
  });

  it('minor opponent triggers at-war snapshot', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'sparta', opponentKind: 'minor' });
    expect(mixer.setSnapshot).toHaveBeenCalledWith('at-war', expect.any(Number));
  });

  it('barbarian opponent triggers at-war snapshot', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'barbarian-1', opponentKind: 'barbarian' });
    expect(mixer.setSnapshot).toHaveBeenCalledWith('at-war', expect.any(Number));
  });

  // --- handlePeaceSigned ---

  it('transitions to peace when last war ends', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'enemy', opponentKind: 'major' });
    director.handlePeaceSigned({ remainingWars: 0 });
    expect(mixer.setSnapshot).toHaveBeenLastCalledWith('peace', expect.any(Number));
  });

  it('stays at-war when peace signed but other wars remain', () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'a', opponentKind: 'major' });
    director.handleWarDeclared({ aggressor: 'player', defender: 'b', opponentKind: 'major' });
    vi.mocked(mixer.setSnapshot).mockClear();
    director.handlePeaceSigned({ remainingWars: 1 });
    expect(mixer.setSnapshot).not.toHaveBeenCalledWith('peace', expect.any(Number));
  });

  // --- handleCityFounded ---

  it('plays city-founded stinger', async () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    director.handleCityFounded({ civType: 'rome' });
    await flushPromises();
    expect(mixer.playOneShot).toHaveBeenCalledWith('stinger', fakeBuffer);
  });

  it('city-founded stinger does not change intendedSnapshot', async () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    await flushPromises();
    vi.mocked(mixer.setSnapshot).mockClear();
    director.handleCityFounded({ civType: 'rome' });
    await flushPromises();
    // After stinger resolves, snapshot is restored to peace (not permanently changed)
    expect(mixer.setSnapshot).toHaveBeenLastCalledWith('peace', expect.any(Number));
  });

  // --- handlePlayerChanged ---

  it('reloads current music context without changing snapshot', () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    vi.mocked(mixer.setSnapshot).mockClear();
    director.handlePlayerChanged({ civType: 'egypt' });
    // Snapshot re-applied to reload the correct accent track for the new civ
    expect(mixer.setSnapshot).toHaveBeenCalledWith('peace', expect.any(Number));
  });

  // --- handleGameEnded ---

  it('transitions to silent on game end', () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    director.handleGameEnded({ outcome: 'victory' });
    expect(mixer.setSnapshot).toHaveBeenLastCalledWith('silent', expect.any(Number));
  });

  // --- transition-event regressions ---

  it('regression: war then peace then war returns to at-war (not peace)', async () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    director.handleWarDeclared({ aggressor: 'player', defender: 'a', opponentKind: 'major' });
    director.handlePeaceSigned({ remainingWars: 0 });
    director.handleWarDeclared({ aggressor: 'player', defender: 'b', opponentKind: 'major' });
    await flushPromises();
    const lastCall = vi.mocked(mixer.setSnapshot).mock.calls.at(-1)!;
    expect(lastCall[0]).toBe('at-war');
  });

  it('regression: overlapping stinger duck resolves correctly', () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    // Two stingers fired in succession — second should still duck to stinger-duck
    director.handleWarDeclared({ aggressor: 'p', defender: 'a', opponentKind: 'major' });
    director.handleCityFounded({ civType: 'rome' });
    // After all sync calls, at-war was set and last sync call is stinger-duck (not peace)
    const snapshotCalls = vi.mocked(mixer.setSnapshot).mock.calls.map(c => c[0]);
    expect(snapshotCalls).toContain('at-war');
    expect(snapshotCalls.at(-1)).not.toBe('peace');
  });

  // --- initPeaceSnapshot ---

  it('initPeaceSnapshot sets intendedSnapshot so stinger restore returns to peace', async () => {
    director.initPeaceSnapshot();
    director.handleCityFounded({ civType: 'rome' });
    await flushPromises();
    const lastSnapshot = vi.mocked(mixer.setSnapshot).mock.calls.at(-1)![0];
    expect(lastSnapshot).toBe('peace');
  });

  it('handleCityFounded without initPeaceSnapshot restores to silent (regression guard — confirms bug existed)', async () => {
    // Default intendedSnapshot is 'silent'. This test proves the pre-fix behavior.
    director.handleCityFounded({ civType: 'rome' });
    await flushPromises();
    const lastSnapshot = vi.mocked(mixer.setSnapshot).mock.calls.at(-1)![0];
    expect(lastSnapshot).toBe('silent');
  });

  it('initPeaceSnapshot calls mixer.setSnapshot("peace", 0) immediately', () => {
    director.initPeaceSnapshot();
    expect(mixer.setSnapshot).toHaveBeenCalledWith('peace', 0);
  });
});
