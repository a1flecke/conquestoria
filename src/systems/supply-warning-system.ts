import type { EventBus } from '@/core/event-bus';
import type { GameState, LandSupplyState } from '@/core/types';
import { unitParticipatesInLandSupply } from '@/systems/supply-participation';

export interface SupplyWarning {
  viewerId: string;
  unitIds: string[];
  kind: 'losing-full' | 'entering-combat-penalty' | 'entering-movement-penalty';
  playAudio: boolean;
}

const WARNING_KINDS: SupplyWarning['kind'][] = [
  'losing-full', 'entering-combat-penalty', 'entering-movement-penalty',
];

function classifyTransition(before: LandSupplyState, after: LandSupplyState): SupplyWarning['kind'] | null {
  if (before === after) return null;
  if (before === 'full') return 'losing-full';
  if (before === 'grace' && after === 'degraded') return 'entering-combat-penalty';
  if (before === 'degraded' && after === 'severe') return 'entering-movement-penalty';
  return null;
}

/**
 * Meaningful-transition-only supply warnings for `viewerId` (contract §12),
 * grouped by `(viewerId, kind)` so a stack of units crossing the same
 * threshold in one round produces one warning, not a flood. No ledger -- a
 * value-comparison of `landSupply.state` before/after already fires exactly
 * once per real transition (unlike `strategic-warning-system.ts`'s "plan is
 * still mobilizing" condition, which can stay true for many rounds without a
 * new transition and so needs one). Only ever reads `viewerId`'s own units
 * (design spec §8 Safeguard for MR2).
 */
export function deriveSupplyWarningTransitions(
  beforeRound: Readonly<GameState>,
  finalState: GameState,
  viewerId: string,
): SupplyWarning[] {
  const viewer = finalState.civilizations[viewerId];
  if (!viewer?.isHuman || viewer.isEliminated) return [];

  const unitIdsByKind = new Map<SupplyWarning['kind'], string[]>();
  for (const unit of Object.values(finalState.units)) {
    if (unit.owner !== viewerId) continue;
    if (!unitParticipatesInLandSupply(unit)) continue;
    const beforeUnit = beforeRound.units[unit.id];
    const beforeState = beforeUnit?.landSupply?.state ?? 'full';
    const afterState = unit.landSupply?.state ?? 'full';
    const kind = classifyTransition(beforeState, afterState);
    if (!kind) continue;
    const existing = unitIdsByKind.get(kind);
    if (existing) existing.push(unit.id);
    else unitIdsByKind.set(kind, [unit.id]);
  }

  let audioAssigned = false;
  const warnings: SupplyWarning[] = [];
  for (const kind of WARNING_KINDS) {
    const unitIds = unitIdsByKind.get(kind);
    if (!unitIds || unitIds.length === 0) continue;
    const playAudio = !audioAssigned;
    audioAssigned = true;
    warnings.push({ viewerId, unitIds: unitIds.sort(), kind, playAudio });
  }
  return warnings;
}

export function applySupplyWarningTransitions(
  beforeRound: Readonly<GameState>,
  finalState: GameState,
  bus: EventBus,
): void {
  for (const viewerId of Object.values(finalState.civilizations)
    .filter(civ => civ.isHuman && !civ.isEliminated)
    .map(civ => civ.id)
    .sort()) {
    for (const warning of deriveSupplyWarningTransitions(beforeRound, finalState, viewerId)) {
      bus.emit('supply:warning', warning);
    }
  }
}
