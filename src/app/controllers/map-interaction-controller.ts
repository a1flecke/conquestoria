/**
 * Owns the two map-input entry points: `handleHexTap` (the switch-based
 * executor over `resolveMapTapIntent`, #787 phase 8b) and `handleHexLongPress`
 * plus its territory-inspection-panel lifecycle (#787 phase 8d).
 *
 * Every case body is the same code that lived inline in `main.ts`, moved
 * verbatim -- this phase relocates the dispatcher, it does not change
 * precedence (that's owned entirely by `resolveMapTapIntent`, #787 phase 8a)
 * or add new behavior.
 *
 * Pure `@/systems`/`@/ui`/`@/input` helpers are imported directly here,
 * matching the precedent set in Phase 7 (`SFX`) and Phase 8c
 * (`buildSelectedUnitHighlights`, etc.). Only concrete platform services
 * (`renderLoop`, `audio`, `bus`) and the main.ts-local functions this phase
 * does not move (`showNotification`, `openCityPanelForCity`,
 * `executeMinorCivConquest`, etc.) are threaded through as
 * `MapInteractionControllerDeps`.
 *
 * `getElementById` substitutes for the eight distinct panel ids this code
 * used to look up via `document.getElementById` directly -- Phase 11's
 * port-purity test bans that call in `src/app/controllers/*`, and one
 * generic getter (matching the native signature exactly) is a much smaller
 * surface than eight single-purpose named getters would be.
 */
import type { EventBus } from '@/core/event-bus';
import type { RenderLoop } from '@/renderer/render-loop';
import type { AudioSystem } from '@/audio/audio-system';
import type { GameState, HexCoord, City, CivBonusEffect, CombatResult, ImprovementType } from '@/core/types';
import type { GameSession, SelectionStore } from '@/app/ports';
import type { SelectionController } from '@/app/controllers/selection-controller';
import type { ExecuteUnitMoveResult } from '@/systems/unit-movement-system';
import { SFX } from '@/audio/sfx';
import { hexKey } from '@/systems/hex-utils';
import { wrapHexCoord } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { UNIT_DESCRIPTIONS } from '@/systems/unit-descriptions';
import { findPath } from '@/systems/unit-pathfinding';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { classifyOwner, isAlwaysHostilePair } from '@/core/owner-kind';
import { resolveMapTapIntent } from '@/input/map-tap-intent';
import { visibleHostileUnitEntriesAtKey } from '@/input/hex-defender-selection';
import { handleSelectedUnitMovementBlocker } from '@/input/selected-unit-movement-feedback';
import { resolveAirStrike, resolveAirStrikeTarget, resolveReconMission, resolvePatrolMission } from '@/systems/air-operations-system';
import { getAirMissionDenial } from '@/systems/air-readiness';
import { executeParadrop, PARADROP_FAILURE_MESSAGES, executeAirAssault, AIR_ASSAULT_FAILURE_MESSAGES } from '@/systems/airborne-system';
import { unloadUnitFromTransport } from '@/systems/transport-system';
import { getMinorCivPresentationForPlayer } from '@/systems/minor-civ-presentation';
import { getAmphibiousAssaultMultiplier } from '@/systems/combat-context';
import { buildBattleForecastView } from '@/ui/battle-forecast-projection';
import { renderBattleForecastCard, type BattleForecastCardInput } from '@/ui/battle-forecast-card';
import { airForecastSignature, buildAirStrikeForecastView } from '@/ui/air-strike-forecast-projection';
import { getBeastDefinitionByUnitType } from '@/systems/beast-definitions';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { getEmbarkedAssaultTarget } from '@/systems/transport-system';
import { calculateCityAssaultStrengths } from '@/systems/city-siege-system';
import { resolveCityInteraction } from '@/systems/city-interaction';
import { renderCityActionPreview } from '@/ui/city-action-preview';
import { createGameButton } from '@/ui/ui-kit';
import { createForeignCityEntryPanel } from '@/ui/foreign-city-entry-panel';
import { createCityCapturePanel } from '@/ui/city-capture-panel';
import { beginConfirmedForeignCityEntry } from '@/input/foreign-city-entry-flow';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { setMinorCivWarState } from '@/systems/minor-civ-actions';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { createWorkerTaskWarningPanel } from '@/ui/worker-task-warning-panel';
import { getImprovementDisplayName } from '@/systems/improvement-system';
import { confirmBusyWorkerMove } from '@/input/worker-movement-flow';
import { resolveNaturalWonderAudioFocus } from '@/input/natural-wonder-audio-focus';
import { createTerritoryInspectionPanel } from '@/ui/territory-inspection-panel';
import { getVisibility } from '@/systems/fog-of-war';
import { getLastStandPreview, issueLastStand } from '@/systems/great-general-abilities';
import { createLastStandPanel } from '@/ui/general-command-panel';
import { getDeniedTerritoryOwners } from '@/systems/territorial-access';

/** The narrow slice of `RenderLoop` this controller needs. */
export type MapInteractionRenderer = Pick<RenderLoop, 'setGameState' | 'animateUnitAppear'> & {
  readonly camera: Pick<RenderLoop['camera'], 'centerOn'>;
};

