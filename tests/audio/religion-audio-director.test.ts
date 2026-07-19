import { describe, expect, it, vi } from 'vitest';
import { ReligionAudioDirector } from '@/audio/religion-audio-director';
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

function makeState(overrides: Partial<GameState> = {}): GameState {
  return { currentPlayer: 'player', ...overrides } as unknown as GameState;
}

describe('ReligionAudioDirector', () => {
  it('plays the preach stinger only for the current player', () => {
    const played: string[] = [];
    const bus = makeBus();
    const state = makeState({ currentPlayer: 'player' });
    const director = new ReligionAudioDirector(
      async path => { played.push(path); },
      () => state,
    );
    director.start(bus.bus);
    bus.emit('religion:preached', { cityId: 'c1', unitId: 'u1', civId: 'ai-1', points: 10, unitConsumed: true });
    expect(played).toEqual([]);
    bus.emit('religion:preached', { cityId: 'c1', unitId: 'u1', civId: 'player', points: 10, unitConsumed: true });
    expect(played).toEqual(['audio/stinger/religion/preach.ogg']);
  });

  // #594 MR7 inline review fix: famine onset/resolved are NOT bus-driven (they were in
  // an earlier draft, but famine already has an existing toast notification via
  // routeCrisisStarted/routeCrisisResolved -- a direct bus subscription here would have
  // played this stinger ALONGSIDE that toast's generic chime, a doubled-sound bug).
  // Famine now goes through playCue() exactly like the other four toast-replacement
  // cues; see the notification-routing.test.ts assertions for the sfxCue tagging.
  it('does not subscribe to crisis:started/crisis:resolved at all (famine goes through playCue instead)', () => {
    const played: string[] = [];
    const bus = makeBus();
    const state = makeState({ currentPlayer: 'player' });
    const director = new ReligionAudioDirector(async path => { played.push(path); }, () => state);
    director.start(bus.bus);
    bus.emit('crisis:started', { crisisId: 'x', flavorId: 'crop-blight', civId: 'player', cityIds: ['c1'] });
    bus.emit('crisis:resolved', { crisisId: 'y', flavorId: 'crop-blight', civId: 'player', outcome: 'contained' });
    expect(played).toEqual([]);
  });

  it('playCue maps famine-onset and famine-resolved to their stinger files', async () => {
    const played: string[] = [];
    const director = new ReligionAudioDirector(async path => { played.push(path); }, () => makeState());
    await director.playCue('famine-onset');
    await director.playCue('famine-resolved');
    expect(played).toEqual(['audio/stinger/famine/onset.ogg', 'audio/stinger/famine/resolved.ogg']);
  });

  it('playCue maps religion-founded to the founded stinger file and passes other cues through', async () => {
    const played: string[] = [];
    const director = new ReligionAudioDirector(async path => { played.push(path); }, () => makeState());
    await director.playCue('religion-founded');
    await director.playCue('city-defected');
    await director.playCue('loyalty-warning');
    await director.playCue('city-converted');
    expect(played).toEqual([
      'audio/stinger/religion/founded.ogg',
      'audio/stinger/religion/city-defected.ogg',
      'audio/stinger/religion/loyalty-warning.ogg',
      'audio/stinger/religion/city-converted.ogg',
    ]);
  });

  it('playCue is a no-op for an unknown cue id', async () => {
    const played: string[] = [];
    const director = new ReligionAudioDirector(async path => { played.push(path); }, () => makeState());
    await director.playCue('not-a-real-cue');
    expect(played).toEqual([]);
  });

  it('dispose unsubscribes all listeners', () => {
    const played: string[] = [];
    const bus = makeBus();
    const state = makeState({ currentPlayer: 'player' });
    const director = new ReligionAudioDirector(async path => { played.push(path); }, () => state);
    director.start(bus.bus);
    director.dispose();
    bus.emit('religion:preached', { cityId: 'c1', unitId: 'u1', civId: 'player', points: 10, unitConsumed: true });
    expect(played).toEqual([]);
  });
});
