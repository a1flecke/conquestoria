/**
 * Natural-wonder discovery and legendary-wonder lifecycle notifications
 * (#787 phase 7). Delegates ceremony playback to `CeremonyCoordinator`
 * (#787 phase 6) instead of touching the move-settle defer flag directly.
 */
import { getWonderDefinition } from '@/systems/wonder-definitions';
import { buildWonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { buildLegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import { routeLegendaryWonder } from '@/ui/notification-routing';
import type { PresentationRegistrar } from '@/presentation/register-all';

export const registerWonderPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('wonder:discovered', event => {
      const wonderDef = getWonderDefinition(event.wonderId);
      if (!wonderDef) return;
      const message = event.isFirstDiscoverer
        ? `Discovered ${wonderDef.name}! +${wonderDef.discoveryBonus.amount} ${wonderDef.discoveryBonus.type}`
        : `Found ${wonderDef.name}!`;
      ctx.notifier.deliver(event.civId, message, event.isFirstDiscoverer ? 'success' : 'info');

      const state = ctx.session.getState();
      const revealItem = buildWonderDiscoveryRevealItem(state, state.currentPlayer, event);
      if (revealItem) {
        ctx.ceremonies.enqueueWonderDiscovery(revealItem);
      }
    }),
    bus.on('wonder:legendary-ready', ({ civId, cityId, wonderId }) => {
      routeLegendaryWonder(ctx.session.getState(), { type: 'wonder:legendary-ready', civId, cityId, wonderId }, ctx.notifier.deliver);
    }),
    bus.on('wonder:legendary-availability', event => {
      routeLegendaryWonder(ctx.session.getState(), { type: 'wonder:legendary-availability', ...event }, ctx.notifier.deliver);
    }),
    bus.on('wonder:legendary-completed', ({ civId, cityId, wonderId, turnCompleted }) => {
      const event = { civId, cityId, wonderId, turnCompleted };
      const state = ctx.session.getState();
      routeLegendaryWonder(state, { type: 'wonder:legendary-completed', ...event }, ctx.notifier.deliver);
      const ceremonyItem = buildLegendaryWonderCompletionCeremonyItem(state, event);
      if (ceremonyItem) {
        ctx.ceremonies.enqueueLegendaryCompletion(ceremonyItem);
      }
    }),
    bus.on('wonder:legendary-lost', ({ civId, cityId, wonderId, goldRefund, transferableProduction }) => {
      routeLegendaryWonder(
        ctx.session.getState(),
        { type: 'wonder:legendary-lost', civId, cityId, wonderId, goldRefund, transferableProduction },
        ctx.notifier.deliver,
      );
    }),
    bus.on('wonder:legendary-race-revealed', ({ observerId, civId, cityId, wonderId }) => {
      routeLegendaryWonder(
        ctx.session.getState(),
        { type: 'wonder:legendary-race-revealed', observerId, civId, cityId, wonderId },
        ctx.notifier.deliver,
      );
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
