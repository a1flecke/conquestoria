/**
 * Combat resolution, combat rewards, unit obsolescence, and blocked-journey
 * notifications (#787 phase 7). Moved verbatim from `main.ts`.
 */
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { handleCombatResolvedEvent } from '@/ui/combat-resolved-presentation';
import { routeCombatRewardEarned } from '@/ui/notification-routing';
import type { PresentationRegistrar } from '@/presentation/register-all';

export const registerCombatPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('combat:resolved', event => {
      handleCombatResolvedEvent(ctx.session.getState(), event, {
        isPresentationSuppressed: () => ctx.isPresentationSuppressed(),
        applyVisual: result => ctx.applyCombatVisual(result),
        appendNotification: ctx.notifier.deliver,
      });
    }),
    bus.on('combat:reward-earned', ({ reward }) => {
      routeCombatRewardEarned(ctx.session.getState(), reward, ctx.notifier.deliver);
    }),
    bus.on('unit:obsolete', ({ civId, unitType }) => {
      const name = UNIT_DEFINITIONS[unitType]?.name ?? unitType;
      ctx.notifier.deliver(civId, `Your ${name} is now obsolete — upgrade it in your home city.`, 'info');
    }),
    bus.on('submarine:sighted', ({ unitId, civId }) => {
      const state = ctx.session.getState();
      const unit = state.units[unitId];
      const name = unit ? (UNIT_DEFINITIONS[unit.type]?.name ?? unit.type) : 'submarine';
      ctx.notifier.deliver(
        civId,
        `You spotted an enemy ${name}.`,
        'info',
        unit ? { kind: 'map', coord: unit.position, label: name } : undefined,
      );
    }),
    bus.on('unit:journey-blocked', ({ unitId, position }) => {
      // #551: recipient is the unit's actual owner, not whoever currentPlayer
      // happens to be at emit time -- the old showNotification call leaked this
      // to the wrong hot-seat player. Skip entirely if the unit is gone rather
      // than falling back to currentPlayer.
      const unit = ctx.session.getState().units[unitId];
      if (!unit) return;
      const type = UNIT_DEFINITIONS[unit.type]?.name ?? unit.type;
      const msg = `Your ${type} was blocked and stopped at (${position.q}, ${position.r}).`;
      ctx.notifier.deliver(unit.owner, msg, 'warning');
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
};
