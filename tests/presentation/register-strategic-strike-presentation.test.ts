import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { Civilization } from '@/core/types';
import { SFX } from '@/audio/sfx';
import { registerStrategicStrikePresentation } from '@/presentation/register-strategic-strike-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

// Crash-safe against hasMetCivilizationByCurrentEvidence's fallback (reached
// whenever knownCivilizations doesn't already prove contact) -- that
// fallback unconditionally reads viewer.diplomacy.atWarWith/treaties,
// target.cities/units, and state.map.tiles. diplomacy/cities/units are
// always present here, even when a given test only ever exercises the
// knownCivilizations fast path.
function makeCiv(id: string, overrides: Partial<Civilization> = {}): Civilization {
  return {
    id, name: id, color: '#fff', isHuman: false, civType: 'generic',
    cities: [], units: [], gold: 0, visibility: { tiles: {}, lastSeen: {} }, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
    knownCivilizations: [],
    ...overrides,
  } as Civilization;
}

describe('strategic strike presentation (#545 MR4/MR5)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('notifies the defending civ that its city was struck, including the gold lost', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'p2' } } as never,
        civilizations: { p1: makeCiv('p1', { isHuman: true }), p2: makeCiv('p2') },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'p2', actorCivId: 'p1', goldLost: 150 });

    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.stringContaining('Rome'), 'warning');
    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.stringContaining('150'), 'warning');
  });

  it('omits the gold-loss clause when nothing was lost (garrisoned target)', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'p2' } } as never,
        civilizations: { p1: makeCiv('p1', { isHuman: true }), p2: makeCiv('p2') },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'p2', actorCivId: 'p1', goldLost: 0 });

    const [, message] = (ctx.deliver as any).mock.calls[0];
    expect(message).not.toContain('gold');
  });

  it('handles an unknown city name gracefully', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: {} as never,
        civilizations: { p1: makeCiv('p1', { isHuman: true }), p2: makeCiv('p2') },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'nope', recipientCivId: 'p2', actorCivId: 'p1', goldLost: 0 });

    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.any(String), 'warning');
  });

  it("the human's own launch plays SFX exactly once (regression: no double-fire between the controller and the registrar)", () => {
    const spy = vi.spyOn(SFX, 'strategicStrike').mockImplementation(() => {});
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'p2' } } as never,
        civilizations: { p1: makeCiv('p1', { isHuman: true }), p2: makeCiv('p2') },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'p2', actorCivId: 'p1', goldLost: 0 });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('an AI striking the human plays SFX (new coverage — this case was silent before MR5)', () => {
    const spy = vi.spyOn(SFX, 'strategicStrike').mockImplementation(() => {});
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'p1' } } as never,
        civilizations: { p1: makeCiv('p1', { isHuman: true }), 'ai-1': makeCiv('ai-1') },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'p1', actorCivId: 'ai-1', goldLost: 50 });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.any(String), 'warning');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('an AI-vs-AI strike the human has met both civs in plays SFX and delivers a witness notification', () => {
    const spy = vi.spyOn(SFX, 'strategicStrike').mockImplementation(() => {});
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'ai-2' } } as never,
        civilizations: {
          p1: makeCiv('p1', { isHuman: true, knownCivilizations: ['ai-1', 'ai-2'] }),
          'ai-1': makeCiv('ai-1', { name: 'Attacker' }),
          'ai-2': makeCiv('ai-2'),
        },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'ai-2', actorCivId: 'ai-1', goldLost: 20 });

    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Rome'), 'warning');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("an AI-vs-AI strike the human hasn't met both civs in produces no witness notification and no SFX", () => {
    const spy = vi.spyOn(SFX, 'strategicStrike').mockImplementation(() => {});
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1',
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'ai-2' } } as never,
        civilizations: {
          p1: makeCiv('p1', { isHuman: true }),
          'ai-1': makeCiv('ai-1'),
          'ai-2': makeCiv('ai-2'),
        },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'ai-2', actorCivId: 'ai-1', goldLost: 20 });

    // p1 still gets nothing beyond what recipientCivId ('ai-2', not human) already got.
    expect(ctx.deliver).not.toHaveBeenCalledWith('p1', expect.anything(), expect.anything());
    expect(spy).not.toHaveBeenCalled();
  });

  it('a second hot-seat human who met both civs is notified even when not the current viewer, but SFX does not fire an extra time', () => {
    const spy = vi.spyOn(SFX, 'strategicStrike').mockImplementation(() => {});
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        currentPlayer: 'p1', // p1 is active; p2 is the OTHER human, not currently viewing
        map: { tiles: {} } as never,
        cities: { target: { name: 'Rome', owner: 'ai-2' } } as never,
        civilizations: {
          p1: makeCiv('p1', { isHuman: true }),
          p2: makeCiv('p2', { isHuman: true, knownCivilizations: ['ai-1', 'ai-2'] }),
          'ai-1': makeCiv('ai-1', { name: 'Attacker' }),
          'ai-2': makeCiv('ai-2'),
        },
      },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'ai-2', actorCivId: 'ai-1', goldLost: 20 });

    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.stringContaining('Rome'), 'warning');
    expect(spy).not.toHaveBeenCalled(); // p1 (the active viewer) hasn't met either civ
  });
});
