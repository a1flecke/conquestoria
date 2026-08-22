import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerStampedePresentation } from '@/presentation/register-stampede-presentation';
import { makePresentationContext } from '../helpers/presentation-context';
import { make, makeState } from '../ui/helpers/notification-state';

describe('Stampede presentation', () => {
  it('notifies only the target civilization when a Stampede becomes active', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerStampedePresentation(bus, ctx);
    bus.emit('stampede:lifecycle', { kind: 'activated', targetCivId: 'p1', activeTurns: 1 });

    expect(ctx.deliver).toHaveBeenCalledTimes(1);
    expect(ctx.deliver).toHaveBeenCalledWith('p1', expect.stringContaining('Stampede'), 'warning');
  });

  it('does not leak a target civilization\'s resolution to another player', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerStampedePresentation(bus, ctx);
    bus.emit('stampede:lifecycle', { kind: 'resolved', targetCivId: 'p2', outcome: 'contained', rewardGranted: true });

    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.stringContaining('contained'), 'success');
    expect(ctx.deliver).not.toHaveBeenCalledWith('p1', expect.anything(), expect.anything());
  });

  it('uses the shared delivery contract to queue another hot-seat player\'s warning', () => {
    const state = makeState({ hotSeat: { players: [] } as never });
    const { delivery, toast } = make(state);
    const bus = new EventBus();
    const ctx = makePresentationContext({ state });
    registerStampedePresentation(bus, {
      ...ctx,
      notifier: { ...ctx.notifier, deliver: delivery.deliver },
    });

    bus.emit('stampede:lifecycle', { kind: 'warning', targetCivId: 'p2' });

    expect(toast).not.toHaveBeenCalled();
    expect(state.pendingEvents?.p2?.[0]?.message).toContain('Stampede warning');
    expect(state.notificationLog?.p2?.[0]?.message).toContain('Stampede warning');
  });

  it('removes the listener when presentation is disposed', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();
    const dispose = registerStampedePresentation(bus, ctx);

    dispose();
    bus.emit('stampede:lifecycle', { kind: 'warning', targetCivId: 'p1' });

    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
