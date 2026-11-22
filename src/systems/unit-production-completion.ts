import type { EventBus } from '@/core/event-bus';
import type { GameState, Spy, Unit, UnitType } from '@/core/types';
import { baseNewAirUnit, canCompleteAirUnitProduction } from '@/systems/air-operations-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { createSpyFromUnit } from '@/systems/espionage-spy-lifecycle';
import { isSpyUnitType } from '@/systems/spy-unit-types';
import { applyLegendaryWonderTrainingEffects } from '@/systems/legendary-wonder-tactical-effects';
import { MISSIONARY_BASE_CHARGES, MISSIONARY_ZEAL_CHARGES } from '@/systems/religion-definitions';
import { consumeRecoveredHarnesses } from '@/systems/rogue-elephant-host-system';
import { consumeHerdingInsight } from '@/systems/stampede-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { isGeneTherapyEligibleUnitType } from '@/systems/gene-therapy-system';
import { createUnit } from '@/systems/unit-lifecycle';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';
import { findCityUnitSpawnTile } from '@/systems/unit-spawn-placement';
import { getTrainedMovementBonus } from '@/systems/unit-trained-movement-bonus';

/**
 * #1202 — the one place a finished trainable unit enters `GameState`.
 *
 * A completed unit is more than a `createUnit`: the owner's tech and wonders adjust it (missionary charges,
 * naval/air movement, gene therapy, barracks and wonder training XP), an aircraft must be based, a spy needs
 * its espionage record, and a few world-pressure systems consume the fact that it was trained. The turn path
 * (`processCityTurn` in `turn-manager.ts`) and the gold rush-buy (`economy-system.ts`) used to each write their
 * own version, and the buy path silently skipped almost all of it. Both now call this function, and
 * `tests/systems/unit-production-completion.test.ts` drives every `TRAINABLE_UNITS` entry through it.
 *
 * Pure: returns the new state plus what was made; events are announced by `announceUnitProduction` so the two
 * entry points cannot disagree about them either. Removal is the mirror image: `unit-removal-system.ts`.
 *
 * #1724: a map-occupying unit is placed through `findCityUnitSpawnTile` (city centre, then a
 * legal neighbour). No legal tile returns `no-legal-city-spawn-tile` before an id is consumed.
 */
export type UnitProductionCompletion =
  | { ok: true; state: GameState; unit: Unit; spy?: Spy }
  | { ok: false; reason: string };

export function completeUnitProduction(
  state: GameState,
  input: { civId: string; cityId: string; unitType: UnitType },
): UnitProductionCompletion {
  const { civId, cityId, unitType } = input;
  const civ = state.civilizations[civId];
  const city = state.cities[cityId];
  if (!civ || !city) return { ok: false, reason: 'unknown-civ-or-city' };

  const unitDef = UNIT_DEFINITIONS[unitType];
  if (unitDef?.airOperation) {
    const check = canCompleteAirUnitProduction(state, cityId, unitType);
    if (!check.ok) return { ok: false, reason: check.reason ?? 'air-base-unavailable' };
  }

  let next: GameState = consumeRecoveredHarnesses(consumeHerdingInsight(state, civId, unitType), civId, unitType);
  // #1724: a map-occupying unit gets the city centre when it is legal, else a legal
  // neighbour. A based aircraft is not a map occupant and keeps its city base. Nothing is
  // created (and no id is consumed) when no legal tile exists.
  const spawnPosition = unitDef?.airOperation
    ? city.position
    : findCityUnitSpawnTile(next, { ownerId: civId, unitType, stacking: 'same-owner' }, city.position);
  if (!spawnPosition) return { ok: false, reason: 'no-legal-city-spawn-tile' };
  const idCounters = { ...next.idCounters };
  const civDef = resolveCivDefinition(next, civ.civType ?? '');
  const unit = createUnit(unitType, civId, spawnPosition, idCounters, civDef?.bonusEffect);
  next = { ...next, idCounters };

  if (unitType === 'missionary') {
    // #592 MR5: charges are baked in from the owner's tech state AT BUILD TIME, never re-derived later — a
    // missionary built before missionary-zeal completes keeps 2 charges forever.
    unit.chargesRemaining = civ.techState.completed.includes('missionary-zeal')
      ? MISSIONARY_ZEAL_CHARGES
      : MISSIONARY_BASE_CHARGES;
  }
  // Baked in at build time, so `resetUnitTurn` re-applies it every turn; an upgrade recomputes it for its new type.
  const movementBonus = getTrainedMovementBonus(next, civId, unitType);
  unit.movementPointsLeft += movementBonus - (unit.movementBonus ?? 0);
  unit.movementBonus = movementBonus || undefined;
  // Gene Therapy applies to combat units only (`isGeneTherapyEligibleUnitType`, the same
  // predicate the research-completion charger uses): a strength-0 civilian must stay
  // `undefined`, never `true`/`false`. The resolver's gene-therapy branch runs BEFORE the
  // civilian-capture branch, so a flagged settler/worker/caravan would survive lethal hits
  // and could never be captured — and a `false` flag re-arms through the idle-city recharge
  // loop one round after the civilian parks in a city.
  if (civ.techState.completed.includes('gene-therapy') && isGeneTherapyEligibleUnitType(unitType)) {
    unit.geneTherapyReady = city.buildings.includes('gene_therapy_clinic');
  }
  const isLandCombatUnit = (unitDef?.domain ?? 'land') === 'land'
    && !isSpyUnitType(unitType)
    && !(UNIT_CLASS_BY_TYPE[unitType] ?? []).includes('civilian');
  if (isLandCombatUnit && city.buildings.includes('barracks')) unit.experience += 10;
  const training = applyLegendaryWonderTrainingEffects(next, {
    civId,
    unitType,
    era: resolveCivilizationEra(civ.techState.completed),
    isEligibleLandCombatUnit: isLandCombatUnit,
  });
  next = training.state;
  unit.experience += training.experienceBonus;

  if (unitDef?.airOperation) {
    const based = baseNewAirUnit(next, cityId, unit);
    if (!based.ok) return { ok: false, reason: based.reason };
    next = based.state;
  } else {
    next = { ...next, units: { ...next.units, [unit.id]: unit } };
  }
  const owner = next.civilizations[civId];
  next = { ...next, civilizations: { ...next.civilizations, [civId]: { ...owner, units: [...owner.units, unit.id] } } };

  let spy: Spy | undefined;
  const civEspionage = next.espionage?.[civId];
  if (isSpyUnitType(unitType) && civEspionage) {
    const created = createSpyFromUnit(civEspionage, unit.id, civId, unitType, `spy-unit-${unit.id}-${next.turn}`);
    spy = created.spy;
    next = { ...next, espionage: { ...next.espionage, [civId]: created.state } };
  }
  return { ok: true, state: next, unit: next.units[unit.id] ?? unit, spy };
}

/** The events of a completed unit, from the returned data. A real execution passes a bus. */
export function announceUnitProduction(
  bus: EventBus | undefined,
  cityId: string,
  civId: string,
  completion: Extract<UnitProductionCompletion, { ok: true }>,
): void {
  if (!bus) return;
  bus.emit('city:unit-trained', { cityId, unitType: completion.unit.type });
  if (completion.spy) bus.emit('espionage:spy-recruited', { civId, spy: completion.spy });
}
