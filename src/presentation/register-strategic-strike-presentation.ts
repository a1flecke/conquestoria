import type { PresentationRegistrar } from '@/presentation/register-all';

/**
 * #545 MR4: defender-notification for a strategic strike, same shape as
 * register-raider-presentation.ts's city:naval-bombarded handler -- the
 * controller emits the event after committing state (see
 * selection-controller.ts / panel-actions-controller.ts's onConfirmLaunch),
 * this registrar turns it into a delivered notification.
 */
export const registerStrategicStrikePresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('city:strategic-strike', ({ cityId, recipientCivId, goldLost }) => {
      const cityName = ctx.session.getState().cities[cityId]?.name ?? 'A city';
      const goldLine = goldLost > 0 ? ` and lost ${goldLost} gold` : '';
      ctx.notifier.deliver(recipientCivId, `${cityName} was struck by a strategic weapon${goldLine}.`, 'warning');
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
