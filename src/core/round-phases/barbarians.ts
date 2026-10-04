import type { GameState } from '@/core/types';
import { resetUnitTurn, createUnit } from '@/systems/unit-lifecycle';
import { processPurposefulBarbarians } from '@/systems/barbarian-system';
import { deterministicCombatSeed, resolveCombat } from '@/systems/combat-system';
import { getUnitCombatStrength } from '@/systems/combat-defense-strength';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { resolveUnitVsUnitAttack } from '@/systems/attack-targeting';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { applyPillageToState } from '@/systems/pillage-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { buildCombatPresentation } from '@/systems/viewer-event-presentation';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { createSimulationRng } from '@/systems/simulation-rng';
import { resolveCombatEra } from '@/systems/era-resolution';
import { resolveChallengeForCiv } from '@/core/opponent-challenge';
import {
  applyCityHpRegeneration,
  applyCitySiegeOutcome,
  getCityCounterFireDamage,
  getCityGarrisonUnit,
  resolveCitySiegeDamage,
} from '@/systems/city-siege-system';
import { removeUnits } from '@/systems/unit-removal-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Barbarians. Their units get their movement back, `processPurposefulBarbarians` plans for every camp, raiders
 * spawn, then orders run in a fixed sequence: pillage-on-arrival BEFORE moves (an arriving raider's plan also
 * queues a withdrawal move; pillaging first spends its movement so the withdrawal fails and the raider retreats
 * next turn, #541), moves, unit attacks, and city attacks through the shared siege helper (#522: a garrison blocks
 * damage, walls and techs mitigate it, and a 0-HP result is sack-vs-destroy by era and the owner's difficulty).
 * City HP regeneration closes the phase so damage from a raid that did not destroy the city does not linger.
 */
function runBarbarians(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  // --- Process barbarians ---
  // Reset barbarian unit movement each turn (they are not in any civ's units array)
  for (const [unitId, unit] of Object.entries(newState.units)) {
    if (unit.owner === 'barbarian') {
      newState.units[unitId] = resetUnitTurn(unit);
    }
  }
  const barbResult = processPurposefulBarbarians(newState);
  newState.opponentAI = barbResult.opponentAI;
  newState.barbarianCampPressure = barbResult.barbarianCampPressure;
  newState.barbarianCamps = {};
  for (const camp of barbResult.updatedCamps) {
    newState.barbarianCamps[camp.id] = camp;
  }

  // Spawn barbarian raiders
  for (const spawn of barbResult.spawnedUnits) {
    const raider = createUnit(spawn.unitType ?? 'warrior', 'barbarian', spawn.position, newState.idCounters);
    newState.units[raider.id] = raider;
    if (newState.opponentAI) {
      newState.opponentAI.barbarianHomeCampByUnitId[raider.id] = spawn.campId;
    }
    bus.emit('barbarian:spawned', { campId: spawn.campId, unitId: raider.id });
  }

  // Barbarian pillage-on-arrival. Must run BEFORE moves: an arriving raider's plan
  // transitions to 'withdrawing' in the same processPurposefulBarbarians call that
  // queues its pillageOrder, which also queues a withdrawal moveOrder for that same
  // unit this turn (#541 second-pass review — the original order had moves first,
  // so the raider stepped away from the resource tile before applyPillageToState
  // re-derived the tile from the unit's now-stale position, silently pillaging
  // nothing). Pillaging first sets movementPointsLeft to 0, so the queued
  // withdrawal move correctly fails validation and simply doesn't fire this turn —
  // the raider retreats next turn instead.
  for (const order of barbResult.pillageOrders) {
    const result = applyPillageToState(newState, order.unitId);
    if (result.ok) newState = result.state;
  }

  // Move barbarian units
  for (const order of barbResult.moveOrders) {
    const unit = newState.units[order.unitId];
    if (unit) {
      const movement = executeUnitMove(newState, order.unitId, order.toCoord, { actor: 'world', bus });
      if (movement.ok) newState = movement.state;
    }
  }

  // Barbarian attacks
  for (const attack of barbResult.attackOrders) {
    const attacker = newState.units[attack.attackerUnitId];
    const defender = newState.units[attack.defenderUnitId];
    if (!attacker || !defender) continue;
    if (!resolveUnitVsUnitAttack(newState, attacker, defender, { requireVisibility: false }).ok) continue;
    const combatSeed = deterministicCombatSeed(newState.gameId, newState.turn, attacker.id, defender.id);
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
    bus.emit('combat:resolved', { result, ...combatPresentation });
    for (const reward of applied.rewards) {
      bus.emit('combat:reward-earned', { reward });
    }
  }

  // Barbarian city attacks — routed through the shared siege helper (#522): a
  // garrisoned city fully blocks damage, walls/techs mitigate it, and the 0-HP
  // outcome is sack-vs-destroy gated by era + the owner's resolved difficulty.
  for (const order of barbResult.cityAttackOrders) {
    const city = newState.cities[order.cityId];
    if (!city) continue;
    const currentHp = city.hp ?? 100;
    if (currentHp <= 0) continue; // already at zero (shouldn't persist, but guard against legacy saves)
    const ownerCiv = newState.civilizations[city.owner];
    if (!ownerCiv) continue;

    const result = resolveCitySiegeDamage({
      city,
      ownerCiv,
      rawDamage: order.damage,
      attackerDomain: 'land',
      hasGarrison: getCityGarrisonUnit(newState.units, city) !== undefined,
      isOwnersLastCity: ownerCiv.cities.length <= 1,
      era: resolveCivilizationEra(ownerCiv.techState.completed),
      challenge: resolveChallengeForCiv(newState, city.owner),
    });
    newState = applyCitySiegeOutcome(newState, order.cityId, result);
    if (result.outcome === 'blocked') continue;

    // Counter-fire (#522): a walled, ungarrisoned city fights back against the raider
    // that's damaging it. #982: same 'city-counter-fire' domain tag as
    // city-bombardment-system.ts/pirate-system.ts's own counter-fire rolls.
    // Was `barbSeed ^ attackerUnitId.charCodeAt(0)`, where barbSeed itself
    // (`turn*31337 + camp count`) had no gameId and no per-attack identity,
    // shared by every barbarian counter-fire event in the game this turn.
    const attackerUnit = newState.units[order.attackerUnitId];
    if (attackerUnit) {
      const attackerStrength = getUnitCombatStrength(attackerUnit) * (attackerUnit.health / 100);
      const counterFireSeed = Math.floor(createSimulationRng(newState, { domain: 'city-counter-fire', actorId: order.attackerUnitId, targetId: order.cityId })() * 2147483647);
      const counterFireDamage = getCityCounterFireDamage(
        city, ownerCiv, 'land', attackerStrength, false, counterFireSeed,
      );
      if (counterFireDamage > 0) {
        const healthAfter = attackerUnit.health - counterFireDamage;
        const attackerDied = healthAfter <= 0;
        if (attackerDied) {
          newState = removeUnits(newState, [order.attackerUnitId], { reason: 'destroyed', bus }).state;
          // barbarianHomeCampByUnitId self-prunes stale entries for dead units on the
          // next processing pass (barbarian-system.ts) -- no further cleanup needed here.
        } else {
          newState = {
            ...newState,
            units: { ...newState.units, [order.attackerUnitId]: { ...attackerUnit, health: healthAfter } },
          };
        }
        bus.emit('city:counter-fire', {
          cityId: order.cityId,
          attackerUnitId: order.attackerUnitId,
          source: 'barbarian',
          damage: counterFireDamage,
          attackerDied,
        });
      }
    }

    bus.emit('barbarian:city-attacked', { attackerUnitId: order.attackerUnitId, cityId: order.cityId, hpLost: result.hpLost });
    if (newState.opponentAI) {
      const campId = newState.opponentAI.barbarianHomeCampByUnitId[order.attackerUnitId];
      const plan = campId ? newState.opponentAI.barbarianCamps[campId] : undefined;
      if (plan?.target.kind === 'city' && plan.target.id === order.cityId) {
        newState.opponentAI.barbarianCamps[campId] = {
          ...plan,
          phase: 'withdrawing',
          lastProgressTurn: newState.turn,
        };
      }
    }

    if (result.outcome === 'sacked') {
      bus.emit('city:sacked', { cityId: order.cityId, source: 'barbarian', goldLost: result.goldLost });
    } else if (result.outcome === 'destroyed') {
      bus.emit('barbarian:city-destroyed', { attackerUnitId: order.attackerUnitId, cityId: order.cityId, ownerId: city.owner });
    }
  }

  // City HP regeneration (#522) — +5/turn for any city below max HP with no hostile
  // unit adjacent, so damage from a raid that didn't destroy the city doesn't linger
  // forever.
  newState = applyCityHpRegeneration(newState);
  return newState;
}

export const barbariansPhase: RoundPhase = { id: 'barbarians', run: runBarbarians };
