/**
 * #990 event-chain lifecycle notifications — its own registrar (not folded
 * into register-faction-crisis-presentation.ts) since event chains are a
 * structurally separate system from crises, even though both sit under the
 * shared staged-lifecycle engine.
 *
 * #993: a genuine ('resolved') conclusion additionally enqueues a "big
 * moment" ceremony, on top of the toast notification every outcome already
 * gets. `buildEventChainConclusionMomentItem` is viewer-scoped to
 * `state.currentPlayer` (see its own docblock), so an AI civ's or a
 * different hot-seat player's chain resolving never queues a ceremony —
 * only its own toast, unchanged.
 */
import type { PresentationRegistrar } from '@/presentation/register-all';
import { routeEventChainStarted, routeEventChainResolved } from '@/ui/notification-routes/crisis-routes';
import { type NotificationSink } from '@/ui/notification-routes/notification-sink';
import { buildEventChainConclusionMomentItem } from '@/systems/event-chain-presentation';

export const registerEventChainPresentation: PresentationRegistrar = (bus, ctx) => {
  const deliver: NotificationSink = (...args) => ctx.notifier.deliver(...args);

  const unsubscribers = [
    bus.on('eventchain:started', event => {
      routeEventChainStarted(ctx.session.getState(), event, deliver);
    }),
    bus.on('eventchain:resolved', event => {
      const state = ctx.session.getState();
      routeEventChainResolved(state, event, deliver);
      const momentItem = buildEventChainConclusionMomentItem(state, event);
      if (momentItem) {
        ctx.ceremonies.enqueueEventChainConclusion(momentItem);
      }
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
