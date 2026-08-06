/**
 * Faction unrest/revolt/breakaway, crisis lifecycle, and treasury-strain
 * notifications (#787 phase 7). Moved verbatim from `main.ts`; the routing
 * logic itself is untouched. `economy:treasury-strain` groups here by theme
 * (empire-pressure notifications) despite its own namespace.
 */
import type { PresentationRegistrar } from '@/presentation/register-all';
import {
  routeFactionTransition,
  routeCrisisStarted,
  routeCrisisSpread,
  routeCrisisEscalated,
  routeCrisisResolved,
  routeWorldPressureCrisisStarted,
  routeWorldPressureCrisisResolved,
  routeCrisisFoeHuntedByAlly,
  routeCrisisAidSent,
  routeEconomyTreasuryStrain,
  type NotificationSink,
} from '@/ui/notification-routing';

export const registerFactionCrisisPresentation: PresentationRegistrar = (bus, ctx) => {
  // #551: routeFactionTransition already delivers via the delivery contract, which
  // queues to pendingEvents for a non-active hot-seat recipient -- no separate
  // collectEvent call needed here.
  //
  // Wrapped in a closure rather than hoisted as `const deliver = ctx.notifier.deliver`:
  // `ctx.notifier` is a getter backed by a `let` in main.ts that's only assigned
  // once `init()` runs, but this registrar is installed at module scope before
  // `init()` ever executes. Capturing the property directly here dereferenced
  // `ctx.notifier` (undefined at that point) immediately at registration time,
  // crashing every load with "Cannot read properties of undefined (reading
  // 'deliver')" -- caught by CI's web-smoke e2e run, not by the vitest suite,
  // since `makePresentationContext` always supplies a real `notifier` up front.
  const deliver: NotificationSink = (...args) => ctx.notifier.deliver(...args);

  const unsubscribers = [
    bus.on('faction:unrest-started', event => {
      routeFactionTransition(ctx.session.getState(), { type: 'faction:unrest-started', ...event }, deliver);
    }),
    bus.on('faction:revolt-started', event => {
      routeFactionTransition(ctx.session.getState(), { type: 'faction:revolt-started', ...event }, deliver);
    }),
    bus.on('faction:unrest-resolved', event => {
      routeFactionTransition(ctx.session.getState(), { type: 'faction:unrest-resolved', ...event }, deliver);
    }),
    bus.on('faction:concession-made', event => {
      routeFactionTransition(ctx.session.getState(), { type: 'faction:concession-made', ...event }, deliver);
    }),
    bus.on('faction:breakaway-started', event => {
      routeFactionTransition(ctx.session.getState(), { type: 'faction:breakaway-started', ...event }, deliver);
    }),
    bus.on('faction:breakaway-established', event => {
      routeFactionTransition(ctx.session.getState(), { type: 'faction:breakaway-established', ...event }, deliver);
    }),
    bus.on('faction:critical-status', event => {
      routeFactionTransition(ctx.session.getState(), { type: 'faction:critical-status', ...event }, deliver);
    }),
    bus.on('crisis:started', event => {
      routeCrisisStarted(ctx.session.getState(), event, deliver);
      routeWorldPressureCrisisStarted(ctx.session.getState(), event, deliver);
    }),
    bus.on('crisis:spread', event => {
      routeCrisisSpread(ctx.session.getState(), event, deliver);
    }),
    bus.on('crisis:escalated', event => {
      routeCrisisEscalated(ctx.session.getState(), event, deliver);
    }),
    bus.on('crisis:resolved', event => {
      routeCrisisResolved(ctx.session.getState(), event, deliver);
      routeWorldPressureCrisisResolved(ctx.session.getState(), event, deliver);
    }),
    bus.on('crisis:foe-hunted-by-ally', event => {
      routeCrisisFoeHuntedByAlly(ctx.session.getState(), event, deliver);
    }),
    bus.on('crisis:aid-sent', event => {
      routeCrisisAidSent(ctx.session.getState(), event, deliver);
    }),
    bus.on('economy:treasury-strain', event => {
      // #551: routeEconomyTreasuryStrain already delivers to event.civId via the
      // delivery contract -- no extra showNotification needed here.
      routeEconomyTreasuryStrain(ctx.session.getState(), event, deliver);
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
