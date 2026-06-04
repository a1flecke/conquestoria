import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceDirector } from '../../src/audio/voice-director';
import { VOICE_CATALOG, ALL_VOICE_EVENT_IDS, ALL_VOICE_PACK_IDS } from '../../src/audio/voice-catalog';
import type { AudioMixer } from '../../src/audio/audio-mixer';
import type { AudioLoader } from '../../src/audio/audio-loader';

const fakeBuffer = {} as AudioBuffer;

function makeMixer(): AudioMixer {
  return {
    setSnapshot: vi.fn(),
    playOneShot: vi.fn().mockResolvedValue(undefined),
    setBusSource: vi.fn(),
    setMasterVolume: vi.fn(),
    setMasterMusicVolume: vi.fn(),
    setMusicVolume: vi.fn(),
    setMusicEnabled: vi.fn(),
    setSfxVolume: vi.fn(),
    setSfxEnabled: vi.fn(),
    setVoiceVolume: vi.fn(),
    setVoiceEnabled: vi.fn(),
    setStingerVolume: vi.fn(),
    setStingerEnabled: vi.fn(),
    getSfxRoutingNode: vi.fn(),
    dispose: vi.fn(),
  } as unknown as AudioMixer;
}

function makeLoader(returnBuffer: AudioBuffer = fakeBuffer): AudioLoader {
  return {
    get: vi.fn().mockResolvedValue(returnBuffer),
    preload: vi.fn().mockResolvedValue(undefined),
    isCached: vi.fn().mockReturnValue(false),
  } as unknown as AudioLoader;
}

describe('VoiceDirector — pack selection', () => {
  it('starred civ uses its own pack', async () => {
    const loader = makeLoader();
    const director = new VoiceDirector(makeMixer(), loader, () => 'peace');
    director.setVoicePack('china');
    await director.playLine('era-advance');
    expect(loader.get).toHaveBeenCalledWith('audio/voice/china/era-advance.ogg');
  });

  it('unknown civ falls back to generic pack', async () => {
    const loader = makeLoader();
    const director = new VoiceDirector(makeMixer(), loader, () => 'peace');
    director.setVoicePack('atlantis'); // not in CIV_TO_VOICE_PACK
    await director.playLine('city-founded');
    expect(loader.get).toHaveBeenCalledWith('audio/voice/generic/city-founded.ogg');
  });

  it('japan falls back to generic (not starred)', async () => {
    const loader = makeLoader();
    const director = new VoiceDirector(makeMixer(), loader, () => 'peace');
    director.setVoicePack('japan');
    await director.playLine('war-declared');
    expect(loader.get).toHaveBeenCalledWith('audio/voice/generic/war-declared.ogg');
  });
});

describe('VoiceDirector — playLine contract', () => {
  let mixer: AudioMixer;
  let loader: AudioLoader;
  let director: VoiceDirector;

  beforeEach(() => {
    mixer = makeMixer();
    loader = makeLoader();
    director = new VoiceDirector(mixer, loader, () => 'peace');
  });

  it('sets voice-duck snapshot before playing', async () => {
    await director.playLine('era-advance');
    const snapshotCalls = vi.mocked(mixer.setSnapshot).mock.calls.map(c => c[0]);
    expect(snapshotCalls[0]).toBe('voice-duck');
  });

  it('restores current snapshot after playing', async () => {
    await director.playLine('era-advance');
    const snapshotCalls = vi.mocked(mixer.setSnapshot).mock.calls.map(c => c[0]);
    expect(snapshotCalls.at(-1)).toBe('peace');
  });

  it('restores to at-war when getSnapshot returns at-war', async () => {
    const d = new VoiceDirector(mixer, loader, () => 'at-war');
    await d.playLine('city-founded');
    expect(vi.mocked(mixer.setSnapshot).mock.calls.at(-1)![0]).toBe('at-war');
  });

  it('restores to brink-of-defeat when getSnapshot returns brink-of-defeat', async () => {
    const d = new VoiceDirector(mixer, loader, () => 'brink-of-defeat');
    await d.playLine('near-defeat');
    expect(vi.mocked(mixer.setSnapshot).mock.calls.at(-1)![0]).toBe('brink-of-defeat');
  });

  it('calls playOneShot on voice bus', async () => {
    await director.playLine('tech-completed');
    expect(mixer.playOneShot).toHaveBeenCalledWith('voice', fakeBuffer);
  });
});

describe('VoiceDirector — graceful no-op for missing entry', () => {
  it('does not throw and does not call mixer when entry is absent', async () => {
    // Temporarily remove an entry from the generic pack to simulate missing
    const original = VOICE_CATALOG['generic']['era-advance'];
    delete VOICE_CATALOG['generic']['era-advance'];

    const mixer = makeMixer();
    const loader = makeLoader();
    const director = new VoiceDirector(mixer, loader, () => 'peace');

    await expect(director.playLine('era-advance')).resolves.toBeUndefined();
    expect(mixer.setSnapshot).not.toHaveBeenCalled();
    expect(loader.get).not.toHaveBeenCalled();

    // Restore
    VOICE_CATALOG['generic']['era-advance'] = original!;
  });
});

describe('VoiceDirector — stop()', () => {
  it('restores current snapshot immediately', () => {
    const mixer = makeMixer();
    const director = new VoiceDirector(mixer, makeLoader(), () => 'at-war');
    director.stop();
    expect(mixer.setSnapshot).toHaveBeenCalledWith('at-war', expect.any(Number));
  });

  it('does not throw when called with no active line', () => {
    const mixer = makeMixer();
    const director = new VoiceDirector(mixer, makeLoader(), () => 'peace');
    expect(() => director.stop()).not.toThrow();
  });
});
