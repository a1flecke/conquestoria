import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerSupplyPresentation } from '@/presentation/register-supply-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

function emitLosingFull(bus: EventBus): void {
  bus.emit('supply:warning', { viewerId: 'player', unitIds: ['u1'], kind: 'losing-full', playAudio: true });
}

function emitCombatPenalty(bus: EventBus): void {
  bus.emit('supply:warning', { viewerId: 'player', unitIds: ['u1'], kind: 'entering-combat-penalty', playAudio: true });
}

describe('supply presentation', () => {
  it('delivers a warning when preference is all', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { settings: { supplyWarningPreference: 'all' } as any } });

    registerSupplyPresentation(bus, ctx);
    emitLosingFull(bus);

    expect(ctx.deliver).toHaveBeenCalledWith('player', expect.any(String), 'info');
  });

  it('filters out losing-full when preference is critical, but still delivers a real penalty warning', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { settings: { supplyWarningPreference: 'critical' } as any } });

    registerSupplyPresentation(bus, ctx);
    emitLosingFull(bus);
    expect(ctx.deliver).not.toHaveBeenCalled();

    emitCombatPenalty(bus);
    expect(ctx.deliver).toHaveBeenCalledWith('player', expect.any(String), 'warning');
  });

  it('delivers nothing when preference is off', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { settings: { supplyWarningPreference: 'off' } as any } });

    registerSupplyPresentation(bus, ctx);
    emitLosingFull(bus);
    emitCombatPenalty(bus);

    expect(ctx.deliver).not.toHaveBeenCalled();
  });

  it('treats an undefined preference identically to all', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { settings: {} as any } });

    registerSupplyPresentation(bus, ctx);
    emitLosingFull(bus);

    expect(ctx.deliver).toHaveBeenCalledWith('player', expect.any(String), 'info');
  });

  it('disposing removes the subscription this registrar added', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { settings: { supplyWarningPreference: 'all' } as any } });
    const dispose = registerSupplyPresentation(bus, ctx);

    dispose();
    emitLosingFull(bus);

    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
