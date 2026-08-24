import type { GameState, UnitLandSupplyStatus } from '@/core/types';
import { hexKey } from './hex-utils';
import { unitParticipatesInLandSupply } from './supply-participation';
import { classifyLandSupplyTerritory } from './supply-territory';
import { getCivSupplySourceCandidates, getLandSupplySourceCoverage } from './supply-sources';
import { getNavalShoreSupplyAssignments } from './supply-naval';
import { advanceOverextensionStage, resolveSupplyRecoveryForUnit } from './supply-progression';
import { getPassiveStabilizationTargets } from './great-general-system';

/**
 * Thin composition root — the only supply module `turn-manager.ts` imports
 * directly (#544 MR1). Immutable per `.claude/rules/game-systems.md`:
 * returns a new `GameState` with a spread-copied `units` map, never
 * writing a unit back into the caller's original state object.
 */
export function resolveLandSupplyForCiv(state: GameState, civId: string): GameState {
  const shoreAssignments = getNavalShoreSupplyAssignments(state, civId);
  // Computed once per civ per round (not once per unit) — contract §35's
  // "avoid unbounded AI tile scans." An earlier draft called
  // getLandSupplySourceCoverage per unit with no precomputed candidates,
  // turning a full-map tile scan into O(units × map size) per civ.
  const sourceCandidates = getCivSupplySourceCandidates(state, civId);
  // #544 MR4: computed once per civ per round, same discipline as
  // sourceCandidates above (contract §35 -- avoid unbounded per-unit scans).
  const passiveStabilizationTargets = getPassiveStabilizationTargets(state, civId);
  let units = state.units;
  let changed = false;

  for (const unit of Object.values(state.units)) {
    if (unit.owner !== civId || unit.transportId) continue;
    if (!unitParticipatesInLandSupply(unit)) continue;

    const tile = state.map.tiles[hexKey(unit.position)];
    const territoryClass = classifyLandSupplyTerritory(state, civId, tile?.owner ?? null);
    const coveredByLandSource = getLandSupplySourceCoverage(state, civId, unit.position, sourceCandidates);
    const isSupplied = coveredByLandSource || shoreAssignments.has(unit.id);
    // #544 MR4: a General's passive stabilization aura AND Rally's one-round
    // protection both feed the same stabilizedByGeneral input -- Rally is
    // itself a General intervention, so folding it into the same boolean
    // matches supply-progression.ts's single documented extension point
    // instead of adding a second parameter.
    const stabilizedByGeneral = passiveStabilizationTargets.has(unit.id) || unit.rallyProtectedThisRound === true;

    const current: UnitLandSupplyStatus = unit.landSupply ?? { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 };
    // Only a *stabilized* city/fort grants the instant same-tile clear
    // (contract §7/§8) — an unstabilized freshly-captured source must not,
    // even if the unit happens to be supplied via a different, stabilized
    // source that also covers this position.
    const isOnStabilizedBaseTile = sourceCandidates.cities.some(city => hexKey(city.position) === hexKey(unit.position))
      || sourceCandidates.fortCoords.some(fortCoord => hexKey(fortCoord) === hexKey(unit.position));
    // Conservative proxy for MR1: true for any completed action, not only
    // attacking, so it can over-reset field-recovery progress but never
    // under-reset (never lets a unit recover early). See MR1 plan Task 10.
    const attackedThisTurn = unit.hasActed === true;

    const next = isSupplied
      ? resolveSupplyRecoveryForUnit(current, true, isOnStabilizedBaseTile, attackedThisTurn)
      : advanceOverextensionStage(current, territoryClass, false, stabilizedByGeneral);

    if (next !== current || unit.landSupply === undefined) {
      units = units === state.units ? { ...state.units } : units;
      units[unit.id] = { ...unit, landSupply: next };
      changed = true;
    }
  }

  return changed ? { ...state, units } : state;
}
