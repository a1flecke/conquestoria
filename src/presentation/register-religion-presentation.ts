/**
 * Religion founding, conversion, loyalty-pressure, and defection
 * notifications (#787 phase 7). Moved verbatim from `main.ts`; the routing
 * logic itself is untouched.
 */
import type { PresentationRegistrar } from '@/presentation/register-all';
import {
  routeReligionFounded,
  routeReligionCityConverted,
  routeLoyaltyWarning,
  routeCityDefected,
} from '@/ui/notification-routing';

export const registerReligionPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('religion:founded', event => {
      routeReligionFounded(ctx.session.getState(), event, ctx.notifier.deliver);
    }),
    bus.on('religion:city-converted', event => {
      routeReligionCityConverted(ctx.session.getState(), event, ctx.notifier.deliver);
    }),
    bus.on('religion:loyalty-warning', event => {
      routeLoyaltyWarning(ctx.session.getState(), event, ctx.notifier.deliver);
    }),
    bus.on('religion:city-defected', event => {
      routeCityDefected(ctx.session.getState(), event, ctx.notifier.deliver);
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
