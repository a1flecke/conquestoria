/**
 * War, peace, treaties, first contact, and opportunistic-war reputation
 * notifications (#787 phase 7). Moved verbatim from `main.ts`'s module-scope
 * `bus.on(...)` block; the routing logic itself (`route*` functions) is
 * untouched.
 */
import type { PresentationRegistrar } from '@/presentation/register-all';
import {
  routeWarDeclared,
  routeTreatyProposed,
  routeTreatyAccepted,
  routeFirstContact,
  routePeaceRequested,
  routePeaceMade,
  routeOpportunisticWar,
} from '@/ui/notification-routing';

export const registerDiplomacyPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('diplomacy:war-declared', ({ attackerId, defenderId }) => {
      routeWarDeclared(ctx.session.getState(), attackerId, defenderId, ctx.notifier.deliver);
    }),
    bus.on('diplomacy:treaty-proposed', event => {
      routeTreatyProposed(ctx.session.getState(), event, ctx.notifier.deliver);
    }),
    bus.on('diplomacy:treaty-accepted', event => {
      routeTreatyAccepted(ctx.session.getState(), event, ctx.notifier.deliver);
    }),
    bus.on('civilization:first-contact', ({ civA, civB }) => {
      // #551: routeFirstContact's sink is the delivery contract, which already
      // queues to pendingEvents for a non-active hot-seat recipient -- the old
      // unconditional queueFirstContactPendingEvents call was a second, always-on
      // queue that leaked stale growth into solo saves (which never drain it).
      routeFirstContact(ctx.session.getState(), civA, civB, ctx.notifier.deliver);
    }),
    bus.on('diplomacy:peace-requested', ({ fromCivId, toCivId }) => {
      // #551: routePeaceRequested already delivers to toCivId via appendToCivLog
      // (the delivery contract) -- the old extra showNotification here duplicated
      // the message AND leaked it to whoever currentPlayer was at emit time
      // instead of the actual recipient.
      routePeaceRequested(ctx.session.getState(), fromCivId, toCivId, ctx.notifier.deliver);
    }),
    bus.on('diplomacy:peace-made', ({ civA, civB }) => {
      routePeaceMade(ctx.session.getState(), civA, civB, ctx.notifier.deliver);
    }),
    bus.on('diplomacy:opportunistic-war', event => {
      routeOpportunisticWar(ctx.session.getState(), event, ctx.notifier.deliver);
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
