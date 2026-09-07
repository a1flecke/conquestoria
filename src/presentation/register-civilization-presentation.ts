import type { PresentationRegistrar } from '@/presentation/register-all';

export const registerCivilizationPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('civ:resettlement-needed', ({ civId }) => {
      ctx.notifier.deliver(
        civId,
        'Your civilization is still in play. Found a city with a settler to rebuild.',
        'warning',
      );
    }),
    bus.on('civ:resettled', ({ civId }) => {
      ctx.notifier.deliver(civId, 'Your civilization has a city again.', 'success');
    }),
    bus.on('civ:eliminated', ({ civId, eliminatedBy }) => {
      ctx.notifier.deliver(civId, 'Your civilization has been defeated.', 'warning');
      const victor = eliminatedBy ? ctx.session.getState().civilizations[eliminatedBy] : undefined;
      if (victor?.isHuman) {
        ctx.notifier.deliver(eliminatedBy!, 'A rival civilization has been defeated.', 'success');
      }
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
