import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerRogueElephantHostPresentation } from '@/presentation/register-rogue-elephant-host-presentation';
import { makePresentationContext } from '../helpers/presentation-context';
import { make, makeState } from '../ui/helpers/notification-state';

describe('Rogue Elephant Host presentation', () => {
  it('queues a warning only for the targeted hot-seat player', () => {
    const state = makeState({ hotSeat: { players: [] } as never });
    const { delivery, toast } = make(state);
    const bus = new EventBus();
    const ctx = makePresentationContext({ state });
    registerRogueElephantHostPresentation(bus, { ...ctx, notifier: { ...ctx.notifier, deliver: delivery.deliver } });

    bus.emit('rogue-elephant-host:lifecycle', { kind: 'warning', targetCivId: 'p2' });

    expect(toast).not.toHaveBeenCalled();
    expect(state.pendingEvents?.p2?.[0]?.message).toContain('Rogue Elephant Host warning');
    expect(state.pendingEvents?.p1).toBeUndefined();
  });

  it('queues a command-break notice only for the targeted hot-seat player', () => {
    const state = makeState({ hotSeat: { players: [] } as never });
    const { delivery, toast } = make(state);
    const bus = new EventBus();
    const ctx = makePresentationContext({ state });
    registerRogueElephantHostPresentation(bus, { ...ctx, notifier: { ...ctx.notifier, deliver: delivery.deliver } });

    bus.emit('rogue-elephant-host:lifecycle', { kind: 'command-broken', targetCivId: 'p2', dispersalTurnsRemaining: 3 });

    expect(toast).not.toHaveBeenCalled();
    expect(state.pendingEvents?.p2?.[0]?.message).toContain('Handler defeated');
    expect(state.pendingEvents?.p1).toBeUndefined();
  });
});
