/**
 * #990 event-chain lifecycle notifications — its own registrar (not folded
 * into register-faction-crisis-presentation.ts) since event chains are a
 * structurally separate system from crises, even though both sit under the
 * shared staged-lifecycle engine.
 */
import type { PresentationRegistrar } from '@/presentation/register-all';
import {
  routeEventChainStarted,
  routeEventChainResolved,
  type NotificationSink,
} from '@/ui/notification-routing';

export const registerEventChainPresentation: PresentationRegistrar = (bus, ctx) => {
  const deliver: NotificationSink = (...args) => ctx.notifier.deliver(...args);

  const unsubscribers = [
    bus.on('eventchain:started', event => {
      routeEventChainStarted(ctx.session.getState(), event, deliver);
    }),
    bus.on('eventchain:resolved', event => {
      routeEventChainResolved(ctx.session.getState(), event, deliver);
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