/** The narrow slice of `AudioSystem` this controller needs. */
export type MapInteractionAudio = Pick<AudioSystem, 'startNaturalWonderMapFocusAmbient' | 'stopNaturalWonderAmbient'>;

export interface MapInteractionControllerDeps {
  readonly session: GameSession;
  readonly selection: SelectionStore;
  readonly selectionController: SelectionController;
  readonly renderLoop: MapInteractionRenderer;
  readonly audio: MapInteractionAudio;
  /** The concrete class -- see file docblock; two downstream calls require it. */
  readonly bus: EventBus;
  readonly uiLayer: HTMLElement;
  /** Substitutes for eight distinct `document.getElementById(...)` calls -- see file docblock. */
  readonly getElementById: (id: string) => HTMLElement | null;
  readonly showNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  readonly updateHUD: () => void;
  readonly clearUnloadState: () => void;
  readonly currentCiv: () => GameState['civilizations'][string];
  readonly openPirateWaters: (focus?: { factionId?: string; historyId?: string }) => void;
  readonly openUnitStackPicker: (coord: HexCoord, unitIds: string[]) => void;
  readonly openCityPanelForCity: (city: City) => void;
  readonly openWonderAtlas: (initialWonderId?: string) => void;
  readonly executeAttack: (attackerId: string, targetKey: string) => void;
  readonly executeMinorCivConquest: (unitId: string, target: HexCoord, minorCivId: string, cityId: string) => void;
  readonly bombardCity: (attackerId: string, cityId: string) => void;
  readonly holdSiege: (attackerId: string, cityId: string) => void;
  readonly beginPlayerCityAssault: (
    attackerId: string,
    cityId: string,
    attackerBonus?: CivBonusEffect,
    precedingCombat?: CombatResult,
    embarkedAssault?: boolean,
  ) => 'pending' | 'resolved';
  readonly beginPlayerCampAssault: (attackerId: string, campId: string) => void;
  readonly finalizePendingCityCaptureChoice: (disposition: 'occupy' | 'raze', attackerBonus?: CivBonusEffect) => void;
}

export interface MapInteractionController {
  handleHexTap(rawCoord: HexCoord): void;
  handleHexLongPress(rawCoord: HexCoord): void;
}

