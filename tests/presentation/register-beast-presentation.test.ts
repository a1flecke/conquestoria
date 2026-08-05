// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerBeastPresentation } from '@/presentation/register-beast-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

function civ(overrides: { visibility?: { tiles: Record<string, string> } } = {}) {
  return { visibility: { tiles: {} }, ...overrides };
}

describe('beast presentation', () => {
  it('notifies only civs whose visibility covers the awakening tile', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: {
        civilizations: {
          rome: civ({ visibility: { tiles: { '0,0': 'visible' } } }),
          carthage: civ({ visibility: { tiles: {} } }),
        } as never,
      },
    });

    registerBeastPresentation(bus, ctx);
    bus.emit('beast:awakened', { lairId: 'lair-1', beastId: 'giant_boar', position: { q: 0, r: 0 } });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.any(String), 'warning', expect.anything());
    expect(ctx.deliver).not.toHaveBeenCalledWith('carthage', expect.anything(), expect.anything(), expect.anything());
  });

  it('announces a low-tier slaying without showing the ceremony', () => {
    const bus = new EventBus();
    const uiLayer = document.createElement('div');
    const ctx = makePresentationContext({
      uiLayer,
      state: {
        currentPlayer: 'rome',
        civilizations: { rome: civ(), carthage: civ() } as never,
      },
    });

    registerBeastPresentation(bus, ctx);
    bus.emit('beast:slain', { beastId: 'giant_boar', lairId: 'lair-1', slayerCivId: 'rome', slayerUnitId: 'unit-1', goldAwarded: 10 });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.stringContaining('Hoard claimed'), 'success');
    expect(ctx.deliver).toHaveBeenCalledWith('carthage', expect.stringContaining('slain'), 'info');
    expect(uiLayer.querySelector('#beast-slay-ceremony')).toBeNull();
  });

  it('shows the slay ceremony and a reward-choice preview for a tier-3 beast', () => {
    // tier >= 3 is the ceremony gate; tier 2 ("choice tier") only changes the
    // log message text ("Choose your reward") and does not show the overlay --
    // an asymmetry in the original code, preserved verbatim here.
    const bus = new EventBus();
    const uiLayer = document.createElement('div');
    const ctx = makePresentationContext({
      uiLayer,
      state: {
        currentPlayer: 'rome',
        civilizations: { rome: { techState: { completed: [] } } } as never,
        beasts: { lairs: { 'lair-1': { beastId: 'sea_serpent', position: { q: 0, r: 0 } } } } as never,
      },
    });

    registerBeastPresentation(bus, ctx);
    bus.emit('beast:slain', { beastId: 'sea_serpent', lairId: 'lair-1', slayerCivId: 'rome', slayerUnitId: 'unit-1', goldAwarded: 20 });

    expect(uiLayer.querySelector('#beast-slay-ceremony')).not.toBeNull();
  });

  it('does not show the ceremony to a non-slayer civ even for a high-tier beast', () => {
    const bus = new EventBus();
    const uiLayer = document.createElement('div');
    const ctx = makePresentationContext({
      uiLayer,
      state: {
        currentPlayer: 'carthage',
        civilizations: { rome: civ(), carthage: civ() } as never,
        beasts: { lairs: { 'lair-1': { beastId: 'ancient_dragon', position: { q: 0, r: 0 } } } } as never,
      },
    });

    registerBeastPresentation(bus, ctx);
    bus.emit('beast:slain', { beastId: 'ancient_dragon', lairId: 'lair-1', slayerCivId: 'rome', slayerUnitId: 'unit-1', goldAwarded: 50 });

    expect(uiLayer.querySelector('#beast-slay-ceremony')).toBeNull();
  });

  it('announces a hoard-choice claim', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerBeastPresentation(bus, ctx);
    bus.emit('beast:hoard-claimed', { lairId: 'lair-1', beastId: 'giant_boar', civId: 'rome', choice: 'lore' });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.stringContaining('Ancient Lore'), 'success');
  });

  it('notifies a sighting and shows the banner only to the active viewer', () => {
    const bus = new EventBus();
    const uiLayer = document.createElement('div');
    const ctx = makePresentationContext({
      uiLayer,
      state: { currentPlayer: 'rome' },
    });

    registerBeastPresentation(bus, ctx);
    bus.emit('beast:sighted', { beastId: 'giant_boar', civId: 'rome' });

    expect(ctx.deliver).toHaveBeenCalledWith('rome', expect.any(String), 'info', undefined);
    expect(uiLayer.querySelector('#beast-sighting-banner')).not.toBeNull();
  });

  it('does not show the sighting banner for a non-active civ', () => {
    const bus = new EventBus();
    const uiLayer = document.createElement('div');
    const ctx = makePresentationContext({
      uiLayer,
      state: { currentPlayer: 'egypt' },
    });

    registerBeastPresentation(bus, ctx);
    bus.emit('beast:sighted', { beastId: 'giant_boar', civId: 'rome' });

    expect(uiLayer.querySelector('#beast-sighting-banner')).toBeNull();
  });

  it('disposing removes every subscription this registrar added', () => {
    const bus = new EventBus();
    const uiLayer = document.createElement('div');
    const ctx = makePresentationContext({
      uiLayer,
      state: { currentPlayer: 'rome', civilizations: { rome: civ() } as never },
    });
    const dispose = registerBeastPresentation(bus, ctx);

    dispose();
    bus.emit('beast:awakened', { lairId: 'lair-1', beastId: 'giant_boar', position: { q: 0, r: 0 } });
    bus.emit('beast:slain', { beastId: 'giant_boar', lairId: 'lair-1', slayerCivId: 'rome', slayerUnitId: 'unit-1', goldAwarded: 10 });
    bus.emit('beast:hoard-claimed', { lairId: 'lair-1', beastId: 'giant_boar', civId: 'rome', choice: 'lore' });
    bus.emit('beast:sighted', { beastId: 'giant_boar', civId: 'rome' });

    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(uiLayer.querySelector('#beast-slay-ceremony')).toBeNull();
    expect(uiLayer.querySelector('#beast-sighting-banner')).toBeNull();
  });
});
