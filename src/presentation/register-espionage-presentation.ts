/**
 * Spy detection, capture, execution, expiry, and city-flip notifications
 * (#787 phase 7). Moved verbatim from `main.ts`. The capture verdict dialog
 * itself (`showEspionageCaptureChoice`) stays a `main.ts`-local function --
 * see `PresentationContext`'s doc comment for why.
 */
import { routeCityFlipped, routeSabotageReliefDiscovered, routeCourierIntercepted, routeOfficialBribed } from '@/ui/notification-routing';
import type { PresentationRegistrar } from '@/presentation/register-all';

export const registerEspionagePresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('espionage:sabotage-relief-discovered', event => {
      routeSabotageReliefDiscovered(ctx.session.getState(), event, ctx.notifier.deliver);
    }),
    bus.on('espionage:spy-detected-traveling', ({ detectingCivId, spyOwner, wasDisguised, position }) => {
      const label = wasDisguised ? 'A disguised unit' : 'An enemy spy';
      ctx.notifier.deliver(
        detectingCivId,
        `${label} from ${spyOwner} was spotted near (${position.q}, ${position.r}).`,
        'warning',
      );
    }),
    bus.on('espionage:spy-caught-infiltrating', ({ capturingCivId, spyOwner, spyId, cityId }) => {
      const state = ctx.session.getState();
      const spy = state.espionage?.[spyOwner]?.spies[spyId];
      const city = state.cities[cityId];
      const captor = state.civilizations[capturingCivId]?.name ?? capturingCivId;
      ctx.notifier.deliver(
        spyOwner,
        `${spy?.name ?? 'Your spy'} was caught by ${captor} trying to infiltrate ${city?.name ?? 'an enemy city'}!`,
        'warning',
      );
      // Captor side: show verdict choice only when the human captor is currently active
      if (capturingCivId === state.currentPlayer) {
        ctx.showEspionageCaptureChoice(spyId, spyOwner);
      }
    }),
    // Show verdict choice when human player captures a spy during a mission
    bus.on('espionage:spy-captured', ({ capturingCivId, spyOwner, spyId }) => {
      const state = ctx.session.getState();
      if (capturingCivId === state.currentPlayer) {
        ctx.showEspionageCaptureChoice(spyId, spyOwner);
      }
      // Spy owner always gets a log entry, regardless of who is "current"
      const spy = state.espionage?.[spyOwner]?.spies[spyId];
      const captorName = state.civilizations[capturingCivId]?.name ?? capturingCivId;
      ctx.notifier.deliver(spyOwner, `${spy?.name ?? 'Your spy'} was captured by ${captorName}!`, 'warning');
    }),
    // Notify the spy's owner when they are executed by an AI or human captor
    bus.on('espionage:spy-executed', ({ executingCivId, spyOwner, spyName }) => {
      ctx.notifier.deliver(
        spyOwner,
        `${spyName} was executed by ${ctx.session.getState().civilizations[executingCivId]?.name ?? 'an enemy'}.`,
        'warning',
      );
    }),
    bus.on('espionage:spy-expired', ({ civId, spyName, unitType }) => {
      ctx.notifier.deliver(civId, `${spyName}'s network dissolved — ${unitType} era ended. No diplomatic penalty.`, 'info');
    }),
    bus.on('espionage:spy-auto-exfiltrated', ({ civId, cityId }) => {
      const city = ctx.session.getState().cities[cityId];
      ctx.notifier.deliver(civId, `Your spy was auto-exfiltrated from ${city?.name ?? 'a city'} after it changed hands.`, 'info');
    }),
    bus.on('espionage:city-flipped', event => {
      routeCityFlipped(ctx.session.getState(), event, ctx.notifier.deliver);
    }),
    bus.on('espionage:courier-intercepted', event => {
      routeCourierIntercepted(ctx.session.getState(), event, ctx.notifier.deliver);
    }),
    bus.on('espionage:official-bribed', event => {
      routeOfficialBribed(ctx.session.getState(), event, ctx.notifier.deliver);
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
