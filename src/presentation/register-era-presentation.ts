/**
 * World-era and per-civ personal-era-advance notifications (#787 phase 7).
 * Moved verbatim from `main.ts`; the routing logic itself (`routeEraAdvanced`)
 * is untouched.
 */
import { SFX } from '@/audio/sfx';
import type { PresentationRegistrar } from '@/presentation/register-all';
import { routeEraAdvanced } from '@/ui/notification-routing';

export const registerEraPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('era:advanced', ({ era }) => {
      const humanCivIds = Object.entries(ctx.session.getState().civilizations)
        .filter(([, civ]) => civ.isHuman)
        .map(([civId]) => civId);
      routeEraAdvanced(era, humanCivIds, ctx.notifier.deliver);
    }),
    bus.on('civilization:era-advanced', ({ civId, era }) => {
      const civ = ctx.session.getState().civilizations[civId];
      if (!civ?.isHuman) return;
      ctx.notifier.deliver(
        civId,
        `${civ.name} has entered Era ${era}. Your technology now sets your civilization's era.`,
        'success',
      );
      if (civId === ctx.session.getState().currentPlayer) SFX.notification();
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
