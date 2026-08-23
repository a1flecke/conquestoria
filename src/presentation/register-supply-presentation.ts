import type { PresentationRegistrar } from '@/presentation/register-all';
import type { SupplyWarning } from '@/systems/supply-warning-system';
import { presentSupplyWarning } from '@/ui/supply-warning-presentation';

const CRITICAL_KINDS: SupplyWarning['kind'][] = ['entering-combat-penalty', 'entering-movement-penalty'];

/**
 * #544 MR2: the All/Critical only/Off filter lives here, never inside
 * `deriveSupplyWarningTransitions` (contract §12: "presentation-only; never
 * changes mechanics"). "Critical" = the two kinds that carry an active
 * combat/movement penalty; `losing-full` (a heads-up before any penalty
 * applies) is filtered out under "Critical only" but shown under "All".
 */
export const registerSupplyPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribe = bus.on('supply:warning', (warning) => {
    const preference = ctx.session.getState().settings.supplyWarningPreference ?? 'all';
    if (preference === 'off') return;
    if (preference === 'critical' && !CRITICAL_KINDS.includes(warning.kind)) return;
    const presentation = presentSupplyWarning(warning);
    ctx.notifier.deliver(warning.viewerId, presentation.message, presentation.type);
  });

  return () => unsubscribe();
};
