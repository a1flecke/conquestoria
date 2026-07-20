import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NetworkAudioDirector } from '@/audio/network-audio-director';
import { NETWORK_STRATEGIC_SFX } from '@/audio/sfx-catalog';
import { NETWORK_AUDIO_FILES, NETWORK_AUDIO_SOURCES } from '@/audio/network-audio-sources';
import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';

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

describe('NetworkAudioDirector', () => {
  let state: GameState;
  let bus: ReturnType<typeof makeBus>;
  let playStinger: ReturnType<typeof vi.fn<(path: string) => Promise<void>>>;

  beforeEach(() => {
    state = { currentPlayer: 'player', turn: 40 } as GameState;
    bus = makeBus();
    playStinger = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined);
  });

  it('plays only current-viewer cues and throttles repeated resolution feedback', async () => {
    const director = new NetworkAudioDirector(playStinger, () => state);
    director.start(bus.bus);

    bus.emit('network:audio-cue', { cue: 'constructive-resolution', viewerIds: ['ai-1'] });
    bus.emit('network:audio-cue', { cue: 'constructive-resolution', viewerIds: ['player'] });
    bus.emit('network:audio-cue', { cue: 'constructive-resolution', viewerIds: ['player'] });
    await Promise.resolve();

    expect(playStinger).toHaveBeenCalledTimes(1);
    expect(playStinger).toHaveBeenCalledWith(NETWORK_STRATEGIC_SFX['constructive-resolution'].file);
    state.turn += 3;
    bus.emit('network:audio-cue', { cue: 'constructive-resolution', viewerIds: ['player'] });
    await Promise.resolve();
    expect(playStinger).toHaveBeenCalledTimes(2);
  });

  it('honors presentation suppression and disposal', () => {
    const director = new NetworkAudioDirector(playStinger, () => state, () => true);
    director.start(bus.bus);
    bus.emit('network:audio-cue', { cue: 'surge', viewerIds: ['player'] });
    director.dispose();
    bus.emit('network:audio-cue', { cue: 'hostile-warning', viewerIds: ['player'] });

    expect(playStinger).not.toHaveBeenCalled();
  });

  it('does not let one hot-seat player consume another player\'s cue cooldown', async () => {
    const director = new NetworkAudioDirector(playStinger, () => state);
    director.start(bus.bus);

    bus.emit('network:audio-cue', { cue: 'surge', viewerIds: ['player'] });
    state.currentPlayer = 'player-2';
    bus.emit('network:audio-cue', { cue: 'surge', viewerIds: ['player-2'] });
    await Promise.resolve();

    expect(playStinger).toHaveBeenCalledTimes(2);
  });
});

describe('network audio provenance', () => {
  it('covers each local cue exactly once with documented open-license provenance', () => {
    const files = NETWORK_AUDIO_SOURCES.flatMap(source => {
      expect(source.license).toBe('CC0');
      expect(source.creditText).not.toBe('');
      expect(source.derivativeNotes).not.toBe('');
      return source.localFiles;
    });
    expect(files.sort()).toEqual([...NETWORK_AUDIO_FILES].sort());
    for (const file of files) {
      expect(readFileSync(join(resolve(__dirname, '../..'), 'public', file)).subarray(0, 4).toString('ascii')).toBe('OggS');
    }
  });
});
