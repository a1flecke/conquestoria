import type { PresentationRegistrar } from '@/presentation/register-all';

/** Delivers target-scoped Stampede lifecycle feedback through the shared hot-seat contract. */
export const registerStampedePresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('stampede:lifecycle', event => {
      if (event.kind === 'warning') {
        ctx.notifier.deliver(event.targetCivId, 'Stampede warning: herds are approaching. Screen them or defeat them before they damage the countryside.', 'warning');
        return;
      }
      if (event.kind === 'activated') {
        ctx.notifier.deliver(event.targetCivId, 'Stampede active: herds are moving. Contain them by preventing city damage, civilian losses, and more than two pillages.', 'warning');
        return;
      }
      if (event.outcome === 'contained') {
        ctx.notifier.deliver(event.targetCivId, 'Stampede contained. Your careful screens protected the countryside and earned Herding Insight.', 'success');
        return;
      }
      if (event.outcome === 'defeated') {
        ctx.notifier.deliver(event.targetCivId, 'Stampede defeated. Your forces earned Herding Insight for a future Beast Handler or War Elephant.', 'success');
        return;
      }
      ctx.notifier.deliver(event.targetCivId, 'Stampede survived. The herds have left the map.', 'info');
    }),
  ];
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
