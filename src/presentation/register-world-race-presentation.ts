/**
 * #992 world-race lifecycle notifications + big-moment ceremony. 'unlocked'
 * and 'launch-begun' are pure toasts (they name no civ, so there is nothing
 * for a ceremony to gate on). 'completed' additionally enqueues the
 * big-moment ceremony -- unconditional for state.currentPlayer, since a race
 * conclusion is a genuinely public world event every viewer eventually sees
 * (see buildWorldRaceConclusionMomentItem's own doc comment contrasting this
 * with the single-civ-scoped event-chain conclusion above it).
 */
import type { PresentationRegistrar } from '@/presentation/register-all';
import {
  routeWorldRaceUnlocked,
  routeWorldRaceLaunchBegun,
  routeWorldRaceCompleted,
  type NotificationSink,
} from '@/ui/notification-routing';
import { buildWorldRaceConclusionMomentItem } from '@/systems/world-race-presentation';

export const registerWorldRacePresentation: PresentationRegistrar = (bus, ctx) => {
  const deliver: NotificationSink = (...args) => ctx.notifier.deliver(...args);

  const unsubscribers = [
    bus.on('worldrace:unlocked', event => {
      routeWorldRaceUnlocked(ctx.session.getState(), event, deliver);
    }),
    bus.on('worldrace:launch-begun', event => {
      routeWorldRaceLaunchBegun(ctx.session.getState(), event, deliver);
    }),
    bus.on('worldrace:completed', event => {
      const state = ctx.session.getState();
      routeWorldRaceCompleted(state, event, deliver);
      ctx.ceremonies.enqueueWorldRaceConclusion(buildWorldRaceConclusionMomentItem(state, event));
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
