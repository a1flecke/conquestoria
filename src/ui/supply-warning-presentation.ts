import type { NotificationEntry } from '@/core/notification-log';
import type { SupplyWarning } from '@/systems/supply-warning-system';

const MESSAGES: Record<SupplyWarning['kind'], (count: number) => string> = {
  'losing-full': (count) => count === 1
    ? 'A unit is about to lose Full Supply.'
    : `${count} units are about to lose Full Supply.`,
  'entering-combat-penalty': (count) => count === 1
    ? 'A unit is entering the -10% Combat overextension stage.'
    : `${count} units are entering the -10% Combat overextension stage.`,
  'entering-movement-penalty': (count) => count === 1
    ? 'A unit is entering the -1 Movement overextension stage.'
    : `${count} units are entering the -1 Movement overextension stage.`,
};

/**
 * `losing-full` is informational (no penalty has applied yet); the other two
 * kinds carry an active combat/movement penalty and are presented as real
 * warnings -- keeping this distinction real matters because the All/
 * Critical/Off preference (register-supply-presentation.ts) is meant to let
 * a player tune out the non-critical heads-up while still seeing real
 * penalties, which only means something if the two read differently.
 */
export function presentSupplyWarning(warning: SupplyWarning): { message: string; type: NotificationEntry['type'] } {
  return {
    message: MESSAGES[warning.kind](warning.unitIds.length),
    type: warning.kind === 'losing-full' ? 'info' : 'warning',
  };
}
