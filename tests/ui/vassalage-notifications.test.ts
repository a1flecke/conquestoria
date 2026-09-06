import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerDiplomacyPresentation } from '@/presentation/register-diplomacy-presentation';
import { createNotificationDelivery } from '@/ui/notification-delivery';
import { makePresentationContext } from '../helpers/presentation-context';
import { makeVassalageFixture } from '../systems/helpers/vassalage-fixture';

describe('#910 recipient-owned messages', () => {
  it('explains accepted roles exactly once to each party', () => {
    const state = makeVassalageFixture(); const bus = new EventBus();
    const ctx = makePresentationContext({state}); registerDiplomacyPresentation(bus, ctx);
    bus.emit('diplomacy:treaty-accepted', {civA: 'vassal', civB: 'overlord', treaty: 'vassalage'});
    expect(ctx.deliver).toHaveBeenCalledTimes(2);
    expect(ctx.deliver).toHaveBeenCalledWith('vassal', expect.stringContaining('your overlord'), 'success');
    expect(ctx.deliver).toHaveBeenCalledWith('overlord', expect.stringContaining('your vassal'), 'success');
  });
  it('queues protection and petition decisions privately, without toast or sound for the active third player', () => {
    const state = makeVassalageFixture(); state.currentPlayer = 'third';
    const bus = new EventBus(); const toast = vi.fn();
    const delivery = createNotificationDelivery({getState: () => state, toast, isSuppressed: () => false});
    const ctx = makePresentationContext({state, deliver: vi.fn(delivery.deliver)});
    registerDiplomacyPresentation(bus, ctx);
    bus.emit('diplomacy:protection-requested', {vassalId: 'vassal', overlordId: 'overlord', attackerId: 'third'});
    bus.emit('diplomacy:independence-requested', {vassalId: 'vassal', overlordId: 'overlord'});
    expect(toast).not.toHaveBeenCalled();
    expect(state.pendingEvents?.overlord).toHaveLength(2);
    expect(state.notificationLog?.third ?? []).toEqual([]);
  });
  it('routes an independence war once to each former party and unsubscribes', () => {
    const state = makeVassalageFixture(); const bus = new EventBus();
    const ctx = makePresentationContext({state}); const dispose = registerDiplomacyPresentation(bus, ctx);
    bus.emit('diplomacy:vassalage-ended', {vassalId: 'vassal', overlordId: 'overlord', reason: 'war'});
    expect(ctx.deliver).toHaveBeenCalledTimes(2);
    expect(ctx.deliver.mock.calls.every(call => /war/i.test(call[1]))).toBe(true);
    dispose(); bus.emit('diplomacy:independence-requested', {vassalId: 'vassal', overlordId: 'overlord'});
    expect(ctx.deliver).toHaveBeenCalledTimes(2);
  });
});
