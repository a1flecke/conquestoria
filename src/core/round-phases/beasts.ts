import type { GameState } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { createUnit } from '@/systems/unit-lifecycle';
import { getBlockingMapEntityKeysForOwner } from '@/systems/unit-movement-legality';
import {
  processBeasts,
  placeBeastLairs,
  BEAST_OWNER,
  LAIR_GROWTH_INTERVAL_TURNS,
  LAIR_GROWTH_CAP,
  LAIR_GROWTH_EXPERIENCE,
} from '@/systems/beast-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { deterministicCombatSeed, resolveCombat } from '@/systems/combat-system';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { PIRATE_OWNER } from '@/systems/threat-pressure-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { buildCombatPresentation } from '@/systems/viewer-event-presentation';
import { createSimulationRng } from '@/systems/simulation-rng';
import { resolveCombatEra, resolveNeutralPressureEra } from '@/systems/era-resolution';
import { classifyOwner } from '@/core/owner-kind';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Legendary beasts, when the mode is on: legacy saves get their lairs placed on the first tick, beasts get their
 * movement back, then lairs spawn, awaken and grow, beasts move and regenerate, and attack. A beast's position is
 * written directly (#994: `processBeasts` already filtered every candidate step against the blocking-entity keys).
 */
function runBeasts(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  // --- Process legendary beasts ---
  if (newState.beasts && newState.beasts.mode !== 'off') {
    // Legacy save migration: place lairs on the first turn after the flag is set by migrateLegacySave.
    // Deferred from load time so 🐾 markers don't appear until the player takes their first action.
    if (newState.beasts.migrationPending) {
      const mapSize = newState.settings.mapSize ?? 'medium';
      const cityPositions = Object.values(newState.cities).map(c => c.position);
      const migrationSeed = (newState.gameId ?? 'legacy') + '-beasts-migration';
      const lairs = placeBeastLairs(newState.map, cityPositions, mapSize, migrationSeed);
      newState = { ...newState, beasts: { ...newState.beasts, lairs, migrationPending: undefined } };
      if (!newState.pendingEvents) newState = { ...newState, pendingEvents: {} };
      for (const civId of Object.keys(newState.civilizations)) {
        if (!newState.pendingEvents![civId]) newState.pendingEvents![civId] = [];
        newState.pendingEvents![civId]!.push({
          type: 'info',
          message: 'Ancient legends are stirring in the wilderness. Legendary beasts now roam forgotten lairs across the land.',
          turn: newState.turn,
        });
      }
    }

    for (const [unitId, unit] of Object.entries(newState.units)) {
      if (unit.owner === BEAST_OWNER) {
        newState.units[unitId] = { ...unit, movementPointsLeft: UNIT_DEFINITIONS[unit.type].movementPoints, hasMoved: false };
      }
    }
    const beastUnits = Object.values(newState.units).filter(u => u.owner === BEAST_OWNER);
    const intruders = Object.values(newState.units).filter(unit => {
      const kind = classifyOwner(unit.owner);
      return kind !== 'beast' && kind !== 'barbarian' && unit.owner !== PIRATE_OWNER;
    });
    // #982: one shared stream drives every lair/beast this turn (processBeasts'
    // own internal lcg() advances sequentially per lair) -- was `turn*7919 + 13`,
    // no gameId. The +13 offset existed only to decorrelate from other
    // turn*7919-seeded sites (city-bombardment-system.ts, crisis-system.ts),
    // which is now handled by the 'beast-tick' domain tag instead.
    const beastSeed = Math.floor(createSimulationRng(newState, { domain: 'beast-tick', eventId: 'beast-tick' })() * 2147483647);
    // #994: beasts have no live Unit until a lair actually spawns one, so this is keyed by the
    // fixed BEAST_OWNER constant rather than a specific beast instance — every beast/lair shares
    // the same blocking rules regardless.
    const beastBlockedHexKeys = getBlockingMapEntityKeysForOwner(newState, BEAST_OWNER);
    const beastResult = processBeasts(
      Object.values(newState.beasts!.lairs),
      newState.map,
      intruders,
      beastUnits,
      lair => resolveNeutralPressureEra(newState, lair.position) ?? 1,
      newState.beasts!.mode,
      beastSeed,
      beastBlockedHexKeys,
    );
    // Rebuild lairs map from updated results (immutable)
    let updatedLairs: Record<string, import('@/core/types').BeastLair> = {};
    for (const lair of beastResult.updatedLairs) updatedLairs[lair.id] = lair;

    // Apply spawn orders — create beast units and wire them into lairs
    for (const spawn of beastResult.spawnOrders) {
      const def = BEAST_DEFINITIONS[spawn.beastId];
      const beast = createUnit(def.unitType, BEAST_OWNER, spawn.position, newState.idCounters);
      newState = { ...newState, units: { ...newState.units, [beast.id]: beast } };
      bus.emit('unit:created', { unit: beast }); // register with SfxDirector's unitTypeCache
      const lair = updatedLairs[spawn.lairId];
      if (lair) updatedLairs = { ...updatedLairs, [spawn.lairId]: { ...lair, unitIds: [...lair.unitIds, beast.id] } };
    }

    // Stamp awakenedTurn onto awoken lairs
    for (const awakening of beastResult.awakenings) {
      const lair = updatedLairs[awakening.lairId];
      if (lair) updatedLairs = { ...updatedLairs, [awakening.lairId]: { ...lair, awakenedTurn: newState.turn } };
      bus.emit('beast:awakened', awakening);
    }

    // Growth while ignored: every N turns an awake lair hardens and its beasts gain veterancy
    if (newState.turn % LAIR_GROWTH_INTERVAL_TURNS === 0) {
      for (const lair of Object.values(updatedLairs)) {
        if (lair.status !== 'awake' || lair.strength >= LAIR_GROWTH_CAP) continue;
        updatedLairs = { ...updatedLairs, [lair.id]: { ...lair, strength: lair.strength + 1 } };
        let nextUnits = newState.units;
        for (const unitId of lair.unitIds) {
          const beast = nextUnits[unitId];
          if (beast) nextUnits = { ...nextUnits, [unitId]: { ...beast, experience: beast.experience + LAIR_GROWTH_EXPERIENCE } };
        }
        newState = { ...newState, units: nextUnits };
      }
    }

    // Commit final lairs into state
    newState = { ...newState, beasts: { ...newState.beasts!, lairs: updatedLairs } };

    // #994: a raw position write, not moveUnitWithZoneOfControl/executeUnitMove — safe only
    // because processBeasts already filtered every candidate step against beastBlockedHexKeys
    // above (see .claude/rules/movement-actions.md's "World-actor step/spawn placement" section).
    for (const move of beastResult.moveOrders) {
      const beast = newState.units[move.unitId];
      if (beast) {
        newState = { ...newState, units: { ...newState.units, [move.unitId]: { ...beast, position: { ...move.toCoord }, movementPointsLeft: beast.movementPointsLeft - 1 } } };
      }
    }
    for (const regen of beastResult.regenOrders) {
      const beast = newState.units[regen.unitId];
      if (beast) {
        newState = { ...newState, units: { ...newState.units, [regen.unitId]: { ...beast, health: Math.min(100, beast.health + regen.amount) } } };
      }
    }

    for (const order of beastResult.attackOrders) {
      const attacker = newState.units[order.attackerUnitId];
      const defender = newState.units[order.defenderUnitId];
      if (!attacker || !defender) continue;
      const combatSeed = deterministicCombatSeed(newState.gameId, newState.turn, attacker.id, defender.id);
      // attack-contract-exempt: world-actor: legendary beasts pick their own targets in beast-system (processBeasts); not a civ's attack order
      const result = resolveCombat(
        attacker,
        defender,
        newState.map,
        combatSeed,
        buildCombatContextForDefender(newState, attacker, defender),
        resolveCombatEra(newState, attacker, defender),
      );
      const combatPresentation = buildCombatPresentation(newState, result, attacker, defender);
      const applied = applyCombatOutcomeToState(newState, result, combatSeed, bus);
      newState = applied.state;
      emitMinorCivQuestTransitions(bus, applied.questTransitions, newState);
      // A beast that died on its own counterattack is slain inside applyCombatOutcomeToState (#1014).
      // If the intruder died, no hoard — the beast attacked, not the player
      bus.emit('combat:resolved', { result, ...combatPresentation });
      for (const reward of applied.rewards) {
        bus.emit('combat:reward-earned', { reward });
      }
    }
  }
  return newState;
}

export const beastsPhase: RoundPhase = { id: 'beasts', run: runBeasts };
