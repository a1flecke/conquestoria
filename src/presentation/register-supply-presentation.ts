import type { PresentationRegistrar } from '@/presentation/register-all';
import { shouldPresentSupplyWarning } from '@/systems/supply-warning-system';
import { presentSupplyWarning } from '@/ui/supply-warning-presentation';
import { deliverViewerWarning } from '@/ui/notification-routes/notification-sink';

/**
 * #544 MR2: every supply transition is emitted. Text and audio share the
 * presentation preference. "Critical" = the two kinds that carry an active
 * combat/movement penalty; `losing-full` (a heads-up before any penalty
 * applies) is filtered out under "Critical only" but shown under "All".
 */
export const registerSupplyPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribe = bus.on('supply:warning', (warning) => {
    const preference = ctx.session.getState().settings.supplyWarningPreference ?? 'all';
    if (!shouldPresentSupplyWarning(warning.kind, preference)) return;
    deliverViewerWarning(ctx.notifier.deliver, warning.viewerId, presentSupplyWarning(warning),
      warning.playAudio ? 'supply:warning' : undefined);
  });

  return () => unsubscribe();
};