export function createMapInteractionController(deps: MapInteractionControllerDeps): MapInteractionController {
  const { session, selection, selectionController, renderLoop, audio, bus, uiLayer } = deps;

  /** Player-facing name of the owner of a foreign unit/city, masked by what the current viewer has earned. */
  function describeForeignOwner(ownerId: string): string {
    const ownerKind = classifyOwner(ownerId);
    if (ownerKind === 'barbarian') return 'Barbarian';
    if (ownerKind === 'pirate') return 'Pirates';
    if (ownerKind === 'rebel') return 'Rebels';
    if (ownerKind === 'beast') return 'Legendary Beasts';
    if (ownerKind === 'minor') {
      return getMinorCivPresentationForPlayer(session.getState(), session.getState().currentPlayer, ownerId, 'City-State').name;
    }
    return session.getState().civilizations[ownerId]?.name ?? ownerId;
  }

  /**
   * #1213: a player-initiated air strike is previewed before it is flown. The forecast is information, not
   * authorisation: Confirm re-runs the canonical strike against the live state, and if the forecast the player
   * agreed to no longer matches the live one the new forecast is shown instead of executing on stale numbers.
   */
  function showAirStrikeForecast(unitId: string, coord: HexCoord, notice?: string): void {
    const state = session.getState();
    const viewerId = state.currentPlayer;
    const striker = state.units[unitId];
    if (!striker) return;
    const targetOwner = resolveAirStrikeTarget(state, striker, coord);
    const ownerId = targetOwner.city?.owner ?? targetOwner.unit?.owner;
    const forecast = buildAirStrikeForecastView({
      state, viewerId, unitId, target: coord, ownerName: ownerId ? describeForeignOwner(ownerId) : 'Unknown',
    });
    if (!forecast.ok) {
      deps.showNotification(forecast.message, 'warning');
      return; // pending intent stays: the player may pick another target or cancel
    }
    const panel = deps.getElementById('info-panel');
    if (!panel) return;
    panel.style.display = 'block';
    const signature = airForecastSignature(forecast.view);
    let spent = false;
    renderBattleForecastCard(panel, {
      view: forecast.view,
      notes: notice ? [{ text: notice, emphasis: 'warning' }] : [],
      action: { label: 'Strike', title: 'Air Strike Preview' },
    }, {
      onCancel: () => {
        spent = true;
        selection.setPendingIntent({ kind: 'none' });
        selectionController.selectUnit(unitId);
      },
      onAttack: () => {
        if (spent) return; // a rapid second tap must never fly the mission twice
        spent = true;
        const live = session.getState();
        const fresh = buildAirStrikeForecastView({
          state: live, viewerId: live.currentPlayer, unitId, target: coord, ownerName: ownerId ? describeForeignOwner(ownerId) : 'Unknown',
        });
        if (!fresh.ok) {
          deps.showNotification(fresh.message, 'warning');
          selection.setPendingIntent({ kind: 'none' });
          selectionController.selectUnit(unitId);
          return;
        }
        if (airForecastSignature(fresh.view) !== signature) {
          showAirStrikeForecast(unitId, coord, 'Things changed since this preview was shown. Review the updated forecast before striking.');
          return;
        }
        const result = resolveAirStrike(live, unitId, coord, bus);
        selection.setPendingIntent({ kind: 'none' });
        if (!result.ok) {
          deps.showNotification(getAirMissionDenial(live, unitId, 'strike')?.message ?? 'That air mission target is no longer legal.', 'warning');
          selectionController.selectUnit(unitId);
          return;
        }
        session.commit(result.state);
        selectionController.refreshCurrentPlayerVisibility();
        SFX.combat();
        selectionController.selectUnit(unitId);
      },
    });
  }

  function handleHexTap(rawCoord: HexCoord): void {
    const coord = session.getState().map.wrapsHorizontally
      ? wrapHexCoord(rawCoord, session.getState().map.width)
      : rawCoord;
    const key = hexKey(coord);
    const snapshot = selection.snapshot();
    const isAnimationLocked = selectionController.isUnitAnimationLocked(snapshot.selectedUnitId);
    const intent = resolveMapTapIntent(session.getState(), snapshot, coord, isAnimationLocked);

    switch (intent.kind) {
      case 'ignore': {
        return;
      }

      case 'resolve-pending': {
        switch (intent.pending.kind) {
          case 'journey': {
            const journeyUnitId = intent.pending.unitId;
            const unit = session.getState().units[journeyUnitId];
            if (unit) {
              const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
              const completedTechs = session.getState().civilizations[unit.owner]?.techState.completed ?? [];
              const path = findPath(unit.position, coord, session.getState().map, domain, { unit, completedTechs, deniedOwnerIds: getDeniedTerritoryOwners(session.getState(), unit) });
              if (!path || path.length < 2) {
                deps.showNotification('No path to that destination.', 'warning');
              } else {
                session.commit({
                  ...session.getState(),
                  units: {
                    ...session.getState().units,
                    [journeyUnitId]: { ...unit, automation: { mode: 'journey', destination: coord } },
                  },
                });
                selectionController.selectUnit(journeyUnitId);
                deps.showNotification('Journey set. Your unit will advance each turn.', 'info');
              }
            }
            selection.setPendingIntent({ kind: 'none' });
            return;
          }

          case 'air-mission': {
            const pending = intent.pending;
            if (pending.mission === 'strike') {
              showAirStrikeForecast(pending.unitId, coord);
              return;
            }
            const result = pending.mission === 'recon'
              ? resolveReconMission(session.getState(), pending.unitId, coord)
              : resolvePatrolMission(session.getState(), pending.unitId, coord);
            if (!result.ok) {
              deps.showNotification('That air mission target is no longer legal.', 'warning');
              return;
            }
            selection.setPendingIntent({ kind: 'none' });
            session.commit(result.state);
            selectionController.refreshCurrentPlayerVisibility();
            SFX.airRecon();
            selectionController.selectUnit(pending.unitId);
            return;
          }

          case 'paradrop': {
            const pending = intent.pending;
            const result = executeParadrop(session.getState(), pending.unitId, coord, bus);
            if (!result.ok) {
              deps.showNotification(PARADROP_FAILURE_MESSAGES[result.reason], 'warning');
              return;
            }
            // executeParadrop already logged both sides' notifications
            // (dropping civ + any hostile civ that can see the landing
            // tile) via appendNotification -- that's the persistent log,
            // not immediate feedback. A flak/interception outcome is new
            // information beyond "did the tap succeed" (unlike an air
            // strike, where the target visibly takes the hit at the
            // tapped tile) -- the player's own unit just relocated and
            // may now be quietly missing HP, so it needs an explicit toast
            // here rather than relying on the map alone.
            selection.setPendingIntent({ kind: 'none' });
            session.commit(result.state);
            selectionController.refreshCurrentPlayerVisibility();
            const outcomeParts: string[] = [];
            if (result.flak) outcomeParts.push(`${result.flak.damage} flak damage from ${result.flak.providerLabel}`);
            if (result.interception) outcomeParts.push('intercepted');
            const survived = Boolean(result.state.units[pending.unitId]);
            const outcomeSuffix = outcomeParts.length ? ` (${outcomeParts.join(', ')})` : '';
            deps.showNotification(
              survived
                ? `Paratrooper landed${outcomeSuffix}. It cannot act again this turn.`
                : `Paratrooper was destroyed on the drop${outcomeSuffix}.`,
              survived && outcomeParts.length === 0 ? 'info' : 'warning',
            );
            // No dedicated "unit move" SFX exists in this codebase --
            // ordinary movement is silent by convention. transportUnload
            // is the closest existing analog for "a unit newly arrives on
            // a tile"; combat is reused for any HP-loss event (flak,
            // interception, or both).
            if (result.flak || result.interception) SFX.combat();
            else SFX.transportUnload();
            if (survived) selectionController.selectUnit(pending.unitId);
            return;
          }

          case 'air-assault': {
            const pending = intent.pending;
            const result = executeAirAssault(session.getState(), pending.unitId, coord, bus);
            if (!result.ok) {
              deps.showNotification(AIR_ASSAULT_FAILURE_MESSAGES[result.reason], 'warning');
              return;
            }
            // executeAirAssault already logged both sides' notifications
            // via appendNotification, same as executeParadrop above --
            // this toast is the acting player's own immediate feedback.
            selection.setPendingIntent({ kind: 'none' });
            session.commit(result.state);
            selectionController.refreshCurrentPlayerVisibility();
            const outcomeParts: string[] = [];
            if (result.flak) outcomeParts.push(`${result.flak.damage} flak damage from ${result.flak.providerLabel}`);
            if (result.interception) outcomeParts.push('intercepted');
            const survived = Boolean(result.state.units[pending.unitId]);
            const outcomeSuffix = outcomeParts.length ? ` (${outcomeParts.join(', ')})` : '';
            deps.showNotification(
              survived
                ? `Unit was flown in by helicopter${outcomeSuffix}. It cannot act again this turn.`
                : `Unit was destroyed on the air assault${outcomeSuffix}.`,
              survived && outcomeParts.length === 0 ? 'info' : 'warning',
            );
            if (result.flak || result.interception) SFX.combat();
            else SFX.transportUnload();
            if (survived) selectionController.selectUnit(pending.unitId);
            return;
          }

          case 'unload': {
            // Delegate to onUnloadTransport which handles state, animation, and notification
            const panel = deps.getElementById('info-panel');
            if (panel) {
              // Re-invoke via the callback registered in SelectionController's renderSelectedUnitInfo block
              // by triggering the transport system directly here (callbacks are not stored).
              const { transportId, cargoUnitId } = intent.pending;
              const result = unloadUnitFromTransport(session.getState(), transportId, cargoUnitId, coord);
              if (!result.ok) {
                deps.showNotification(result.message, 'warning');
                SFX.error();
              } else {
                const tName = UNIT_DEFINITIONS[session.getState().units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
                const cName = UNIT_DEFINITIONS[session.getState().units[cargoUnitId]?.type ?? 'warrior']?.name ?? 'Unit';
                deps.clearUnloadState();
                session.commit(result.state);
                renderLoop.animateUnitAppear(coord);
                selectionController.selectUnit(transportId);
                deps.showNotification(`${cName} disembarked from ${tName}.`, 'info');
                SFX.transportUnload();
              }
            }
            return;
          }

          case 'last-stand-target': {
            const generalUnitId = intent.pending.unitId;
            const preview = getLastStandPreview(session.getState(), generalUnitId, coord);
            selection.setPendingIntent({ kind: 'none' });
            createLastStandPanel(
              uiLayer,
              preview,
              () => {
                session.commit(issueLastStand(session.getState(), generalUnitId, coord));
                selectionController.selectUnit(generalUnitId);
              },
              () => {},
            );
            return;
          }

          default: {
            const _exhaustive: never = intent.pending;
            throw new Error(`Unhandled pending map intent: ${JSON.stringify(_exhaustive)}`);
          }
        }
      }

      case 'mistap': {
        // Mis-tap: block the tap; first occurrence shows an error notification.
        // #544 MR4: 'last-stand-target' is a second real source of 'mistap'
        // (range-checked, same as 'unload') -- the message must distinguish
        // them or a Last Stand mistap would misleadingly tell the player to
        // "disembark."
        if (selection.shouldWarnOnMistap()) {
          const message = intent.pending.kind === 'last-stand-target'
            ? 'Tap a highlighted hex within command range to hold, or Cancel in the panel.'
            : 'Tap a highlighted hex to disembark, or Cancel in the panel.';
          deps.showNotification(message, 'warning');
          SFX.error();
        }
        return;
      }

      case 'open-pirate-faction': {
        deps.openPirateWaters({ factionId: intent.factionId });
        return;
      }

      case 'open-pirate-region': {
        renderLoop.camera.centerOn(intent.center);
        deps.openPirateWaters({ factionId: intent.factionId });
        return;
      }

      case 'animation-locked': {
        deps.showNotification('Unit is moving.', 'info');
        return;
      }

      case 'open-stack-picker': {
        deps.openUnitStackPicker(intent.coord, [...intent.unitIds]);
        return;
      }

      case 'select-unit': {
        selectionController.selectUnit(intent.unitId);
        return;
      }

      case 'blocked-caravan-committed': {
        deps.showNotification('Caravan is committed to a trade route and cannot move.', 'warning');
        selectionController.selectUnit(intent.unitId);
        return;
      }

      case 'blocked-naval-gate': {
        deps.showNotification(intent.reason, 'warning');
        selectionController.selectUnit(intent.unitId);
        return;
      }

      case 'blocked-movement': {
        // Re-invokes the same helper resolveMapTapIntent used internally to decide
        // this intent -- it recomputes getMovementBlockerReason from the same
        // inputs (a pure, cheap call) and dispatches the notification/SFX/reselect
        // side effects, which resolveMapTapIntent deliberately doesn't do itself.
        handleSelectedUnitMovementBlocker(
          session.getState(),
          intent.unitId,
          coord,
          selection.getWaterRecovery(),
          {
            showNotification: deps.showNotification,
            reselectUnit: unitId => selectionController.selectUnit(unitId, { suppressSelectionSfx: true }),
            playError: SFX.error,
          },
        );
        return;
      }

      case 'enemy-unit-info': {
        const enemyUnit = session.getState().units[intent.unitId];
        if (!enemyUnit) return;
        const def = UNIT_DEFINITIONS[enemyUnit.type];
        const desc = UNIT_DESCRIPTIONS[enemyUnit.type] ?? '';
        const ownerKind = classifyOwner(enemyUnit.owner);
        const isMinorCiv = ownerKind === 'minor';
        let ownerName: string;
        let ownerColor: string;

        if (ownerKind === 'barbarian') {
          ownerName = 'Barbarian';
          ownerColor = '#8b4513';
        } else if (ownerKind === 'pirate') {
          ownerName = 'Pirates';
          ownerColor = '#7f1d1d';
        } else if (ownerKind === 'rebel') {
          ownerName = 'Rebels';
          ownerColor = '#6b3f2a';
        } else if (ownerKind === 'beast') {
          ownerName = 'Legendary Beasts';
          ownerColor = '#7a1f2b';
        } else if (isMinorCiv) {
          const presentation = getMinorCivPresentationForPlayer(session.getState(), session.getState().currentPlayer, enemyUnit.owner, 'City-State');
          ownerName = presentation.name;
          ownerColor = presentation.color;
        } else {
          const civ = session.getState().civilizations[enemyUnit.owner];
          ownerName = civ?.name ?? enemyUnit.owner;
          ownerColor = civ?.color ?? '#888';
        }

        const alwaysHostile = isAlwaysHostilePair(session.getState().currentPlayer, enemyUnit.owner);
        const atWar = ownerKind === 'major' && (deps.currentCiv()?.diplomacy?.atWarWith.includes(enemyUnit.owner) ?? false);
        const relationshipTag = alwaysHostile ? 'Hostile' : atWar ? 'At War' : 'Neutral';
        const relColor = alwaysHostile || atWar ? '#d94a4a' : '#e8c170';

        const panel = deps.getElementById('info-panel');
        if (panel) {
          panel.style.display = 'block';
          panel.innerHTML = '';
          const wrapper = document.createElement('div');
          wrapper.style.cssText = `background:rgba(40,20,20,0.92);border-radius:12px;padding:12px 16px;border-left:4px solid ${ownerColor};`;

          const header = document.createElement('div');
          header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

          const info = document.createElement('div');
          const ownerLine = document.createElement('div');
          ownerLine.style.cssText = `font-size:10px;color:${ownerColor};`;
          const ownerSpan = document.createTextNode(ownerName + ' ');
          const relSpan = document.createElement('span');
          relSpan.style.cssText = `color:${relColor};font-size:9px;`;
          relSpan.textContent = `(${relationshipTag})`;
          ownerLine.appendChild(ownerSpan);
          ownerLine.appendChild(relSpan);

          const unitLine = document.createElement('div');
          const boldName = document.createElement('strong');
          boldName.textContent = def.name;
          unitLine.appendChild(boldName);
          unitLine.appendChild(document.createTextNode(` · HP: ${enemyUnit.health}/100 · Str: ${def.strength}`));

          info.appendChild(ownerLine);
          info.appendChild(unitLine);

          const closeBtn = createGameButton('X', 'close');
          closeBtn.id = 'btn-deselect';
          closeBtn.setAttribute('aria-label', 'Close unit details');

          header.appendChild(info);
          header.appendChild(closeBtn);
          wrapper.appendChild(header);

          const descDiv = document.createElement('div');
          descDiv.style.cssText = 'font-size:10px;opacity:0.6;margin-top:4px;';
          descDiv.textContent = desc;
          wrapper.appendChild(descDiv);

          if (ownerKind === 'pirate') {
            const pirateWaters = createGameButton('Open Pirate Waters', 'secondary');
            pirateWaters.dataset.action = 'open-pirate-waters';
            pirateWaters.addEventListener('click', () => deps.openPirateWaters({ factionId: enemyUnit.owner }));
            wrapper.appendChild(pirateWaters);
          }

          const hostileStackSize = visibleHostileUnitEntriesAtKey(session.getState(), key).length;
          if (hostileStackSize > 1) {
            const stackDiv = document.createElement('div');
            stackDiv.style.cssText = 'font-size:10px;opacity:0.72;margin-top:4px;';
            stackDiv.textContent = `${def.name} defends this stack. ${hostileStackSize} enemy units present.`;
            wrapper.appendChild(stackDiv);
          }

          panel.appendChild(wrapper);
          closeBtn.addEventListener('click', selectionController.deselectUnit);
        }
        return;
      }

      case 'combat-preview': {
        const unit = session.getState().units[intent.attackerId];
        const defender = session.getState().units[intent.defenderId];
        if (!unit || !defender) return;
        const amphibiousAssault = Boolean(unit.transportId);
        const previewAttacker = amphibiousAssault
          ? { ...unit, position: { ...session.getState().units[unit.transportId!].position }, transportId: undefined }
          : unit;
        const defDef = UNIT_DEFINITIONS[defender.type];

        const ownerName = describeForeignOwner(defender.owner);

        const viewerId = session.getState().currentPlayer;
        const view = buildBattleForecastView({
          state: session.getState(),
          viewerId,
          attacker: previewAttacker,
          defender,
          ownerName,
          options: { amphibiousAssault },
        });

        const panel = deps.getElementById('info-panel');
        if (panel) {
          panel.style.display = 'block';
          const notes: BattleForecastCardInput['notes'] = [];
          const defenderBeastDef = getBeastDefinitionByUnitType(defender.type);
          if (defenderBeastDef?.regenPerTurn) {
            notes.push({ text: `⚠ Regenerates ${defenderBeastDef.regenPerTurn} HP every turn`, emphasis: 'warning' });
          }
          if (defenderBeastDef?.navalOnly) {
            notes.push({ text: '⚠ Only ships and ranged units can fight it', emphasis: 'warning' });
          }
          const hostileStackSize = visibleHostileUnitEntriesAtKey(session.getState(), key).length;
          if (hostileStackSize > 1) {
            notes.push({ text: `${defDef.name} defends this stack. ${hostileStackSize} enemy units present.`, emphasis: 'info' });
          }
          renderBattleForecastCard(panel, { view, notes }, {
            onCancel: selectionController.deselectUnit,
            onAttack: () => {
              // Read live: the player may have changed selection between the
              // preview rendering and this confirmation.
              const attackerId = selection.getSelectedUnitId();
              const attacker = attackerId ? session.getState().units[attackerId] : undefined;
              const legality = attacker?.transportId
                ? getEmbarkedAssaultTarget(session.getState(), attacker.id, coord, { viewerId: session.getState().currentPlayer })
                : canUnitAttackTarget(session.getState(), attacker, coord, { viewerId: session.getState().currentPlayer });
              if (!legality.ok || legality.targetType !== 'unit') {
                deps.showNotification('That target is no longer attackable.', 'warning');
                if (attackerId) selectionController.selectUnit(attackerId);
                return;
              }
              deps.executeAttack(attackerId!, key);
            },
          });
        }
        return; // Wait for button press
      }

      case 'assault-preview': {
        const attackerUnit = session.getState().units[intent.attackerId];
        const targetCity = session.getState().cities[intent.cityId];
        if (!attackerUnit || !targetCity) return;

        const attackerMultiplier = intent.embarkedAssault
          ? getAmphibiousAssaultMultiplier(session.getState(), attackerUnit, targetCity.position)
          : undefined;
        const effectiveAttacker = intent.embarkedAssault && attackerUnit.transportId
          ? { ...attackerUnit, position: { ...session.getState().units[attackerUnit.transportId].position }, transportId: undefined }
          : attackerUnit;

        // #966: the preview's numbers, labels and denial copy all come from the single
        // city-action resolver, so what the player is shown can never drift from what the
        // executor will accept.
        const interaction = resolveCityInteraction(
          session.getState(),
          effectiveAttacker,
          targetCity,
          { attackerMultiplier },
        );
        // Single source for the attacker's own strength too -- the resolver already ran
        // calculateCityAssaultStrengths, so recomputing it here would be a second source
        // that could drift from the odds shown beside it.
        const captureAction = interaction.available.find(
          (action): action is Extract<typeof action, { kind: 'capture' }> => action.kind === 'capture',
        );

        const panel = deps.getElementById('info-panel');
        if (panel) {
          panel.style.display = 'block';
          renderCityActionPreview(panel, {
            attackerName: UNIT_DEFINITIONS[attackerUnit.type].name,
            attackerStrength: captureAction?.attackerStrength ?? 0,
            cityName: targetCity.name,
            cityHp: targetCity.hp ?? 100,
            interaction,
            infoText: intent.embarkedAssault
              ? 'Landing -50%. Marine training and adjacent shore bombardment are included.'
              : 'A walled city fights back if it has no garrison.',
          }, {
            onCancel: selectionController.deselectUnit,
            onBombard: () => {
              deps.bombardCity(selection.getSelectedUnitId()!, intent.cityId);
            },
            onHoldSiege: () => {
              deps.holdSiege(selection.getSelectedUnitId()!, intent.cityId);
            },
            onAttackDefender: () => {
              deps.executeAttack(selection.getSelectedUnitId()!, hexKey(targetCity.position));
            },
            onCapture: () => {
              // Read live, as the module binding this replaced did.
              const assaultStatus = deps.beginPlayerCityAssault(selection.getSelectedUnitId()!, intent.cityId, undefined, undefined, intent.embarkedAssault);
              SFX.combat();
              if (assaultStatus === 'resolved') {
                setTimeout(() => selectionController.selectNextUnit(), 400);
              }
            },
          });
        }
        return;
      }

      case 'assault-camp-preview': {
        const attackerUnit = session.getState().units[intent.attackerId];
        const camp = session.getState().barbarianCamps[intent.campId];
        if (!attackerUnit || !camp) return;

        const panel = deps.getElementById('info-panel');
        if (panel) {
          panel.style.display = 'block';
          const previewDiv = document.createElement('div');
          previewDiv.style.cssText = 'background:rgba(100,0,0,0.9);border-radius:12px;padding:12px 16px;';

          const title = document.createElement('div');
          title.style.cssText = 'font-size:13px;color:#e8c170;margin-bottom:6px;';
          title.textContent = camp.banditLordName ? `Assault ${camp.banditLordName}'s Camp` : 'Assault Barbarian Camp';
          previewDiv.appendChild(title);

          const info = document.createElement('div');
          info.style.cssText = 'font-size:11px;opacity:0.8;margin-bottom:8px;';
          info.textContent = `${UNIT_DEFINITIONS[attackerUnit.type].name} destroys the camp for +${15 + camp.strength * 2} gold. No garrison to fight.`;
          previewDiv.appendChild(info);

          const btnRow = document.createElement('div');
          btnRow.style.cssText = 'display:flex;gap:8px;';
          const attackBtn = document.createElement('button');
          attackBtn.id = 'btn-assault-camp-confirm';
          attackBtn.textContent = 'Attack';
          attackBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:#d94a4a;border:none;color:white;font-weight:bold;cursor:pointer;';
          const cancelBtn = document.createElement('button');
          cancelBtn.id = 'btn-cancel-assault-camp';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:rgba(255,255,255,0.15);border:none;color:white;cursor:pointer;';
          btnRow.appendChild(attackBtn);
          btnRow.appendChild(cancelBtn);
          previewDiv.appendChild(btnRow);

          panel.innerHTML = '';
          panel.appendChild(previewDiv);

          cancelBtn.addEventListener('click', selectionController.deselectUnit);
          attackBtn.addEventListener('click', () => {
            // Read live, as the assault-preview branch above does.
            deps.beginPlayerCampAssault(selection.getSelectedUnitId()!, intent.campId);
            setTimeout(() => selectionController.selectNextUnit(), 400);
          });
        }
        return;
      }

      case 'confirm-war-city': {
        const selectedId = intent.attackerId;
        const city = session.getState().cities[intent.cityId];
        const defender = session.getState().civilizations[intent.defenderId];
        createForeignCityEntryPanel(uiLayer, {
          cityName: city?.name ?? 'this city',
          defenderName: defender?.name ?? intent.defenderId,
          onConfirm: () => {
            const begun = beginConfirmedForeignCityEntry(session.getState(), selectedId, intent.cityId, bus);
            session.commit(begun.state);
            if (!begun.ok) {
              deps.showNotification(
                begun.reason === 'repelled-by-city-defense'
                  ? "Your attack was repelled by the city's defenses!"
                  : 'The attack could not proceed.',
                'warning',
              );
              return;
            }
            selection.setPendingIntent({ kind: 'city-capture', choice: begun.pending });
            const captureCity = session.getState().cities[intent.cityId];
            if (captureCity) {
              createCityCapturePanel(uiLayer, {
                cityName: captureCity.name,
                occupiedPopulation: begun.pending.occupiedPopulation,
                razeGold: begun.pending.razeGold,
                onOccupy: () => deps.finalizePendingCityCaptureChoice('occupy'),
                onRaze: () => deps.finalizePendingCityCaptureChoice('raze'),
              });
            }
            SFX.tap();
          },
          onCancel: () => selectionController.selectUnit(selectedId),
        });
        return;
      }

      case 'confirm-war-minor-civ': {
        const selectedId = intent.attackerId;
        const city = session.getState().cities[intent.cityId];
        const minor = session.getState().minorCivs[intent.minorCivId];
        const definition = MINOR_CIV_DEFINITIONS.find(candidate => candidate.id === minor?.definitionId);
        createForeignCityEntryPanel(uiLayer, {
          cityName: city?.name ?? 'this city-state',
          defenderName: definition?.name ?? 'the city-state',
          onConfirm: () => {
            const war = setMinorCivWarState(session.getState(), session.getState().currentPlayer, intent.minorCivId, true, bus);
            if (!war.ok) return;
            // Publishes immediately: a declared war changes how a foreign stack picks its
            // lead sprite on the canvas (unit-map-presentation's chooseLead reads
            // atWarWith), and executeMinorCivConquest below can return early with no
            // refresh of its own (#787 phase 14, #1015).
            session.commit(war.state);
            emitMinorCivQuestTransitions(bus, war.transitions, session.getState());
            deps.executeMinorCivConquest(selectedId, coord, intent.minorCivId, intent.cityId);
          },
          onCancel: () => selectionController.selectUnit(selectedId),
        });
        return;
      }

      case 'assault-minor-civ': {
        const mc = session.getState().minorCivs[intent.minorCivId];
        if (mc && !mc.isDestroyed) {
          deps.executeMinorCivConquest(intent.attackerId, intent.coord, intent.minorCivId, intent.cityId);
        } else {
          SFX.tap();
          setTimeout(() => selectionController.selectNextUnit(), 400);
        }
        return;
      }

      case 'worker-busy': {
        const selectedId = intent.unitId;
        const task = session.getState().units[selectedId]?.workerTask;
        const taskTile = task ? session.getState().map.tiles[hexKey(task.coord)] : undefined;
        const isRoadTask = task?.action === 'build_road';
        createWorkerTaskWarningPanel(uiLayer, {
          improvementName: task
            ? (isRoadTask ? 'Road' : getImprovementDisplayName(task.action as ImprovementType))
            : 'Improvement',
          turnsLeft: (isRoadTask ? taskTile?.roadTurnsLeft : taskTile?.improvementTurnsLeft) ?? 1,
          onCancel: () => selectionController.selectUnit(selectedId),
          onConfirm: () => {
            selectionController.executeAnimatedUnitMove(selectedId, () => {
              const moveResult = confirmBusyWorkerMove(session.getState(), selectedId, intent.coord, {
                actor: 'player',
                civId: session.getState().currentPlayer,
                bus,
              });
              if (moveResult.ok) session.commit(moveResult.state);
              return moveResult;
            });
            SFX.tap();
          },
        });
        return;
      }

      case 'move': {
        selectionController.executeAnimatedUnitMove(intent.unitId, () => {
          const moveResult = executeUnitMove(session.getState(), intent.unitId, intent.coord, {
            actor: 'player',
            civId: session.getState().currentPlayer,
            bus,
          });
          if (moveResult.ok) session.commit(moveResult.state);
          return moveResult;
        });
        SFX.tap();
        return;
      }

      case 'open-city': {
        const cityAtHex = session.getState().cities[intent.cityId];
        if (!cityAtHex) return;
        deps.getElementById('tech-panel')?.remove();
        deps.getElementById('city-panel')?.remove();
        deps.getElementById('espionage-panel')?.remove();
        deps.getElementById('diplomacy-panel')?.remove();
        deps.getElementById('marketplace-panel')?.remove();
        deps.getElementById('council-panel')?.remove();
        selectionController.deselectUnit();
        deps.openCityPanelForCity(cityAtHex);
        return;
      }

      case 'open-wonder-atlas': {
        selectionController.deselectUnit();
        const audioFocus = resolveNaturalWonderAudioFocus(session.getState(), session.getState().currentPlayer, intent.coord);
        if (audioFocus) void audio.startNaturalWonderMapFocusAmbient(audioFocus.wonderId);
        deps.openWonderAtlas(intent.wonderId);
        SFX.tap();
        return;
      }

      case 'deselect': {
        selectionController.deselectUnit();
        SFX.tap();
        return;
      }

      default: {
        const _exhaustive: never = intent;
        throw new Error(`Unhandled map tap intent: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  function openTerritoryInspectionPanel(coord: HexCoord): void {
    deps.getElementById('territory-inspection-panel')?.remove();
    const audioFocus = resolveNaturalWonderAudioFocus(session.getState(), session.getState().currentPlayer, coord);
    if (audioFocus) void audio.startNaturalWonderMapFocusAmbient(audioFocus.wonderId);
    const panel = createTerritoryInspectionPanel(session.getState(), coord, session.getState().currentPlayer, () => {
      audio.stopNaturalWonderAmbient('panel-closed');
      deps.getElementById('territory-inspection-panel')?.remove();
    });
    uiLayer.appendChild(panel);
  }

  function closeTerritoryInspectionPanel(): void {
    audio.stopNaturalWonderAmbient('panel-closed');
    deps.getElementById('territory-inspection-panel')?.remove();
  }

  function handleHexLongPress(rawCoord: HexCoord): void {
    const coord = session.getState().map.wrapsHorizontally
      ? wrapHexCoord(rawCoord, session.getState().map.width)
      : rawCoord;
    const tile = session.getState().map.tiles[hexKey(coord)];
    if (!tile) return;

    const vis = deps.currentCiv()?.visibility;
    if (!vis) return;

    const visibility = getVisibility(vis, coord);

    if (visibility === 'unexplored') {
      closeTerritoryInspectionPanel();
      deps.showNotification('Unexplored territory');
      return;
    }

    if (visibility === 'fog') {
      openTerritoryInspectionPanel(coord);
      return;
    }

    const unitAtHex = Object.values(session.getState().units).find(unit =>
      unit.owner === session.getState().currentPlayer
        && unit.position.q === coord.q
        && unit.position.r === coord.r,
    );
    if (unitAtHex) {
      closeTerritoryInspectionPanel();
      selectionController.selectUnit(unitAtHex.id);
      selectionController.openUnitContextMenu(unitAtHex.id);
      return;
    }

    openTerritoryInspectionPanel(coord);
  }

  return {
    handleHexTap,
    handleHexLongPress,
  };
}
