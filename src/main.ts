import { EventBus } from '@/core/event-bus';
import { RenderLoop } from '@/renderer/render-loop';
import { hexKey, parseHexKey } from '@/systems/hex-utils';
import { moveUnit, getMovementCost } from '@/systems/unit-system';
import { foundCityInState } from '@/systems/city-founding-system';
import { formatCityFoundingBlockerMessage, getCityFoundingBlockers } from '@/systems/city-territory-system';
import { createCityCapturePanel } from '@/ui/city-capture-panel';
import { deterministicCombatSeed, resolveCombat } from '@/systems/combat-system';
import { buildCombatContextForDefender, getAmphibiousAssaultMultiplier } from '@/systems/combat-context';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { applyCombatOutcomeToState, getCaptureNotificationLabel } from '@/systems/combat-reward-system';
import { recordCombatForCiv } from '@/systems/threat-pressure-system';
import { resolveCombatEra } from '@/systems/era-resolution';
import { applyCampDestructionAtTarget } from '@/systems/barbarian-system';
import { recordBeastSlain, applyHoardChoice, getHoardChoicePreview, canUnitAttackBeast } from '@/systems/beast-system';
import { createBeastHoardPanel } from '@/ui/beast-hoard-panel';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { loadSettings } from '@/storage/save-manager';
import { AudioSystem } from '@/audio/audio-system';
import { SFX } from '@/audio/sfx';
import { AdvisorSystem } from '@/ui/advisor-system';
import { makePeace } from '@/systems/diplomacy-system';
import { visitVillage } from '@/systems/village-system';
import { clearStaleSoloPendingEvents } from '@/core/hotseat-events';
import { refreshKnownCivilizations, syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { getMinorCivNotification } from '@/ui/minor-civ-notifications';
import { registerMinorCivNotificationListeners } from '@/ui/minor-civ-notification-listeners';
import { conquestMinorCiv, applyDiplomaticReaction } from '@/systems/minor-civ-system';
import { buildUnitOccupancy, hasHostileUnitAtCoord } from '@/systems/unit-occupancy';
import { beginPlayerCityAssaultChoice, shouldPromptForPlayerCityCapture } from '@/input/city-assault-flow';
import { canUnitOccupyCity } from '@/systems/city-capture-system';
import { buildCombatPresentation } from '@/systems/viewer-event-presentation';
import { isSpyUnitType } from '@/systems/espionage-system';
import { applyUnitUpgradeToState } from '@/systems/unit-upgrade-system';
import { executeUnitMove, isWorkerBusy } from '@/systems/unit-movement-system';
import { getEmbarkedAssaultTarget, detachCargoForEmbarkedAssault } from '@/systems/transport-system';
import { createSelectionStore } from '@/app/selection-store';
import type { CombatResult, GameState, HexCoord, UnitType, CivBonusEffect } from '@/core/types';
import type { NotificationCityAction, NotificationEntry } from '@/core/notification-log';
import { createUserSettingsStore } from '@/app/user-settings-store';
import type { Notifier } from '@/app/ports';
import { updateAndRefreshVisibility, reconstructLastSeenFromMap } from '@/systems/last-seen-presentation';
import { bootstrap, createAppComposition, type AppComposition } from '@/app/bootstrap';
import { registerAllPresentation } from '@/presentation/register-all';
import { removeRouteForUnit, createMarketplaceState } from '@/systems/trade-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import type { GameSession } from '@/app/ports';
import { createGameSession } from '@/app/game-session';
import { installGlobalShortcuts } from '@/app/global-shortcuts';
import { getCurrentCivDef, notifyPlayer } from '@/app/cross-cutting-helpers';

// --- App State ---
/**
 * The single owner of game state (#787 phase 2).
 *
 * Constructed unset: `enterCampaign` commits the first real state, exactly
 * where `let gameState: GameState` used to receive its first assignment. The
 * cast reproduces that binding's pre-assignment `undefined` so the existing
 * `if (session.getState())` guards keep their current meaning.
 */
const session: GameSession = createGameSession(undefined as unknown as GameState);
/**
 * Owns the selected unit, its highlight ranges, the pirate-panel focus, and the
 * pending-map-intent union that replaced four independent nullable flags.
 */
const selection = createSelectionStore();
/** Owns persisted A/V settings + master volume, moved out of module scope (#787 phase 4). */
const userSettingsStore = createUserSettingsStore({ load: loadSettings });
/**
 * The single source of player-facing notifications (#787 phase 4).
 *
 * Constructed in `GameSessionController.init()`, once `createUI()` has
 * created the `#notifications` element `NotificationCenterDeps.layer`
 * needs, then published back here via `setNotifier` (#787 phase 10),
 * threaded through `createAppComposition`'s `setNotifier` dep (#787 phase
 * 10b-g, since `GameSessionController` now lives in `bootstrap.ts`). Every
 * function below that reads `notifier` is only ever invoked during real
 * gameplay, well after `init()` completes -- the same deferred-but-eager
 * pattern `session` and `selection` already use for their own module-scope
 * bindings.
 */
let notifier: Notifier;

const bus = new EventBus();
const audioCtx = new AudioContext();
const audio = new AudioSystem(audioCtx);
const roundPresentationGate = new RoundPresentationGate();
const advisorSystem = new AdvisorSystem(bus);

// --- Canvas Setup ---
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiLayer = document.getElementById('ui-layer') as HTMLDivElement;
const renderLoop = new RenderLoop(canvas);

// --- Notifications ---
// The toast queue, the choice modal, and the delivery contract below all live
// in notifier (created in init(), see src/ui/notification-center.ts) (#787
// phase 4). `notifier.toast` is the pure DOM enqueue (no log side effect) --
// exactly today's enqueueToast, which is why the extracted `focusNotificationTarget`/
// `focusPirateTarget` helpers (#787 phase 10b-f, src/app/cross-cutting-helpers.ts)
// call it directly instead of going through `showNotification` below.

// Thin wrapper (not extracted, see cross-cutting-helpers.ts's module docblock
// for why): delegates to the pure `notifyPlayer`, but stays a hoisted
// `main.ts` function so its controller consumers' `showNotification` dep
// keeps working as a bare reference, unchanged by this phase.
function showNotification(
  message: string,
  type: NotificationEntry['type'] = 'info',
  target?: NotificationEntry['target'],
): void {
  notifyPlayer(notifier, session, message, type, target);
}

function maybeShowPendingHoardChoice(): void {
  const pending = (session.getState().beasts?.pendingHoardChoices ?? [])
    .find(p => p.civId === session.getState().currentPlayer);
  if (!pending) return;
  const preview = getHoardChoicePreview(session.getState(), pending.lairId);
  const lair = session.getState().beasts!.lairs[pending.lairId];
  createBeastHoardPanel(uiLayer, preview, choice => {
    session.setStateWithoutRefresh(applyHoardChoice(session.getState(), pending.lairId, pending.civId, choice));
    bus.emit('beast:hoard-claimed', { lairId: pending.lairId, beastId: lair.beastId, civId: pending.civId, choice });
    composition.hud.update();
    maybeShowPendingHoardChoice();
  });
}

function executeMinorCivConquest(unitId: string, target: HexCoord, minorCivId: string, cityId: string): void {
  const cityName = session.getState().cities[cityId]?.name ?? 'City-State';
  const movement = composition.selectionController.executeAnimatedUnitMove(unitId, () => executeUnitMove(session.getState(), unitId, target, {
    actor: 'player',
    civId: session.getState().currentPlayer,
    bus,
    foreignCityEntryId: cityId,
  }));
  if (!movement.ok) return;
  const movedUnit = session.getState().units[unitId];
  if (movedUnit) session.getState().units[unitId] = { ...movedUnit, movementPointsLeft: 0 };
  const conquered = conquestMinorCiv(session.getState(), minorCivId, session.getState().currentPlayer);
  session.setStateWithoutRefresh(conquered.state);
  emitMinorCivQuestTransitions(bus, conquered.transitions, session.getState());
  if (conquered.conquered) bus.emit('minor-civ:destroyed', { minorCivId, conquerorId: session.getState().currentPlayer });
  showNotification(`${cityName} has been conquered!`, 'success');
  SFX.tap();
  renderLoop.setGameState(session.getState());
  composition.hud.update();
}

function executeUpgrade(
  unitId: string,
  targetType: import('@/core/types').UnitType,
): boolean {
  const result = applyUnitUpgradeToState(session.getState(), unitId, targetType);
  if (!result.upgraded) return false;
  session.commit(result.state);
  return true;
}

function foundCityAction(): void {
  const selectedUnitId = selection.getSelectedUnitId();
  if (!selectedUnitId) return;
  const unit = session.getState().units[selectedUnitId];
  if (!unit || unit.type !== 'settler') return;

  const blockers = getCityFoundingBlockers(session.getState(), unit.position);
  if (blockers.length > 0) {
    showNotification(formatCityFoundingBlockerMessage(blockers), 'warning');
    return;
  }

  let result;
  try {
    result = foundCityInState(session.getState(), selectedUnitId, bus);
  } catch (error) {
    showNotification(
      error instanceof Error ? error.message : 'City cannot be founded here.',
      'warning',
    );
    return;
  }
  session.setStateWithoutRefresh(result.state);

  composition.selectionController.deselectUnit();
  const foundedCity = session.getState().cities[result.cityId];
  showNotification(`${foundedCity.name} has been founded!`, 'success');
  SFX.foundCity();

  // Update visibility
  updateAndRefreshVisibility(session.getState(), session.getState().currentPlayer);
  for (const contact of syncCivilizationContactsFromVisibility(session.getState(), session.getState().currentPlayer)) {
    bus.emit('civilization:first-contact', contact);
  }

  renderLoop.setGameState(session.getState());
  composition.hud.update();
}

function beginPlayerCityAssault(
  attackerId: string,
  cityId: string,
  attackerBonus?: CivBonusEffect,
  precedingCombat?: CombatResult,
  embarkedAssault = false,
): 'pending' | 'resolved' {
  const city = session.getState().cities[cityId];
  if (!city) return 'resolved';
  const attacker = session.getState().units[attackerId];
  if (!attacker || !canUnitOccupyCity(attacker)) return 'resolved';

  composition.playerActions.ensurePlayerWarState(city.owner);
  let attackerMultiplier: number | undefined;
  if (embarkedAssault) {
    const legality = getEmbarkedAssaultTarget(session.getState(), attackerId, city.position, { viewerId: session.getState().currentPlayer });
    if (!legality.ok || legality.targetType !== 'city') {
      showNotification('That coastal assault is no longer possible.', 'warning');
      return 'resolved';
    }
    attackerMultiplier = getAmphibiousAssaultMultiplier(session.getState(), attacker, city.position);
    const detached = detachCargoForEmbarkedAssault(session.getState(), attackerId);
    if (!detached.ok) return 'resolved';
    session.setStateWithoutRefresh(detached.state);
  }
  const begun = beginPlayerCityAssaultChoice(
    session.getState(),
    attackerId,
    cityId,
    bus,
    precedingCombat,
    attackerMultiplier,
  );
  session.setStateWithoutRefresh(begun.state);

  if (!begun.ok) {
    showNotification(
      begun.reason === 'repelled-by-city-defense'
        ? "Your attack was repelled by the city's defenses!"
        : 'The attack could not proceed.',
      'warning',
    );
    renderLoop.setGameState(session.getState());
    composition.hud.update();
    return 'resolved';
  }

  selection.setPendingIntent({ kind: 'city-capture', choice: begun.pending });
  if (!shouldPromptForPlayerCityCapture(city)) {
    composition.turnFlow.finalizePendingCityCaptureChoice('raze', attackerBonus);
    return 'resolved';
  }

  createCityCapturePanel(uiLayer, {
    cityName: city.name,
    occupiedPopulation: begun.pending.occupiedPopulation,
    razeGold: begun.pending.razeGold,
    onOccupy: () => composition.turnFlow.finalizePendingCityCaptureChoice('occupy', attackerBonus),
    onRaze: () => composition.turnFlow.finalizePendingCityCaptureChoice('raze', attackerBonus),
  });
  return 'pending';
}

function executeAttack(attackerId: string, targetKey: string): void {
  const initialAttacker = session.getState().units[attackerId];
  const targetCoord = parseHexKey(targetKey);
  const amphibiousAssault = Boolean(initialAttacker?.transportId);
  const legality = amphibiousAssault
    ? getEmbarkedAssaultTarget(session.getState(), attackerId, targetCoord, { viewerId: session.getState().currentPlayer })
    : canUnitAttackTarget(session.getState(), initialAttacker, targetCoord, { viewerId: session.getState().currentPlayer });
  // hasActed guard: enforce "no action remaining" at the execution layer, not just
  // the highlight layer (getAttackTargets). Prevents double-action if executeAttack
  // is ever called outside the normal tap → highlight → confirm flow.
  if (!initialAttacker || initialAttacker.hasActed || !legality.ok || legality.targetType !== 'unit') {
    showNotification('That target is no longer attackable.', 'warning');
    const currentlySelected = selection.getSelectedUnitId();
    if (currentlySelected) composition.selectionController.selectUnit(currentlySelected);
    return;
  }

  const defenderId = legality.targetUnitId;
  const defender = session.getState().units[defenderId];
  if (!defender) return;

  let attacker = initialAttacker;
  if (amphibiousAssault) {
    const detached = detachCargoForEmbarkedAssault(session.getState(), attackerId);
    if (!detached.ok) {
      showNotification('That coastal assault is no longer possible.', 'warning');
      return;
    }
    session.setStateWithoutRefresh(detached.state);
    attacker = detached.attacker;
  }

  composition.playerActions.ensurePlayerWarState(defender.owner);

  const seed = deterministicCombatSeed(session.getState().gameId, session.getState().turn, attacker.id, defender.id);
  const attackerBonus = getCurrentCivDef(session)?.bonusEffect;
  // Capture defender position before combat (defender may be removed from state after)
  const defenderPosition = { ...defender.position };
  // Capture route IDs before combat (units may be removed from state after)
  const attackerRouteId = attacker.committedToRouteId;
  const defenderRouteId = defender.committedToRouteId;
  const result = resolveCombat(
    attacker,
    session.getState().units[defenderId] ?? defender,
    session.getState().map,
    seed,
    buildCombatContextForDefender(session.getState(), attacker, defender, { amphibiousAssault }),
    resolveCombatEra(session.getState(), attacker, defender),
    session.getState(),
  );
  bus.emit('combat:resolved', {
    result,
    ...buildCombatPresentation(session.getState(), result, attacker, defender),
  });

  const applied = applyCombatOutcomeToState(session.getState(), result, seed);
  session.setStateWithoutRefresh(applied.state);
  session.setStateWithoutRefresh(recordCombatForCiv(session.getState(), session.getState().currentPlayer, defenderPosition));
  emitMinorCivQuestTransitions(bus, applied.questTransitions, session.getState());
  // Clean up trade routes for any committed caravans that died or were captured
  if (applied.attackerDefeated && attackerRouteId) {
    session.setStateWithoutRefresh(removeRouteForUnit(session.getState(), result.attackerId, bus, 'unit-died', attackerRouteId));
  } else if (applied.attackerCaptured && attackerRouteId) {
    session.setStateWithoutRefresh(removeRouteForUnit(session.getState(), result.attackerId, bus, 'unit-captured', attackerRouteId));
  }
  if (applied.defenderDefeated && defenderRouteId) {
    session.setStateWithoutRefresh(removeRouteForUnit(session.getState(), result.defenderId, bus, 'unit-died', defenderRouteId));
  } else if (applied.defenderCaptured && defenderRouteId) {
    session.setStateWithoutRefresh(removeRouteForUnit(session.getState(), result.defenderId, bus, 'unit-captured', defenderRouteId));
  }

  if (applied.attackerDefeated) {
    showNotification('Our unit was destroyed!', 'warning');
  } else if (applied.attackerCaptured) {
    showNotification(`Our ${getCaptureNotificationLabel(attacker.type)}`, 'warning');
  }

  for (const reward of applied.rewards) {
    bus.emit('combat:reward-earned', { reward });
  }

  if (applied.defenderDefeated) {
    showNotification('Enemy unit destroyed!', 'success');

    const slayResult = recordBeastSlain(session.getState(), defender, attacker);
    session.setStateWithoutRefresh(slayResult.state);
    if (slayResult.slain) {
      bus.emit('beast:slain', slayResult.slain);
    }
    // Tier 3+ beasts use the slay ceremony (beast:slain listener); ceremony calls
    // maybeShowPendingHoardChoice via onContinue so the choice panel appears after
    // the ceremony is dismissed rather than racing with it.
    if (!slayResult.slain || BEAST_DEFINITIONS[slayResult.slain.beastId].tier < 3) {
      maybeShowPendingHoardChoice();
    }

    const destroyedCamp = applyCampDestructionAtTarget(session.getState(), session.getState().currentPlayer, defender.position, session.getState().turn);
    if (destroyedCamp.campId) {
      session.setStateWithoutRefresh(destroyedCamp.state);
      emitMinorCivQuestTransitions(bus, destroyedCamp.questTransitions, session.getState());
      showNotification(`Barbarian camp destroyed! +${destroyedCamp.reward} gold`, 'success');
      advisorSystem.resetMessage('treasurer_camp_reward');
      advisorSystem.check(session.getState());
      for (const mcId of Object.keys(session.getState().minorCivs)) {
        applyDiplomaticReaction(session.getState(), 'camp_destroyed_nearby', session.getState().currentPlayer, mcId);
      }
    }

    const cityAtTarget = Object.values(session.getState().cities).find(c => hexKey(c.position) === targetKey);
    if (cityAtTarget) {
      const occupancy = buildUnitOccupancy(session.getState().units);
      const remainingHostileDefenders = hasHostileUnitAtCoord(occupancy, cityAtTarget.position, session.getState().currentPlayer);
      if (!remainingHostileDefenders) {
        if (cityAtTarget.owner.startsWith('mc-')) {
          const conqueredCityName = cityAtTarget.name;
          const conquered = conquestMinorCiv(session.getState(), cityAtTarget.owner, session.getState().currentPlayer);
          session.setStateWithoutRefresh(conquered.state);
          emitMinorCivQuestTransitions(bus, conquered.transitions, session.getState());
          if (conquered.conquered) {
            bus.emit('minor-civ:destroyed', { minorCivId: cityAtTarget.owner, conquerorId: session.getState().currentPlayer });
          }
          showNotification(`${conqueredCityName} has been conquered!`, 'success');
        }
        if (!cityAtTarget.owner.startsWith('mc-') && cityAtTarget.owner !== session.getState().currentPlayer) {
          const assaultStatus = beginPlayerCityAssault(
            attackerId,
            cityAtTarget.id,
            attackerBonus,
            result,
            amphibiousAssault,
          );
          SFX.combat();
          renderLoop.setGameState(session.getState());
          composition.hud.update();
          composition.selectionController.refreshSelectedUnitAfterCombat();
          if (assaultStatus === 'resolved') {
            setTimeout(() => composition.selectionController.selectNextUnit(), 400);
          }
          return;
        }
      }
    }
  } else if (applied.defenderCaptured) {
    showNotification(getCaptureNotificationLabel(defender.type), 'success');
  }

  // `attacker` was captured before applyCombatOutcomeToState — safe even if attacker was destroyed
  SFX.combat();
  renderLoop.setGameState(session.getState());
  composition.hud.update();
  composition.selectionController.refreshSelectedUnitAfterCombat();
  renderLoop.animations.add('combat-flash', 400, { coord: attacker.position }, () => composition.selectionController.selectNextUnit());
}

/**
 * Constructs every controller `main.ts` used to build at module scope --
 * `host`, `ceremonies`, `diplomacyActions`, `panelActions`,
 * `selectionController`, `turnFlow`, `playerActions`, `mapInteraction`,
 * `hud`, `campaignEntry`, `gameSession`, `presentationContext`,
 * `panelRegistry`, and `router` -- moved into `bootstrap.ts` as the
 * composition root (#787 phase 10b-g). The Phase-13-scoped functions above
 * are hoisted `function` declarations, so passing them here bare is safe --
 * they aren't invoked until real gameplay, well after this call returns and
 * `composition` is assigned. The reverse reference (those functions reading
 * `composition.selectionController`/`composition.hud`/etc.) is the same
 * deferred-but-eager pattern, now spanning the `main.ts`/`bootstrap.ts`
 * boundary instead of positions within one file.
 */
const composition: AppComposition = createAppComposition({
  canvas,
  uiLayer,
  renderLoop,
  audio,
  bus,
  roundPresentationGate,
  advisorSystem,
  session,
  selection,
  userSettingsStore,
  getNotifier: () => notifier,
  setNotifier: n => { notifier = n; },
  foundCityAction,
  executeUpgrade,
  executeAttack,
  executeMinorCivConquest,
  beginPlayerCityAssault,
  maybeShowPendingHoardChoice,
  showNotification,
});

// --- Bootstrap ---
// registerAllPresentation/registerMinorCivNotificationListeners used to run
// as bare module-scope statements here, immediately followed by a bare
// init() call. bootstrap() (#787 phase 10) sequences the same three steps
// explicitly instead of as an import side effect -- see src/app/bootstrap.ts,
// which now also constructs session/selection/host/ceremonies/router/
// panelRegistry via createAppComposition above (#787 phase 10b-g finished
// the composition-root move Phase 10's own docblock had deferred).
void bootstrap({
  bus,
  presentationContext: composition.presentationContext,
  getState: () => session.getState(),
  // Thunked, not `notifier.deliver` directly -- `notifier` is not assigned
  // until init() runs, after this module-scope call (#787 phase 10b-f,
  // formerly the separate `appendToCivLog` const, inlined at its one
  // consumer).
  appendToCivLog: (...args) => notifier.deliver(...args),
  gameSession: composition.gameSession,
});
