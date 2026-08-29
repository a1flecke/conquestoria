import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerDiplomacyPresentation } from '@/presentation/register-diplomacy-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

// Minimal civ shape matching the pattern already used in
// tests/ui/notification-routing.test.ts for opportunistic-war's witness gate.
function civ(overrides: { knownCivilizations?: string[] } = {}) {
  return {
    id: 'x',
    name: 'Civ',
    cities: [],
    units: [],
    diplomacy: { relationships: {} },
    visibility: { tiles: {} },
    knownCivilizations: [],
    ...overrides,
  };
}

describe('diplomacy presentation', () => {
  it('announces a war declaration to the log', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerDiplomacyPresentation(bus, ctx);
    bus.emit('diplomacy:war-declared', { attackerId: 'ai-1', defenderId: 'player', opponentKind: 'major' });

    expect(ctx.deliver).toHaveBeenCalled();
  });

  it('announces a treaty proposal', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerDiplomacyPresentation(bus, ctx);
    bus.emit('diplomacy:treaty-proposed', { fromCiv: 'ai-1', toCiv: 'player', treaty: 'trade_agreement' });

    expect(ctx.deliver).toHaveBeenCalled();
  });

  it('announces an accepted treaty to both signatories', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerDiplomacyPresentation(bus, ctx);
    bus.emit('diplomacy:treaty-accepted', { civA: 'ai-1', civB: 'player', treaty: 'trade_agreement' });

    expect(ctx.deliver).toHaveBeenCalledTimes(2);
  });

  it('announces first contact between two civs', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerDiplomacyPresentation(bus, ctx);
    bus.emit('civilization:first-contact', { civA: 'player', civB: 'ai-1' });

    expect(ctx.deliver).toHaveBeenCalled();
  });

  it('announces a peace request', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerDiplomacyPresentation(bus, ctx);
    bus.emit('diplomacy:peace-requested', { fromCivId: 'ai-1', toCivId: 'player' });

    expect(ctx.deliver).toHaveBeenCalled();
  });

  it('announces peace being made', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerDiplomacyPresentation(bus, ctx);
    bus.emit('diplomacy:peace-made', { civA: 'player', civB: 'ai-1' });

    expect(ctx.deliver).toHaveBeenCalled();
  });

  it('announces an opportunistic war declaration to witnesses who have met both civs', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        civilizations: {
          rome: civ({ knownCivilizations: ['carthage', 'egypt'] }),
          carthage: civ({ knownCivilizations: ['rome', 'egypt'] }),
          egypt: civ({ knownCivilizations: ['rome', 'carthage'] }),
        } as never,
      },
    });

    registerDiplomacyPresentation(bus, ctx);
    bus.emit('diplomacy:opportunistic-war', { actorId: 'rome', targetCivId: 'carthage', crisisId: 'crisis-1' });

    expect(ctx.deliver).toHaveBeenCalledWith('egypt', expect.any(String), expect.any(String));
  });

  it('disposing removes every subscription this registrar added', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        civilizations: {
          rome: civ({ knownCivilizations: ['carthage', 'egypt'] }),
          carthage: civ({ knownCivilizations: ['rome', 'egypt'] }),
          egypt: civ({ knownCivilizations: ['rome', 'carthage'] }),
        } as never,
      },
    });
    const dispose = registerDiplomacyPresentation(bus, ctx);

    dispose();
    bus.emit('diplomacy:war-declared', { attackerId: 'ai-1', defenderId: 'player', opponentKind: 'major' });
    bus.emit('diplomacy:treaty-proposed', { fromCiv: 'ai-1', toCiv: 'player', treaty: 'trade_agreement' });
    bus.emit('diplomacy:treaty-accepted', { civA: 'ai-1', civB: 'player', treaty: 'trade_agreement' });
    bus.emit('civilization:first-contact', { civA: 'player', civB: 'ai-1' });
    bus.emit('diplomacy:peace-requested', { fromCivId: 'ai-1', toCivId: 'player' });
    bus.emit('diplomacy:peace-made', { civA: 'player', civB: 'ai-1' });
    bus.emit('diplomacy:opportunistic-war', { actorId: 'rome', targetCivId: 'carthage', crisisId: 'crisis-1' });

    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
