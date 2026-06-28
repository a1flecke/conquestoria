import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PirateAudioDirector } from '@/audio/pirate-audio-director';
import { PIRATE_HEADQUARTERS_SFX, PIRATE_STRATEGIC_SFX } from '@/audio/sfx-catalog';
import type { AudioLoader } from '@/audio/audio-loader';
import type { AudioMixer } from '@/audio/audio-mixer';
import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { PIRATE_AUDIO_FILES, PIRATE_AUDIO_SOURCES } from '@/audio/pirate-audio-sources';

const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

function makeBus() {
  const listeners: Record<string, Array<(payload: any) => void>> = {};
  return {
    bus: { on: (event: string, fn: (payload: any) => void) => {
      (listeners[event] ??= []).push(fn);
      return () => { listeners[event] = listeners[event].filter(listener => listener !== fn); };
    } } as unknown as EventBus,
    emit: (event: string, payload: any) => listeners[event]?.forEach(listener => listener(payload)),
  };
}

function makeState(): GameState {
  return {
    currentPlayer: 'player',
    civilizations: { player: { visibility: { tiles: { '2,2': 'visible' }, lastSeen: {} } } },
    units: {},
    pirates: {
      factions: {
        'pirate-1': {
          id: 'pirate-1', name: 'Red Wake', behavior: 'raiding', maritimeStage: 3,
          headquarters: { kind: 'coastal-enclave', position: { q: 2, r: 2 }, integrity: 100, maxIntegrity: 100 },
        },
      },
      intelByCiv: { player: { 'pirate-1': { factionId: 'pirate-1', level: 'sighted' } } },
    },
  } as unknown as GameState;
}

describe('PirateAudioDirector', () => {
  let mixer: Pick<AudioMixer, 'setAmbienceLoop' | 'stopAmbience'>;
  let loader: Pick<AudioLoader, 'get'>;
  let playStinger: ReturnType<typeof vi.fn<(path: string) => Promise<void>>>;
  let state: GameState;
  let bus: ReturnType<typeof makeBus>;

  beforeEach(() => {
    mixer = { setAmbienceLoop: vi.fn(), stopAmbience: vi.fn() };
    loader = { get: vi.fn().mockResolvedValue({} as AudioBuffer) };
    playStinger = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined);
    state = makeState();
    bus = makeBus();
  });

  it('routes strategic cues only to the current intended viewer', async () => {
    const director = new PirateAudioDirector(mixer, loader, playStinger, () => state);
    director.start(bus.bus);

    bus.emit('pirate:audio-cue', { cue: 'raid', factionId: 'pirate-1', viewerIds: ['ai-1'] });
    bus.emit('pirate:audio-cue', { cue: 'blockade', factionId: 'pirate-1', viewerIds: ['player'] });
    await tick();

    expect(playStinger).toHaveBeenCalledTimes(1);
    expect(playStinger).toHaveBeenCalledWith(PIRATE_STRATEGIC_SFX.blockade.file);
  });

  it('suppresses strategic cues and async ambience completion during handoff', async () => {
    let suppressed = true;
    let resolveBuffer!: (buffer: AudioBuffer) => void;
    loader.get = vi.fn(() => new Promise<AudioBuffer>(resolve => {
      resolveBuffer = resolve;
    }));
    const director = new PirateAudioDirector(
      mixer,
      loader,
      playStinger,
      () => state,
      () => suppressed,
    );
    director.start(bus.bus);

    bus.emit('pirate:audio-cue', {
      cue: 'raid',
      factionId: 'pirate-1',
      viewerIds: ['player'],
    });
    expect(playStinger).not.toHaveBeenCalled();
    expect(await director.startHeadquartersAmbience('pirate-1')).toBe(false);

    suppressed = false;
    const pending = director.startHeadquartersAmbience('pirate-1');
    suppressed = true;
    resolveBuffer({} as AudioBuffer);
    await expect(pending).resolves.toBe(false);
    expect(mixer.setAmbienceLoop).not.toHaveBeenCalled();
  });

  it('starts enclave ambience only for a currently visible focused headquarters', async () => {
    const director = new PirateAudioDirector(mixer, loader, playStinger, () => state);

    expect(await director.startHeadquartersAmbience('pirate-1')).toBe(true);
    expect(loader.get).toHaveBeenCalledWith(PIRATE_HEADQUARTERS_SFX.ambience.file);
    expect(mixer.setAmbienceLoop).toHaveBeenCalledOnce();

    state.civilizations.player.visibility.tiles['2,2'] = 'fog';
    expect(await director.startHeadquartersAmbience('pirate-1')).toBe(false);
    expect(mixer.stopAmbience).toHaveBeenCalledOnce();
  });

  it('stops ambience on panel close, handoff, game end, mute, and disposal', async () => {
    const director = new PirateAudioDirector(mixer, loader, playStinger, () => state);
    director.start(bus.bus);
    await director.startHeadquartersAmbience('pirate-1');

    director.stopAmbience('panel-closed');
    bus.emit('currentPlayer:changed-after-handoff', { civId: 'ai-1' });
    bus.emit('game:over', { winnerId: 'player' });
    director.setEnabled(false);
    director.dispose();

    expect(mixer.stopAmbience).toHaveBeenCalledTimes(5);
  });
});

describe('pirate audio source manifest', () => {
  it('covers every output exactly once with an approved license', () => {
    const files = PIRATE_AUDIO_SOURCES.flatMap(source => {
      expect(['CC0', 'CC-BY', 'in-project']).toContain(source.license);
      expect(source.creditText).not.toBe('');
      expect(source.derivativeNotes).not.toBe('');
      return source.localFiles;
    });
    expect(files.sort()).toEqual([...PIRATE_AUDIO_FILES].sort());
    expect(new Set(files).size).toBe(files.length);
  });
});
