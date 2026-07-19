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

  it('plays the famine-onset stinger only when the crisis archetype is famine', () => {
    const played: string[] = [];
    const bus = makeBus();
    const state = makeState({ currentPlayer: 'player' });
    const director = new ReligionAudioDirector(async path => { played.push(path); }, () => state);
    director.start(bus.bus);
    // 'corsair-armada' is a 'hunt' archetype flavor (not famine) -- see crisis-flavor-definitions.ts
    bus.emit('crisis:started', { crisisId: 'x', flavorId: 'corsair-armada', civId: 'player', cityIds: ['c1'] });
    expect(played).toEqual([]);
    bus.emit('crisis:started', { crisisId: 'y', flavorId: 'crop-blight', civId: 'player', cityIds: ['c1'] });
    expect(played).toEqual(['audio/stinger/famine/onset.ogg']);
  });

  it('does not play the famine-onset stinger for a different civ', () => {
    const played: string[] = [];
    const bus = makeBus();
    const state = makeState({ currentPlayer: 'player' });
    const director = new ReligionAudioDirector(async path => { played.push(path); }, () => state);
    director.start(bus.bus);
    bus.emit('crisis:started', { crisisId: 'x', flavorId: 'crop-blight', civId: 'ai-1', cityIds: ['c1'] });
    expect(played).toEqual([]);
  });

  it('plays the famine-resolved stinger only for positive outcomes', () => {
    const played: string[] = [];
    const bus = makeBus();
    const state = makeState({ currentPlayer: 'player' });
    const director = new ReligionAudioDirector(async path => { played.push(path); }, () => state);
    director.start(bus.bus);
    bus.emit('crisis:resolved', { crisisId: 'x', flavorId: 'crop-blight', civId: 'player', outcome: 'expired' });
    expect(played).toEqual([]);
    bus.emit('crisis:resolved', { crisisId: 'y', flavorId: 'crop-blight', civId: 'player', outcome: 'contained' });
    expect(played).toEqual(['audio/stinger/famine/resolved.ogg']);
  });

  it('does not play the famine-resolved stinger for a non-famine archetype even on a positive outcome', () => {
    const played: string[] = [];
    const bus = makeBus();
    const state = makeState({ currentPlayer: 'player' });
    const director = new ReligionAudioDirector(async path => { played.push(path); }, () => state);
    director.start(bus.bus);
    bus.emit('crisis:resolved', { crisisId: 'x', flavorId: 'corsair-armada', civId: 'player', outcome: 'hunted' });
    expect(played).toEqual([]);
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
