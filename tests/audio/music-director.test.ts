import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MusicDirector } from '../../src/audio/music-director';
import { STINGER, resolveEra } from '../../src/audio/audio-catalog';
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

  it('plays eraAdvance stinger for the resolved era', async () => {
    director.handleEraAdvanced({ era: 3, civType: 'rome' });
    await flushPromises();
    expect(loader.get).toHaveBeenCalledWith(STINGER.eraAdvance[resolveEra(3)].file);
  });

  it('era advance fires both transition-cue and eraAdvance stingers (2 playOneShot calls)', async () => {
    director.handleEraAdvanced({ era: 2, civType: 'rome' });
    await flushPromises();
    const stingerCalls = vi.mocked(mixer.playOneShot).mock.calls.filter(([bus]) => bus === 'stinger');
    expect(stingerCalls).toHaveLength(2);
  });

  it('era advance stingers duck and restore sequentially — cue finishes before advance starts', async () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    await flushPromises();
    const snapshots = vi.mocked(mixer.setSnapshot).mock.calls.map(([s]) => s);
    // Filter to snapshot-duck/restore sequence only (excludes CROSSFADE_MS era/war transitions)
    const duckRestorePattern = snapshots.filter(s => s === 'stinger-duck' || s === 'peace');
    // Sequential: peace(era-crossfade), stinger-duck(cue), peace(cue-restore),
    //             stinger-duck(advance), peace(advance-restore)
    // Concurrent (broken): peace, stinger-duck, stinger-duck, peace, peace
    expect(duckRestorePattern).toEqual(['peace', 'stinger-duck', 'peace', 'stinger-duck', 'peace']);
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

  it('transitions to peace when last war ends (after peace stinger completes)', async () => {
    director.handleWarDeclared({ aggressor: 'player', defender: 'enemy', opponentKind: 'major' });
    director.handlePeaceSigned({ remainingWars: 0 });
    await flushPromises();
    const snapshots = vi.mocked(mixer.setSnapshot).mock.calls.map(c => c[0]);
    // stinger-duck must come BEFORE the peace restore (no premature peace crossfade)
    const firstDuckIdx  = snapshots.indexOf('stinger-duck');
    const lastPeaceIdx  = snapshots.lastIndexOf('peace');
    expect(firstDuckIdx).toBeGreaterThanOrEqual(0);
    expect(lastPeaceIdx).toBeGreaterThan(firstDuckIdx);
    expect(snapshots.at(-1)).toBe('peace');
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
    director.handlePlayerChanged({ civId: civId('egypt'), civType: 'egypt', atWar: false, unrestCityCount: 0, nearDefeat: false, inBeastTerritory: false });
    // Snapshot re-applied to reload the correct accent track for the new civ
    expect(mixer.setSnapshot).toHaveBeenCalledWith('peace', expect.any(Number));
  });

  // --- handleGameEnded ---

  it('transitions to silent on game end after stinger', async () => {
    director.handleEraAdvanced({ era: 1, civType: 'rome' });
    await director.handleGameEnded({ outcome: 'victory' });
    const snapshotCalls = vi.mocked(mixer.setSnapshot).mock.calls.map(c => c[0]);
    expect(snapshotCalls).toContain('silent');
    // stinger-duck must come before silent
    const duckIdx = snapshotCalls.lastIndexOf('stinger-duck');
    const silentIdx = snapshotCalls.lastIndexOf('silent');
    expect(duckIdx).toBeLessThan(silentIdx);
  });

  it('does NOT restore to peace/at-war after game-over stinger', async () => {
    director.initPeaceSnapshot();
    vi.mocked(mixer.setSnapshot).mockClear();
    await director.handleGameEnded({ outcome: 'defeat' });
    const snapshots = vi.mocked(mixer.setSnapshot).mock.calls.map(c => c[0]);
    expect(snapshots).not.toContain('peace');
    expect(snapshots).not.toContain('at-war');
    expect(snapshots).toContain('silent');
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

  it('handleCityFounded without initPeaceSnapshot restores to peace (flag-based resolver default is peace)', async () => {
    // Spec 3: resolveSnapshot() returns 'peace' when no flags are set — so stinger
    // always restores to 'peace' even before initPeaceSnapshot is explicitly called.
    director.handleCityFounded({ civType: 'rome' });
    await flushPromises();
    const lastSnapshot = vi.mocked(mixer.setSnapshot).mock.calls.at(-1)![0];
    expect(lastSnapshot).toBe('peace');
  });

  it('initPeaceSnapshot calls mixer.setSnapshot("peace", 0) immediately', () => {
    director.initPeaceSnapshot();
    expect(mixer.setSnapshot).toHaveBeenCalledWith('peace', 0);
  });

  it('exposes ducked stinger playback for natural wonder stingers', async () => {
    director.initPeaceSnapshot();

    await director.playStingerWithDuck('audio/wonders/great-volcano-stinger.ogg');

    expect(loader.get).toHaveBeenCalledWith('audio/wonders/great-volcano-stinger.ogg');
    expect(mixer.setSnapshot).toHaveBeenCalledWith('stinger-duck', expect.any(Number));
    expect(mixer.playOneShot).toHaveBeenCalledWith('stinger', fakeBuffer);
    expect(mixer.setSnapshot).toHaveBeenLastCalledWith('peace', expect.any(Number));
  });
});

// ─── Spec 3 additions ──────────────────────────────────────────────────────

import {
  type UnrestChangedPayload,
  type CivNearDefeatPayload,
} from '../../src/audio/music-director';

// civId ('civ-rome') and civType ('rome') are intentionally distinct so tests
// catch comparisons that accidentally use one where the other is required.
function makeDirectorWithPlayer(civType: string, atWar = false, unrestCityCount = 0, nearDefeat = false): MusicDirector {
  const d = new MusicDirector(makeMixer(), makeLoader());
  d.handlePlayerChanged({ civId: `civ-${civType}`, civType, atWar, unrestCityCount, nearDefeat, inBeastTerritory: false });
  return d;
}

// Helper: return the civId that makeDirectorWithPlayer registers for a given civType.
function civId(civType: string): string { return `civ-${civType}`; }

describe('resolveSnapshot — priority chain (Spec 3)', () => {
  it('nearDefeat alone → brink-of-defeat', () => {
    expect(makeDirectorWithPlayer('rome', false, 0, true).resolveSnapshot()).toBe('brink-of-defeat');
  });
  it('nearDefeat + atWar → brink-of-defeat (nearDefeat wins)', () => {
    expect(makeDirectorWithPlayer('rome', true, 0, true).resolveSnapshot()).toBe('brink-of-defeat');
  });
  it('nearDefeat + inUnrest → brink-of-defeat (nearDefeat wins)', () => {
    expect(makeDirectorWithPlayer('rome', false, 2, true).resolveSnapshot()).toBe('brink-of-defeat');
  });
  it('nearDefeat + atWar + inUnrest → brink-of-defeat', () => {
    expect(makeDirectorWithPlayer('rome', true, 2, true).resolveSnapshot()).toBe('brink-of-defeat');
  });
  it('atWar alone → at-war', () => {
    expect(makeDirectorWithPlayer('rome', true, 0, false).resolveSnapshot()).toBe('at-war');
  });
  it('atWar + inUnrest → at-war (atWar wins over unrest)', () => {
    expect(makeDirectorWithPlayer('rome', true, 2, false).resolveSnapshot()).toBe('at-war');
  });
  it('inUnrest alone → unrest', () => {
    expect(makeDirectorWithPlayer('rome', false, 1, false).resolveSnapshot()).toBe('unrest');
  });
  it('all flags false → peace', () => {
    expect(makeDirectorWithPlayer('rome').resolveSnapshot()).toBe('peace');
  });
});

describe('unrest counter (Spec 3)', () => {
  let director: MusicDirector;
  beforeEach(() => {
    director = makeDirectorWithPlayer('rome');
  });

  it('two unrest-started → inUnrest=true', () => {
    director.handleUnrestStarted({ owner: civId('rome') });
    director.handleUnrestStarted({ owner: civId('rome') });
    expect(director.resolveSnapshot()).toBe('unrest');
  });

  it('two started, one resolved → still unrest (count=1)', () => {
    director.handleUnrestStarted({ owner: civId('rome') });
    director.handleUnrestStarted({ owner: civId('rome') });
    director.handleUnrestResolved({ owner: civId('rome') });
    expect(director.resolveSnapshot()).toBe('unrest');
  });

  it('two started, two resolved → peace (count=0)', () => {
    director.handleUnrestStarted({ owner: civId('rome') });
    director.handleUnrestStarted({ owner: civId('rome') });
    director.handleUnrestResolved({ owner: civId('rome') });
    director.handleUnrestResolved({ owner: civId('rome') });
    expect(director.resolveSnapshot()).toBe('peace');
  });

  it('revolt-started increments the same counter', () => {
    director.handleRevoltStarted({ owner: civId('rome') });
    expect(director.resolveSnapshot()).toBe('unrest');
  });

  it('unrest events from a different civ are ignored', () => {
    director.handleUnrestStarted({ owner: civId('egypt') }); // not currentCivId
    expect(director.resolveSnapshot()).toBe('peace');
  });

  it('counter never goes below 0 (extra resolves are idempotent)', () => {
    director.handleUnrestResolved({ owner: civId('rome') }); // no prior started
    director.handleUnrestResolved({ owner: civId('rome') });
    expect(director.resolveSnapshot()).toBe('peace');
  });
});

describe('handlePlayerChanged — hot-seat drift reset (Spec 3)', () => {
  let director: MusicDirector;
  beforeEach(() => {
    director = makeDirectorWithPlayer('rome');
  });

  it('handoff with atWar:true resets to at-war', () => {
    director.handlePlayerChanged({ civId: civId('egypt'), civType: 'egypt', atWar: true, unrestCityCount: 0, nearDefeat: false, inBeastTerritory: false });
    expect(director.resolveSnapshot()).toBe('at-war');
  });

  it('handoff with nearDefeat:true resets to brink-of-defeat', () => {
    director.handlePlayerChanged({ civId: civId('viking'), civType: 'viking', atWar: false, unrestCityCount: 0, nearDefeat: true, inBeastTerritory: false });
    expect(director.resolveSnapshot()).toBe('brink-of-defeat');
  });

  it('handoff clears prior unrest for incoming player at peace', () => {
    director.handleUnrestStarted({ owner: civId('rome') });
    director.handleUnrestStarted({ owner: civId('rome') });
    director.handlePlayerChanged({ civId: civId('egypt'), civType: 'egypt', atWar: false, unrestCityCount: 0, nearDefeat: false, inBeastTerritory: false });
    expect(director.resolveSnapshot()).toBe('peace');
  });

  it('handoff with unrestCityCount:2 resolves to unrest', () => {
    director.handlePlayerChanged({ civId: civId('aztec'), civType: 'aztec', atWar: false, unrestCityCount: 2, nearDefeat: false, inBeastTerritory: false });
    expect(director.resolveSnapshot()).toBe('unrest');
  });
});

describe('near-defeat handlers (Spec 3)', () => {
  it('handleNearDefeat for current civ sets brink-of-defeat', () => {
    const d = makeDirectorWithPlayer('rome');
    d.handleNearDefeat({ civId: civId('rome') });
    expect(d.resolveSnapshot()).toBe('brink-of-defeat');
  });

  it('handleNearDefeat for different civ is ignored', () => {
    const d = makeDirectorWithPlayer('rome');
    d.handleNearDefeat({ civId: civId('egypt') });
    expect(d.resolveSnapshot()).toBe('peace');
  });

  it('handleRecoveredFromNearDefeat clears near-defeat', () => {
    const d = makeDirectorWithPlayer('rome', false, 0, true);
    d.handleRecoveredFromNearDefeat({ civId: civId('rome') });
    expect(d.resolveSnapshot()).toBe('peace');
  });
});

describe('currentStingerPromise — sequencing contract (Spec 3)', () => {
  it('resolves immediately when no stinger is active', async () => {
    const d = new MusicDirector(makeMixer(), makeLoader());
    let resolved = false;
    void d.currentStingerPromise.then(() => { resolved = true; });
    await flushPromises();
    expect(resolved).toBe(true);
  });

  it('resolves after playStingerWithDuck completes', async () => {
    const mixer = makeMixer();
    let resolveOneShot!: () => void;
    vi.mocked(mixer.playOneShot).mockReturnValue(
      new Promise<void>(r => { resolveOneShot = r; }),
    );
    const d = new MusicDirector(mixer, makeLoader());
    d.initPeaceSnapshot();
    d.handleCityFounded({ civType: 'rome' });

    let stingerDone = false;
    void d.currentStingerPromise.then(() => { stingerDone = true; });

    await flushPromises();
    expect(stingerDone).toBe(false); // stinger still in flight

    resolveOneShot();
    await flushPromises();
    expect(stingerDone).toBe(true);  // stinger completed
  });
});
