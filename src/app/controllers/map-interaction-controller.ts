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
import { UNIT_DEFINITIONS, UNIT_DESCRIPTIONS, findPath } from '@/systems/unit-system';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { classifyOwner, isAlwaysHostilePair } from '@/core/owner-kind';
import { resolveMapTapIntent } from '@/input/map-tap-intent';
import { visibleHostileUnitEntriesAtKey } from '@/input/hex-defender-selection';
import { handleSelectedUnitMovementBlocker } from '@/input/selected-unit-movement-feedback';
import { resolveAirStrike, resolveReconMission } from '@/systems/air-operations-system';
import { executeParadrop, PARADROP_FAILURE_MESSAGES } from '@/systems/airborne-system';
import { unloadUnitFromTransport } from '@/systems/transport-system';
import { getMinorCivPresentationForPlayer } from '@/systems/minor-civ-presentation';
import { calculateCombatStrengths } from '@/systems/combat-system';
import { buildCombatContextForDefender, getAmphibiousAssaultMultiplier } from '@/systems/combat-context';
import { formatCombatPreviewDetails } from '@/ui/combat-preview';
import { getBeastDefinitionByUnitType } from '@/systems/beast-definitions';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { getEmbarkedAssaultTarget } from '@/systems/transport-system';
import { calculateCityAssaultStrengths } from '@/systems/city-siege-system';
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
              const path = findPath(unit.position, coord, session.getState().map, domain, { unit, completedTechs });
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
            const result = pending.mission === 'strike'
              ? resolveAirStrike(session.getState(), pending.unitId, coord)
              : resolveReconMission(session.getState(), pending.unitId, coord);
            if (!result.ok) {
              deps.showNotification('That air mission target is no longer legal.', 'warning');
              return;
            }
            selection.setPendingIntent({ kind: 'none' });
            session.commit(result.state);
            selectionController.refreshCurrentPlayerVisibility();
            deps.updateHUD();
            if (pending.mission === 'recon') SFX.airRecon();
            else SFX.combat();
            selectionController.selectUnit(pending.unitId);
            return;
          }

          case 'paradrop': {
            const pending = intent.pending;
            const result = executeParadrop(session.getState(), pending.unitId, coord);
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
            deps.updateHUD();
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

          default: {
            const _exhaustive: never = intent.pending;
            throw new Error(`Unhandled pending map intent: ${JSON.stringify(_exhaustive)}`);
          }
        }
      }

      case 'mistap': {
        // Mis-tap: block the tap; first occurrence shows an error notification
        if (selection.shouldWarnOnMistap()) {
          deps.showNotification('Tap a highlighted hex to disembark, or Cancel in the panel.', 'warning');
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
        const atkDef = UNIT_DEFINITIONS[unit.type];
        const defDef = UNIT_DEFINITIONS[defender.type];
        const strengthPreview = calculateCombatStrengths(
          previewAttacker,
          defender,
          session.getState().map,
          buildCombatContextForDefender(session.getState(), previewAttacker, defender, { amphibiousAssault }),
        );
        const atkStr = Math.round(strengthPreview.attackerStrength);
        const defStr = Math.round(strengthPreview.defenderStrength);

        const ownerKind = classifyOwner(defender.owner);
        const isMinorCiv = ownerKind === 'minor';
        let ownerName: string;
        if (ownerKind === 'barbarian') {
          ownerName = 'Barbarian';
        } else if (ownerKind === 'pirate') {
          ownerName = 'Pirates';
        } else if (ownerKind === 'rebel') {
          ownerName = 'Rebels';
        } else if (ownerKind === 'beast') {
          ownerName = 'Legendary Beasts';
        } else if (isMinorCiv) {
          const presentation = getMinorCivPresentationForPlayer(session.getState(), session.getState().currentPlayer, defender.owner, 'City-State');
          ownerName = presentation.name;
        } else {
          ownerName = session.getState().civilizations[defender.owner]?.name ?? defender.owner;
        }

        const odds = atkStr > defStr ? 'Favorable' : atkStr === defStr ? 'Even' : 'Risky';
        const oddsColor = atkStr > defStr ? '#6b9b4b' : atkStr === defStr ? '#e8c170' : '#d94a4a';

        const panel = deps.getElementById('info-panel');
        if (panel) {
          panel.style.display = 'block';
          const previewDiv = document.createElement('div');
          previewDiv.style.cssText = 'background:rgba(100,0,0,0.9);border-radius:12px;padding:12px 16px;';

          const title = document.createElement('div');
          title.style.cssText = 'font-size:13px;color:#e8c170;margin-bottom:6px;';
          title.textContent = 'Combat Preview';
          previewDiv.appendChild(title);

          const stats = document.createElement('div');
          stats.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px;';
          const atkSpan = document.createElement('span');
          atkSpan.textContent = `${atkDef.name} (${atkStr})`;
          const oddsSpan = document.createElement('span');
          oddsSpan.style.cssText = `color:${oddsColor};font-weight:bold;`;
          oddsSpan.textContent = odds;
          const defSpan = document.createElement('span');
          defSpan.textContent = `${defDef.name} (${defStr})`;
          stats.appendChild(atkSpan);
          stats.appendChild(oddsSpan);
          stats.appendChild(defSpan);
          previewDiv.appendChild(stats);

          const info = document.createElement('div');
          info.style.cssText = 'font-size:10px;opacity:0.6;margin-bottom:8px;';
          info.textContent = formatCombatPreviewDetails(ownerName, defender.health, strengthPreview);
          previewDiv.appendChild(info);

          const defenderBeastDef = getBeastDefinitionByUnitType(defender.type);
          if (defenderBeastDef?.regenPerTurn) {
            const traitLine = document.createElement('div');
            traitLine.style.cssText = 'font-size:10px;color:#f4c842;margin-bottom:6px;';
            traitLine.textContent = `⚠ Regenerates ${defenderBeastDef.regenPerTurn} HP every turn`;
            previewDiv.appendChild(traitLine);
          }
          if (defenderBeastDef?.navalOnly) {
            const traitLine = document.createElement('div');
            traitLine.style.cssText = 'font-size:10px;color:#f4c842;margin-bottom:6px;';
            traitLine.textContent = '⚠ Only ships and ranged units can fight it';
            previewDiv.appendChild(traitLine);
          }

          const hostileStackSize = visibleHostileUnitEntriesAtKey(session.getState(), key).length;
          if (hostileStackSize > 1) {
            const stackInfo = document.createElement('div');
            stackInfo.style.cssText = 'font-size:10px;opacity:0.72;margin-bottom:8px;';
            stackInfo.textContent = `${defDef.name} defends this stack. ${hostileStackSize} enemy units present.`;
            previewDiv.appendChild(stackInfo);
          }

          const btnRow = document.createElement('div');
          btnRow.style.cssText = 'display:flex;gap:8px;';
          const attackBtn = document.createElement('button');
          attackBtn.id = 'btn-attack-confirm';
          attackBtn.textContent = 'Attack';
          attackBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:#d94a4a;border:none;color:white;font-weight:bold;cursor:pointer;';
          const cancelBtn = document.createElement('button');
          cancelBtn.id = 'btn-cancel-attack';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:rgba(255,255,255,0.15);border:none;color:white;cursor:pointer;';
          btnRow.appendChild(attackBtn);
          btnRow.appendChild(cancelBtn);
          previewDiv.appendChild(btnRow);

          panel.innerHTML = '';
          panel.appendChild(previewDiv);

          cancelBtn.addEventListener('click', selectionController.deselectUnit);
          attackBtn.addEventListener('click', () => {
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
          });
        }
        return; // Wait for button press
      }

      case 'assault-preview': {
        const attackerUnit = session.getState().units[intent.attackerId];
        const targetCity = session.getState().cities[intent.cityId];
        const ownerCiv = targetCity ? session.getState().civilizations[targetCity.owner] : undefined;
        if (!attackerUnit || !targetCity || !ownerCiv) return;

        const attackerMultiplier = intent.embarkedAssault
          ? getAmphibiousAssaultMultiplier(session.getState(), attackerUnit, targetCity.position)
          : undefined;
        const effectiveAttacker = intent.embarkedAssault && attackerUnit.transportId
          ? { ...attackerUnit, position: { ...session.getState().units[attackerUnit.transportId].position }, transportId: undefined }
          : attackerUnit;
        const strengths = calculateCityAssaultStrengths(effectiveAttacker, targetCity, ownerCiv, session.getState().map, { attackerMultiplier });
        const atkStr = Math.round(strengths.attackerStrength);
        const cityStr = Math.round(strengths.intrinsicStrength);
        const odds = strengths.winProbability > 0.55 ? 'Favorable' : strengths.winProbability > 0.45 ? 'Even' : 'Risky';
        const oddsColor = strengths.winProbability > 0.55 ? '#6b9b4b' : strengths.winProbability > 0.45 ? '#e8c170' : '#d94a4a';

        const panel = deps.getElementById('info-panel');
        if (panel) {
          panel.style.display = 'block';
          const previewDiv = document.createElement('div');
          previewDiv.style.cssText = 'background:rgba(100,0,0,0.9);border-radius:12px;padding:12px 16px;';

          const title = document.createElement('div');
          title.style.cssText = 'font-size:13px;color:#e8c170;margin-bottom:6px;';
          title.textContent = 'Assault Preview';
          previewDiv.appendChild(title);

          const stats = document.createElement('div');
          stats.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px;';
          const atkSpan = document.createElement('span');
          atkSpan.textContent = `${UNIT_DEFINITIONS[attackerUnit.type].name} (${atkStr})`;
          const oddsSpan = document.createElement('span');
          oddsSpan.style.cssText = `color:${oddsColor};font-weight:bold;`;
          oddsSpan.textContent = odds;
          const defSpan = document.createElement('span');
          defSpan.textContent = `${targetCity.name} defenses (${cityStr})`;
          stats.appendChild(atkSpan);
          stats.appendChild(oddsSpan);
          stats.appendChild(defSpan);
          previewDiv.appendChild(stats);

          const info = document.createElement('div');
          info.style.cssText = 'font-size:10px;opacity:0.6;margin-bottom:8px;';
          info.textContent = intent.embarkedAssault
            ? 'Landing -50%. Marine training and adjacent shore bombardment are included.'
            : 'A walled city fights back if it has no garrison.';
          previewDiv.appendChild(info);

          const btnRow = document.createElement('div');
          btnRow.style.cssText = 'display:flex;gap:8px;';
          const attackBtn = document.createElement('button');
          attackBtn.id = 'btn-assault-confirm';
          attackBtn.textContent = 'Attack';
          attackBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:#d94a4a;border:none;color:white;font-weight:bold;cursor:pointer;';
          const cancelBtn = document.createElement('button');
          cancelBtn.id = 'btn-cancel-assault';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:rgba(255,255,255,0.15);border:none;color:white;cursor:pointer;';
          btnRow.appendChild(attackBtn);
          btnRow.appendChild(cancelBtn);
          previewDiv.appendChild(btnRow);

          panel.innerHTML = '';
          panel.appendChild(previewDiv);

          cancelBtn.addEventListener('click', selectionController.deselectUnit);
          attackBtn.addEventListener('click', () => {
            // Read live, as the module binding this replaced did.
            const assaultStatus = deps.beginPlayerCityAssault(selection.getSelectedUnitId()!, intent.cityId, undefined, undefined, intent.embarkedAssault);
            SFX.combat();
            renderLoop.setGameState(session.getState());
            deps.updateHUD();
            if (assaultStatus === 'resolved') {
              setTimeout(() => selectionController.selectNextUnit(), 400);
            }
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
            renderLoop.setGameState(session.getState());
            deps.updateHUD();
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
            session.setStateWithoutRefresh(begun.state);
            if (!begun.ok) {
              deps.showNotification(
                begun.reason === 'repelled-by-city-defense'
                  ? "Your attack was repelled by the city's defenses!"
                  : 'The attack could not proceed.',
                'warning',
              );
              renderLoop.setGameState(session.getState());
              deps.updateHUD();
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
            renderLoop.setGameState(session.getState());
            deps.updateHUD();
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
            const war = setMinorCivWarState(session.getState(), session.getState().currentPlayer, intent.minorCivId, true);
            if (!war.ok) return;
            session.setStateWithoutRefresh(war.state);
            emitMinorCivQuestTransitions(bus, war.transitions, session.getState());
            // #787 phase 14: this used to rely entirely on
            // executeMinorCivConquest below to flush the renderer/HUD -- but
            // that function returns early with no refresh at all when the
            // follow-up move fails. A declared war has a real, immediate
            // canvas effect: unit-map-presentation.ts's chooseLead reads
            // viewerDiplomacy.atWarWith every render() frame from the
            // renderer's own cached state to decide whether a foreign unit
            // stack picks its "lead" sprite by combat-defender strength
            // (selectDefenderForAttack) or by plain id sort -- and the city
            // the player just tapped to declare this war is on-screen right
            // now, typically with a garrison stack. Without this refresh that
            // stack keeps rendering its pre-war (non-hostile) lead unit until
            // some later unrelated commit happens to flush it. Explicit
            // refresh here (matching every sibling case in this switch) also
            // keeps this case consistent regardless of what the conquest
            // attempt does next.
            renderLoop.setGameState(session.getState());
            deps.updateHUD();
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
          renderLoop.setGameState(session.getState());
          deps.updateHUD();
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
            selectionController.executeAnimatedUnitMove(selectedId, () => confirmBusyWorkerMove(session.getState(), selectedId, intent.coord, {
              actor: 'player',
              civId: session.getState().currentPlayer,
              bus,
            }));
            SFX.tap();
            renderLoop.setGameState(session.getState());
            deps.updateHUD();
          },
        });
        return;
      }

      case 'move': {
        selectionController.executeAnimatedUnitMove(intent.unitId, () => executeUnitMove(session.getState(), intent.unitId, intent.coord, {
          actor: 'player',
          civId: session.getState().currentPlayer,
          bus,
        }));
        SFX.tap();
        renderLoop.setGameState(session.getState());
        deps.updateHUD();
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
