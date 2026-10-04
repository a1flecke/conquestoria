/**
 * Combat and conquest actions (#1243), split out of `player-action-controller.ts`: attack,
 * bombard, hold siege, city / camp assault and city-state conquest. Every action still
 * routes through its canonical contract (#1219 attack, #966 city interaction); bodies
 * verbatim. `ensurePlayerWarState` is the unit-actions slice's, reached through `cross`.
 */
import { fireFirstBombardmentTip } from '@/ui/advisor-system';
import type { CivBonusEffect, CombatResult, HexCoord } from '@/core/types';
import { getBlockingMapEntityAt } from '@/systems/unit-movement-legality';
import { hexKey, parseHexKey, hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { createCityCapturePanel } from '@/ui/city-capture-panel';
import { deterministicCombatSeed, resolveCombat } from '@/systems/combat-system';
import { buildCombatContextForDefender, getAmphibiousAssaultMultiplier } from '@/systems/combat-context';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { resolveUnitCityBombardment } from '@/systems/city-bombardment-system';
import { applyCombatOutcomeToState, getCaptureNotificationLabel } from '@/systems/combat-reward-system';
import { resolveCombatEra } from '@/systems/era-resolution';
import { applyCampDestructionAtTarget } from '@/systems/barbarian-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { SFX } from '@/audio/sfx';
import { conquestMinorCiv, applyDiplomaticReaction } from '@/systems/minor-civ-system';
import { buildUnitOccupancy, hasHostileUnitAtCoord } from '@/systems/unit-occupancy';
import { beginPlayerCityAssaultChoice, shouldPromptForPlayerCityCapture } from '@/input/city-assault-flow';
import { canUnitOccupyCity } from '@/systems/city-capture-system';
import { buildCombatPresentation } from '@/systems/viewer-event-presentation';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { getEmbarkedAssaultTarget, detachCargoForEmbarkedAssault } from '@/systems/transport-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { emitMinorCivLeagueNotices } from '@/systems/minor-civ-league-presentation';
import { getCurrentCivDef } from '@/app/cross-cutting-helpers';
import type { PlayerActionController, PlayerActionControllerDeps } from './player-action-shared';

export interface PlayerCombatActions {
  executeMinorCivConquest: PlayerActionController['executeMinorCivConquest'];
  bombardCity: PlayerActionController['bombardCity'];
  holdSiege: PlayerActionController['holdSiege'];
  beginPlayerCityAssault: PlayerActionController['beginPlayerCityAssault'];
  beginPlayerCampAssault: PlayerActionController['beginPlayerCampAssault'];
  executeAttack: PlayerActionController['executeAttack'];
}

export function createPlayerCombatActions(deps: PlayerActionControllerDeps, cross: { ensurePlayerWarState(targetCivId: string): void }): PlayerCombatActions {
  function executeMinorCivConquest(unitId: string, target: HexCoord, minorCivId: string, cityId: string): void {
    const cityName = deps.session.getState().cities[cityId]?.name ?? 'City-State';
    const movement = deps.selectionController.executeAnimatedUnitMove(unitId, () => executeUnitMove(deps.session.getState(), unitId, target, {
      actor: 'player',
      civId: deps.session.getState().currentPlayer,
      bus: deps.bus,
      foreignCityEntryId: cityId,
    }));
    if (!movement.ok) return;
    deps.session.commit(movement.state);
    const movedUnit = movement.state.units[unitId];
    const stateAfterMove = movedUnit
      ? { ...movement.state, units: { ...movement.state.units, [unitId]: { ...movedUnit, movementPointsLeft: 0 } } }
      : movement.state;
    const conquered = conquestMinorCiv(stateAfterMove, minorCivId, stateAfterMove.currentPlayer);
    deps.session.commit(conquered.state);
    emitMinorCivLeagueNotices(stateAfterMove, conquered.state, deps.bus);
    emitMinorCivQuestTransitions(deps.bus, conquered.transitions, deps.session.getState());
    if (conquered.conquered) deps.bus.emit('minor-civ:destroyed', { minorCivId, conquerorId: deps.session.getState().currentPlayer });
    deps.showNotification(`${cityName} has been conquered!`, 'success');
    SFX.tap();
  }

  /**
   * #974: a unit spends its action shelling a hostile city. Never captures, never razes --
   * ownership changes only through beginPlayerCityAssault. Declaring war first goes through
   * the same ensurePlayerWarState the assault path uses, so bombarding can never start a war
   * more quietly than storming would.
   */
  function bombardCity(attackerId: string, cityId: string): void {
    const city = deps.session.getState().cities[cityId];
    if (!city) return;
    cross.ensurePlayerWarState(city.owner);

    const bombardment = resolveUnitCityBombardment(deps.session.getState(), {
      attackerUnitId: attackerId,
      cityId,
      source: 'player',
    });
    if (!bombardment.ok) {
      deps.showNotification('That bombardment is no longer possible.', 'warning');
      return;
    }

    deps.session.commit(bombardment.state);
    if (bombardment.cityEvent) deps.bus.emit('city:bombarded', bombardment.cityEvent);
    if (bombardment.batteryEvent) deps.bus.emit('city:coastal-battery-fired', bombardment.batteryEvent);
    // Bombardment gets its own duller cue, distinct from a unit-vs-unit exchange (#974).
    SFX.bombard();
    fireFirstBombardmentTip(deps.session.getState(), deps.bus);

    const after = deps.session.getState();
    deps.showNotification(
      bombardment.attackerDied
        ? `${city.name}'s defenses destroyed your unit!`
        : `${city.name} took ${bombardment.hpLost} damage (${after.cities[cityId]?.hp ?? 0}/100).`,
      bombardment.attackerDied ? 'warning' : 'info',
    );

    deps.selectionController.refreshSelectedUnitAfterCombat();
    deps.selectionController.selectNextUnit();
  }

  /**
   * #974: bombard now, then keep bombarding this city each turn. The order re-checks
   * legality every turn through the same resolver a manual tap uses, and clears itself with
   * a reason the moment bombarding stops being possible.
   */
  function holdSiege(attackerId: string, cityId: string): void {
    bombardCity(attackerId, cityId);
    const state = deps.session.getState();
    const unit = state.units[attackerId];
    const city = state.cities[cityId];
    // The unit may have died to counter-fire, or the city may already be gone.
    if (!unit || !city) return;

    deps.session.commit({
      ...state,
      units: {
        ...state.units,
        [attackerId]: { ...unit, automation: { mode: 'hold-siege', cityId, startedTurn: state.turn } },
      },
    });
    deps.showNotification(`Your unit will keep bombarding ${city.name}.`, 'info');
  }

  function beginPlayerCityAssault(
    attackerId: string,
    cityId: string,
    attackerBonus?: CivBonusEffect,
    precedingCombat?: CombatResult,
    embarkedAssault = false,
  ): 'pending' | 'resolved' {
    const city = deps.session.getState().cities[cityId];
    if (!city) return 'resolved';
    const attacker = deps.session.getState().units[attackerId];
    if (!attacker || !canUnitOccupyCity(attacker)) return 'resolved';

    cross.ensurePlayerWarState(city.owner);
    let attackerMultiplier: number | undefined;
    if (embarkedAssault) {
      const legality = getEmbarkedAssaultTarget(deps.session.getState(), attackerId, city.position, { viewerId: deps.session.getState().currentPlayer });
      if (!legality.ok || legality.targetType !== 'city') {
        deps.showNotification('That coastal assault is no longer possible.', 'warning');
        return 'resolved';
      }
      attackerMultiplier = getAmphibiousAssaultMultiplier(deps.session.getState(), attacker, city.position);
      const detached = detachCargoForEmbarkedAssault(deps.session.getState(), attackerId);
      if (!detached.ok) return 'resolved';
      deps.session.commit(detached.state);
    }
    const begun = beginPlayerCityAssaultChoice(
      deps.session.getState(),
      attackerId,
      cityId,
      deps.bus,
      precedingCombat,
      attackerMultiplier,
    );
    deps.session.commit(begun.state);

    if (!begun.ok) {
      deps.showNotification(
        begun.reason === 'repelled-by-city-defense'
          ? "Your attack was repelled by the city's defenses!"
          : 'The attack could not proceed.',
        'warning',
      );
      return 'resolved';
    }

    deps.selection.setPendingIntent({ kind: 'city-capture', choice: begun.pending });
    if (!shouldPromptForPlayerCityCapture(city)) {
      deps.turnFlow.finalizePendingCityCaptureChoice('raze', attackerBonus);
      return 'resolved';
    }

    createCityCapturePanel(deps.uiLayer, {
      cityName: city.name,
      occupiedPopulation: begun.pending.occupiedPopulation,
      razeGold: begun.pending.razeGold,
      onOccupy: () => deps.turnFlow.finalizePendingCityCaptureChoice('occupy', attackerBonus),
      onRaze: () => deps.turnFlow.finalizePendingCityCaptureChoice('raze', attackerBonus),
    });
    return 'pending';
  }

  /**
   * Destroys an undefended barbarian camp the attacker is directly adjacent to (#845).
   * Unlike `beginPlayerCityAssault`, a camp has no capture/raze choice -- `destroyCamp`
   * always produces the same flat-gold outcome, so this consumes the unit's action and
   * calls `applyCampDestructionAtTarget` in one step, mirroring the exact notification/
   * quest-transition/advisor/diplomatic-reaction sequence `executeAttack` already runs
   * when a camp's last defender dies (see below) -- this is just that same sequence
   * reached without a defending unit to fight first.
   */
  function beginPlayerCampAssault(attackerId: string, campId: string): void {
    const state = deps.session.getState();
    const attacker = state.units[attackerId];
    const camp = state.barbarianCamps[campId];
    if (!attacker || !camp) return;

    const blockingEntity = getBlockingMapEntityAt(state, attacker, camp.position);
    const distance = state.map.wrapsHorizontally
      ? wrappedHexDistance(attacker.position, camp.position, state.map.width)
      : hexDistance(attacker.position, camp.position);
    // Defense-in-depth (matching executeAttack's own hasActed re-check comment): a garrisoned
    // camp must go through ordinary combat against its defender instead, not this direct
    // one-step destroy path. The normal tap-intent flow already routes a garrisoned camp to
    // combat-preview before it ever reaches resolveSelectedUnitTapIntent's camp check, but this
    // execution-layer check must not trust that UI precedence alone.
    const occupancy = buildUnitOccupancy(state.units);
    const hasDefender = hasHostileUnitAtCoord(occupancy, camp.position, attacker.owner);
    if (
      attacker.hasActed
      || blockingEntity?.reason !== 'barbarian-camp'
      || blockingEntity.entityId !== campId
      || distance !== 1
      || hasDefender
    ) {
      deps.showNotification('That camp is no longer within reach.', 'warning');
      return;
    }

    const banditLordName = camp.banditLordName;
    deps.session.commit({
      ...state,
      units: {
        ...state.units,
        [attackerId]: { ...attacker, hasActed: true, hasMoved: true, movementPointsLeft: 0 },
      },
    });

    const destroyedCamp = applyCampDestructionAtTarget(
      deps.session.getState(),
      deps.session.getState().currentPlayer,
      camp.position,
      deps.session.getState().turn,
    );
    if (destroyedCamp.campId) {
      deps.session.commit(destroyedCamp.state);
      emitMinorCivQuestTransitions(deps.bus, destroyedCamp.questTransitions, deps.session.getState());
      const label = banditLordName ? `${banditLordName}'s camp` : 'Barbarian camp';
      deps.showNotification(`${label} destroyed! +${destroyedCamp.reward} gold`, 'success');
      deps.advisorSystem.resetMessage('treasurer_camp_reward');
      deps.advisorSystem.check(deps.session.getState());
      for (const mcId of Object.keys(deps.session.getState().minorCivs)) {
        applyDiplomaticReaction(deps.session.getState(), 'camp_destroyed_nearby', deps.session.getState().currentPlayer, mcId);
      }
    }

    SFX.combat();
  }

  function executeAttack(attackerId: string, targetKey: string): void {
    const initialAttacker = deps.session.getState().units[attackerId];
    const targetCoord = parseHexKey(targetKey);
    const amphibiousAssault = Boolean(initialAttacker?.transportId);
    const legality = amphibiousAssault
      ? getEmbarkedAssaultTarget(deps.session.getState(), attackerId, targetCoord, { viewerId: deps.session.getState().currentPlayer })
      : canUnitAttackTarget(deps.session.getState(), initialAttacker, targetCoord, { viewerId: deps.session.getState().currentPlayer });
    // hasActed guard: enforce "no action remaining" at the execution layer, not just
    // the highlight layer (getAttackTargets). Prevents double-action if executeAttack
    // is ever called outside the normal tap → highlight → confirm flow.
    if (!initialAttacker || initialAttacker.hasActed || !legality.ok) {
      deps.showNotification('That target is no longer attackable.', 'warning');
      const currentlySelected = deps.selection.getSelectedUnitId();
      if (currentlySelected) deps.selectionController.selectUnit(currentlySelected);
      return;
    }

    if (!amphibiousAssault && legality.targetType === 'city') {
      const city = deps.session.getState().cities[legality.cityId];
      if (!city) return;
      cross.ensurePlayerWarState(city.owner);
      const bombardment = resolveUnitCityBombardment(deps.session.getState(), {
        attackerUnitId: initialAttacker.id,
        cityId: city.id,
        source: 'player',
      });
      if (!bombardment.ok) {
        deps.showNotification('That city cannot be bombarded by this unit.', 'warning');
        return;
      }
      deps.session.commit(bombardment.state);
      if (bombardment.cityEvent) deps.bus.emit('city:bombarded', bombardment.cityEvent);
      if (bombardment.batteryEvent) deps.bus.emit('city:coastal-battery-fired', bombardment.batteryEvent);
      deps.selectionController.refreshSelectedUnitAfterCombat();
      deps.selectionController.selectNextUnit();
      return;
    }

    if (legality.targetType !== 'unit') {
      deps.showNotification('That target is no longer attackable.', 'warning');
      return;
    }

    const defenderId = legality.targetUnitId;
    const defender = deps.session.getState().units[defenderId];
    if (!defender) return;

    let attacker = initialAttacker;
    if (amphibiousAssault) {
      const detached = detachCargoForEmbarkedAssault(deps.session.getState(), attackerId);
      if (!detached.ok) {
        deps.showNotification('That coastal assault is no longer possible.', 'warning');
        return;
      }
      deps.session.commit(detached.state);
      attacker = detached.attacker;
    }

    cross.ensurePlayerWarState(defender.owner);

    const seed = deterministicCombatSeed(deps.session.getState().gameId, deps.session.getState().turn, attacker.id, defender.id);
    const attackerBonus = getCurrentCivDef(deps.session)?.bonusEffect;
    const result = resolveCombat(
      attacker,
      deps.session.getState().units[defenderId] ?? defender,
      deps.session.getState().map,
      seed,
      buildCombatContextForDefender(deps.session.getState(), attacker, defender, { amphibiousAssault }),
      resolveCombatEra(deps.session.getState(), attacker, defender),
      deps.session.getState(),
    );
    deps.bus.emit('combat:resolved', {
      result,
      ...buildCombatPresentation(deps.session.getState(), result, attacker, defender),
    });

    // Every state write of the fight, its consequences and any city assault it triggers is one
    // publication (#1015): renderLoop.setGameState recomputes several presentations, and the
    // UI that follows (selection refresh, animation) must see the published final state.
    const assault = deps.session.batch((): { assaultStatus: 'pending' | 'resolved' } | null => {
      const applied = applyCombatOutcomeToState(deps.session.getState(), result, seed, deps.bus);
      deps.session.commit(applied.state);
      emitMinorCivQuestTransitions(deps.bus, applied.questTransitions, deps.session.getState());

      if (applied.attackerDefeated) {
        deps.showNotification('Our unit was destroyed!', 'warning');
      } else if (applied.attackerCaptured) {
        deps.showNotification(`Our ${getCaptureNotificationLabel(attacker.type)}`, 'warning');
      }

      for (const reward of applied.rewards) {
        deps.bus.emit('combat:reward-earned', { reward });
      }

      if (applied.defenderDefeated) {
        deps.showNotification('Enemy unit destroyed!', 'success');

        // The slay itself (lair, hoard, victor heal, `beast:slain`) already happened inside
        // applyCombatOutcomeToState for whichever executor made the kill (#1014).
        // Tier 3+ beasts use the slay ceremony (beast:slain listener); ceremony calls
        // maybeShowPendingHoardChoice via onContinue so the choice panel appears after
        // the ceremony is dismissed rather than racing with it.
        const slain = applied.beastsSlain[0];
        if (!slain || BEAST_DEFINITIONS[slain.beastId].tier < 3) {
          deps.maybeShowPendingHoardChoice();
        }

        // The camp itself (reward, quests, event) was destroyed inside applyCombatOutcomeToState (#1200);
        // this is only its player-facing presentation.
        if (applied.campDestroyed) {
          deps.showNotification(`Barbarian camp destroyed! +${applied.campDestroyed.reward} gold`, 'success');
          deps.advisorSystem.resetMessage('treasurer_camp_reward');
          deps.advisorSystem.check(deps.session.getState());
          for (const mcId of Object.keys(deps.session.getState().minorCivs)) {
            applyDiplomaticReaction(deps.session.getState(), 'camp_destroyed_nearby', deps.session.getState().currentPlayer, mcId);
          }
        }

        const cityAtTarget = Object.values(deps.session.getState().cities).find(c => hexKey(c.position) === targetKey);
        if (cityAtTarget) {
          const occupancy = buildUnitOccupancy(deps.session.getState().units);
          const remainingHostileDefenders = hasHostileUnitAtCoord(occupancy, cityAtTarget.position, deps.session.getState().currentPlayer);
          if (!remainingHostileDefenders) {
            if (cityAtTarget.owner.startsWith('mc-')) {
              const conqueredCityName = cityAtTarget.name;
              const beforeConquest = deps.session.getState();
              const conquered = conquestMinorCiv(beforeConquest, cityAtTarget.owner, beforeConquest.currentPlayer);
              deps.session.commit(conquered.state);
              emitMinorCivLeagueNotices(beforeConquest, conquered.state, deps.bus);
              emitMinorCivQuestTransitions(deps.bus, conquered.transitions, deps.session.getState());
              if (conquered.conquered) {
                deps.bus.emit('minor-civ:destroyed', { minorCivId: cityAtTarget.owner, conquerorId: deps.session.getState().currentPlayer });
              }
              deps.showNotification(`${conqueredCityName} has been conquered!`, 'success');
            }
            if (!cityAtTarget.owner.startsWith('mc-') && cityAtTarget.owner !== deps.session.getState().currentPlayer) {
              const assaultStatus = beginPlayerCityAssault(
                attackerId,
                cityAtTarget.id,
                attackerBonus,
                result,
                amphibiousAssault,
              );
              return { assaultStatus };
            }
          }
        }
      } else if (applied.defenderCaptured) {
        deps.showNotification(getCaptureNotificationLabel(defender.type), 'success');
      }
      return null;
    });

    SFX.combat();
    deps.selectionController.refreshSelectedUnitAfterCombat();
    if (assault) {
      if (assault.assaultStatus === 'resolved') {
        setTimeout(() => deps.selectionController.selectNextUnit(), 400);
      }
      return;
    }

    // `attacker` was captured before applyCombatOutcomeToState — safe even if attacker was destroyed
    deps.renderLoop.animations.add('combat-flash', 400, { coord: attacker.position }, () => deps.selectionController.selectNextUnit());
  }

  return { executeMinorCivConquest, bombardCity, holdSiege, beginPlayerCityAssault, beginPlayerCampAssault, executeAttack };
}
