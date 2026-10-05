import type {
  AdvisorType,
  EspionageCivState,
  GameEvents,
  GameState,
  HexCoord,
  SpyMissionType,
  SpyPromotion,
} from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { createRng } from './map-generator';
import { hexDistance } from './hex-utils';
import { modifyRelationship } from './diplomacy-state';
import { transferCapturedCityOwnership } from './city-capture-system';
import { removeRouteById } from './trade-route-lifecycle';
import { applyResearchCompletionConsequences } from './tech-completion-system';
import { createUnit } from './unit-lifecycle';
import { resolveCivDefinition } from './civ-registry';
import { applySatelliteSurveillance } from './fog-of-war';
import { buildWorldRaceIntelSnapshot } from './world-race-system';
import { recordDominationPoliticalReport } from './domination-intel';
import { applyInteractionReputation, getCrisisInteractionDefinition } from './crisis-interaction-definitions';
import { EXPULSION_COOLDOWN, ESPIONAGE_TECH_MAX_SPIES, getMissionXp } from './espionage-catalog';
import { getEspionageModifierBreakdown, getSpySuccessChance } from './espionage-probability';
import { handleSpyCaptured, handleSpyExpelled, turnCapturedSpy } from './espionage-counterintel';
import { EXPOSE_SCANDAL_PENALTY, resolveMissionResult } from './espionage-missions';
import { checkAndApplyPromotion } from './espionage-spy-lifecycle';

/**
 * Espionage turn orchestration (#1009): the per-civ spy tick (`processSpyTurn`)
 * and the full state-level `processEspionageTurn`. This is the only espionage
 * module that mutates `GameState` and emits bus events; the phase order, RNG
 * seeds and draw order are byte-identical to the pre-split implementation.
 */
// --- Turn events (returned from processSpyTurn for bus emission) ---

export interface SpyTurnEvent {
  type: 'mission_succeeded' | 'mission_failed' | 'spy_expelled' | 'spy_captured' | 'spy_arrived' | 'spy_promoted';
  spyId: string;
  missionType?: SpyMissionType;
  promotion?: SpyPromotion;
  result?: Record<string, unknown>;
}

/**
 * #1201: an authoritative state transition a mission earned. `processEspionageTurn`
 * applies these itself, through the canonical city/trade transitions, before the
 * matching domain event is emitted — so the event can never claim a city flip or
 * courier interception that the espionage turn did not actually perform.
 */
export type EspionageConsequence =
  | { kind: 'transfer-city'; event: GameEvents['espionage:city-flipped'] }
  | { kind: 'remove-trade-route'; event: GameEvents['espionage:courier-intercepted'] };

export function processSpyTurn(
  state: EspionageCivState,
  seed: string,
  xpMultiplier: number = 1,
  modifierContext?: { gameState: GameState; civId: string },
): { state: EspionageCivState; events: SpyTurnEvent[] } {
  const rng = createRng(seed);
  let newState = { ...state, spies: { ...state.spies } };
  const events: SpyTurnEvent[] = [];

  for (const [spyId, spy] of Object.entries(newState.spies)) {
    let updated = { ...spy };

    if (updated.status === 'captured') {
      newState.spies[spyId] = updated;
      continue;
    }

    if (updated.status === 'cooldown') {
      updated.cooldownTurns -= 1;
      if (updated.cooldownTurns <= 0) {
        updated.status = 'idle';
        updated.cooldownTurns = 0;
      }
      newState.spies[spyId] = updated;
      continue;
    }

    if (updated.status === 'on_mission' && updated.currentMission) {
      const mission = { ...updated.currentMission };
      mission.turnsRemaining -= 1;

      if (mission.turnsRemaining <= 0) {
        // Resolve mission
        const counterIntel = newState.counterIntelligence[mission.targetCityId] ?? 0;
        const modifierBreakdown = modifierContext && updated.targetCivId
          ? getEspionageModifierBreakdown(modifierContext.gameState, {
            actingCivId: modifierContext.civId,
            targetCivId: updated.targetCivId,
            targetCityId: mission.targetCityId,
            missionType: mission.type,
          })
          : null;
        const successChance = getSpySuccessChance(
          updated.experience, counterIntel, mission.type, updated.promotion,
          modifierBreakdown?.missionSuccessDelta ?? 0,
        );
        const roll = rng();

        if (roll < successChance) {
          // Success
          updated.experience = Math.min(100, updated.experience + Math.round(getMissionXp(mission.type) * xpMultiplier));
          updated.status = 'stationed';
          updated.currentMission = null;
          events.push({
            type: 'mission_succeeded',
            spyId,
            missionType: mission.type,
            result: {},
          });
          const afterPromo = checkAndApplyPromotion(updated, mission.type);
          if (afterPromo.promotion && !updated.promotion) {
            updated = afterPromo;
            events.push({ type: 'spy_promoted', spyId, promotion: afterPromo.promotion });
          }
        } else {
          // Failure — determine expulsion vs capture; detection modifiers (e.g. Secret Police)
          // raise the capture threshold above the 0.3 baseline.
          const captureThreshold = Math.min(0.95, 0.3 + (modifierBreakdown?.detectionDelta ?? 0));
          const captureRoll = rng();
          if (captureRoll < captureThreshold) {
            // Captured
            updated.status = 'captured';
            updated.currentMission = null;
            events.push({ type: 'spy_captured', spyId, missionType: mission.type });
          } else {
            // Expelled
            updated.status = 'cooldown';
            updated.cooldownTurns = EXPULSION_COOLDOWN;
            updated.targetCivId = null;
            updated.targetCityId = null;
            updated.position = null;
            updated.currentMission = null;
            events.push({ type: 'spy_expelled', spyId, missionType: mission.type });
          }
        }
      } else {
        updated.currentMission = mission;
      }

      newState.spies[spyId] = updated;
      continue;
    }

    newState.spies[spyId] = updated;
  }

  return { state: newState, events };
}

function pruneDetectedThreats(
  state: EspionageCivState,
  turn: number,
): EspionageCivState {
  const detectedThreats = Object.fromEntries(
    Object.entries(state.detectedThreats ?? {})
      .filter(([, threat]) => threat.expiresOnTurn >= turn),
  );

  if (Object.keys(detectedThreats).length === Object.keys(state.detectedThreats ?? {}).length) {
    return state;
  }

  return {
    ...state,
    detectedThreats,
  };
}

/**
 * Named per-phase helpers for `processEspionageTurn` (#1009).
 *
 * Each phase is a direct extraction of one block of the pre-split orchestrator
 * and is called in the original order. No phase adds, removes or reorders a
 * state transition, bus event or RNG draw -- the decomposition is purely
 * structural so each turn responsibility is named and independently legible.
 */

/** Turn captured spies whose captor has the tech to do so (pre-split first loop). */
function turnEligibleCapturedSpiesForCiv(state: GameState, civId: string, bus: EventBus): GameState {
  for (const spy of Object.values(state.espionage![civId].spies)) {
    const captorId = spy.targetCivId;
    const captorTechs = captorId ? state.civilizations[captorId]?.techState.completed ?? [] : [];
    const canTurnCapturedSpy = captorTechs.includes('counter-intelligence') || captorTechs.includes('digital-surveillance');
    if (spy.status === 'captured' && !spy.turnedBy && captorId && canTurnCapturedSpy) {
      const targetCity = spy.targetCityId ? state.cities[spy.targetCityId] : null;
      const hasSecurityBureau = targetCity?.buildings.includes('security-bureau') ?? false;
      if (hasSecurityBureau) {
        const turnRng = createRng(`sec-bureau-${spy.id}-${state.turn}`);
        if (turnRng() < 0.5) continue; // Security bureau blocks 50% of turning attempts
      }
      state.espionage = turnCapturedSpy(state.espionage!, { captorId, spyOwner: civId, spyId: spy.id, turn: state.turn });
      bus.emit('espionage:spy-detected', {
        detectingCivId: captorId,
        spyOwner: civId,
        spyId: spy.id,
        cityId: spy.targetCityId ?? '',
      });
    }
  }
  return state;
}

/**
 * Apply every `processSpyTurn` event for one civilization: bus emission, state
 * mutation, bilateral diplomacy and earned-intel persistence. Returns the
 * possibly-reassigned `state` and the civ's final `EspionageCivState`.
 */
function applySpyTurnEvents(
  initialState: GameState,
  civId: string,
  civEspBefore: EspionageCivState,
  initialEsp: EspionageCivState,
  events: SpyTurnEvent[],
  bus: EventBus,
  consequences: EspionageConsequence[],
): { state: GameState; espionageCiv: EspionageCivState } {
  let state = initialState;
  let updatedEsp = initialEsp;
  for (const evt of events) {
    const spy = updatedEsp.spies[evt.spyId];

    switch (evt.type) {
      case 'spy_arrived':
        bus.emit('espionage:spy-arrived', {
          civId, spyId: evt.spyId, targetCityId: spy?.targetCityId ?? '',
        });
        break;

      case 'mission_succeeded': {
        const result = spy?.targetCivId && spy?.targetCityId
          ? resolveMissionResult(evt.missionType!, spy.targetCivId, spy.targetCityId, state, civId, evt.spyId)
          : {};

        bus.emit('espionage:mission-succeeded', {
          civId, spyId: evt.spyId, missionType: evt.missionType!,
          result: result as Record<string, unknown>,
        });

        // Apply scout_area results — reveal tiles for spying civ
        if (evt.missionType === 'scout_area' && result.tilesToReveal) {
          for (const coord of result.tilesToReveal) {
            const key = `${coord.q},${coord.r}`;
            if (state.civilizations[civId]?.visibility?.tiles) {
              state.civilizations[civId].visibility.tiles[key] = 'visible';
            }
          }
        }

        // steal_tech: add the tech to the spying civ and record dedup
        if (evt.missionType === 'steal_tech' && result.stolenTechId) {
          const stolenId = result.stolenTechId as string;
          let completedStolenTech = false;
          if (!state.civilizations[civId].techState.completed.includes(stolenId)) {
            state.civilizations[civId].techState.completed.push(stolenId);
            bus.emit('tech:completed', { civId, techId: stolenId });
            completedStolenTech = true;
          }
          const thisSpy = updatedEsp.spies[evt.spyId];
          if (thisSpy?.targetCivId) {
            const prevStolen = thisSpy.stolenTechFrom?.[thisSpy.targetCivId] ?? [];
            updatedEsp = {
              ...updatedEsp,
              spies: {
                ...updatedEsp.spies,
                [evt.spyId]: {
                  ...thisSpy,
                  stolenTechFrom: {
                    ...thisSpy.stolenTechFrom,
                    [thisSpy.targetCivId]: [...prevStolen, stolenId],
                  },
                },
              },
            };
            state.espionage![civId] = updatedEsp;
          }
          if (completedStolenTech) {
            state = applyResearchCompletionConsequences(state, civId, stolenId, bus);
          }
        }

        // sabotage_production: reduce target city's production progress
        if (evt.missionType === 'sabotage_production' && result.productionLost) {
          const spyTarget = updatedEsp.spies[evt.spyId];
          if (spyTarget?.targetCityId) {
            const tc = state.cities[spyTarget.targetCityId];
            if (tc) {
              const productionProgress = Math.max(0, tc.productionProgress - (result.productionLost as number));
              const activeLegendaryWonder = tc.productionQueue[0]?.startsWith('legendary:')
                ? tc.productionQueue[0].slice('legendary:'.length)
                : null;
              const updatedProjects = activeLegendaryWonder && state.legendaryWonderProjects
                ? Object.fromEntries(
                  Object.entries(state.legendaryWonderProjects).map(([projectId, project]) => [
                    projectId,
                    project.cityId === tc.id && project.wonderId === activeLegendaryWonder
                      ? { ...project, investedProduction: productionProgress }
                      : project,
                  ]),
                )
                : state.legendaryWonderProjects;
              state = {
                ...state,
                cities: { ...state.cities, [spyTarget.targetCityId]: { ...tc, productionProgress } },
                ...(updatedProjects ? { legendaryWonderProjects: updatedProjects } : {}),
              };
            }
          }
        }

        // sabotage_relief (#526 MR7): places the sabotage on the target civ's outbreak
        // crisis, then rolls ONE detection check reusing the same 0.3 baseline capture
        // threshold every mission's fail-path detection uses (no new stealth
        // subsystem, per spec §Interactions). Discovery applies reputation
        // immediately and emits the discovery event; undiscovered stays silent
        // ("Undiscovered: no penalty").
        if (evt.missionType === 'sabotage_relief' && result.sabotageCrisisId) {
          const originalSpy = civEspBefore.spies[evt.spyId];
          const crisisId = result.sabotageCrisisId as string;
          const crisis = state.activeCrises?.[crisisId];
          const targetCivId = originalSpy?.targetCivId;
          if (crisis && !crisis.sabotage && targetCivId) {
            const untilTurn = state.turn + 4;
            const detectRng = createRng(`sab-relief-detect-${evt.spyId}-${crisisId}-${state.turn}`);
            const discovered = detectRng() < 0.3;
            state = {
              ...state,
              activeCrises: {
                ...state.activeCrises,
                [crisisId]: { ...crisis, sabotage: { byCivId: civId, untilTurn, discovered } },
              },
            };
            if (discovered) {
              state = applyInteractionReputation(
                state, civId, targetCivId, getCrisisInteractionDefinition('sabotage_relief')!,
              );
              bus.emit('espionage:sabotage-relief-discovered', { crisisId, actorCivId: civId, targetCivId });
            }
          }
        }

        if (evt.missionType === 'cyber_attack' && result.productionDisabledTurns) {
          const originalSpy = civEspBefore.spies[evt.spyId];
          const targetCity = originalSpy?.targetCityId ? state.cities[originalSpy.targetCityId] : null;
          if (targetCity) {
            state = {
              ...state,
              cities: { ...state.cities, [targetCity.id]: { ...targetCity, productionDisabledTurns: result.productionDisabledTurns as number } },
            };
          }
        }

        if (evt.missionType === 'misinformation_campaign' && result.researchPenaltyTurns && result.researchPenaltyMultiplier !== undefined) {
          const originalSpy = civEspBefore.spies[evt.spyId];
          const targetCiv = originalSpy?.targetCivId ? state.civilizations[originalSpy.targetCivId] : null;
          if (targetCiv) {
            state = {
              ...state,
              civilizations: {
                ...state.civilizations,
                [originalSpy!.targetCivId!]: {
                  ...targetCiv,
                  researchPenaltyTurns: result.researchPenaltyTurns as number,
                  researchPenaltyMultiplier: result.researchPenaltyMultiplier as number,
                },
              },
            };
          }
        }

        // incite_unrest / fund_rebels: inject spyUnrestBonus
        if ((evt.missionType === 'incite_unrest' || evt.missionType === 'fund_rebels' || evt.missionType === 'election_interference') && result.unrestInjected) {
          const spyTarget = updatedEsp.spies[evt.spyId];
          if (spyTarget?.targetCityId) {
            const tc = state.cities[spyTarget.targetCityId];
            if (tc) {
              state = {
                ...state,
                cities: { ...state.cities, [spyTarget.targetCityId]: { ...tc, spyUnrestBonus: Math.min(50, tc.spyUnrestBonus + (result.unrestInjected as number)) } },
              };
            }
          }
        }

        if (evt.missionType === 'satellite_surveillance' && result.grantTerritoryVision) {
          const originalSpy = civEspBefore.spies[evt.spyId];
          const targetCivId = originalSpy?.targetCivId;
          if (targetCivId && state.civilizations[civId]) {
            state.civilizations[civId].satelliteSurveillanceTargets = {
              ...state.civilizations[civId].satelliteSurveillanceTargets,
              [targetCivId]: 3,
            };
            state = applySatelliteSurveillance(state, civId, targetCivId);
          }
        }

        // assassinate_advisor: disable an advisor on the target civ
        if (evt.missionType === 'assassinate_advisor' && result.assassinatedAdvisor && result.disabledUntilTurn) {
          const originalSpy = civEspBefore.spies[evt.spyId];
          const targetCiv = state.civilizations[originalSpy?.targetCivId ?? ''];
          if (targetCiv) {
            targetCiv.advisorDisabledUntil = {
              ...targetCiv.advisorDisabledUntil,
              [result.assassinatedAdvisor as AdvisorType]: result.disabledUntilTurn as number,
            };
            bus.emit('espionage:advisor-assassinated', {
              targetCivId: originalSpy?.targetCivId ?? '',
              advisorType: result.assassinatedAdvisor as AdvisorType,
              disabledUntilTurn: result.disabledUntilTurn as number,
            });
          }
        }

        // forge_documents: apply relationship penalty between two civs
        if (evt.missionType === 'forge_documents' && result.forgeCivA && result.forgeCivB) {
          const penalty = (result.forgeRelationshipPenalty as number) ?? -25;
          const civA = result.forgeCivA as string;
          const civB = result.forgeCivB as string;
          if (state.civilizations[civA]) {
            state.civilizations[civA].diplomacy = modifyRelationship(
              state.civilizations[civA].diplomacy, civB, penalty,
            );
          }
          if (state.civilizations[civB]) {
            state.civilizations[civB].diplomacy = modifyRelationship(
              state.civilizations[civB].diplomacy, civA, penalty,
            );
          }
          bus.emit('espionage:documents-forged', {
            civA, civB, relationshipPenalty: penalty,
          });
        }

        // flip_loyalty (#524 MR2a): record the authoritative transfer as an explicit
        // consequence; processEspionageTurn applies it after the per-civ loop through
        // city-capture-system's canonical non-combat ownership transfer, and only then
        // emits 'espionage:city-flipped' (#1201). The bilateral relationship penalty is
        // applied here inline since diplomacy-state is a leaf.
        // -30: steeper than forge_documents (-25, no territorial loss) but shallower
        // than a raze (-40, destructive), reflecting a non-destructive but direct
        // territorial loss.
        if (evt.missionType === 'flip_loyalty' && result.flippedCityId && result.flippedFromCivId) {
          const victimCivId = result.flippedFromCivId as string;
          const flippedCityId = result.flippedCityId as string;
          if (state.cities[flippedCityId] && state.cities[flippedCityId].owner === victimCivId) {
            if (state.civilizations[civId]) {
              state.civilizations[civId].diplomacy = modifyRelationship(
                state.civilizations[civId].diplomacy, victimCivId, -30,
              );
            }
            if (state.civilizations[victimCivId]) {
              state.civilizations[victimCivId].diplomacy = modifyRelationship(
                state.civilizations[victimCivId].diplomacy, civId, -30,
              );
            }
            consequences.push({
              kind: 'transfer-city',
              event: { civId, victimCivId, cityId: flippedCityId },
            });
          }
        }

        // arms_smuggling: spawn a hostile 'rebels' unit near the target city
        if (evt.missionType === 'arms_smuggling' && result.spawnPosition) {
          const pos = result.spawnPosition as HexCoord;
          const key = `${pos.q},${pos.r}`;
          if (state.map.tiles[key]) {
            const hostileUnit = createUnit('warrior', 'rebels', pos, state.idCounters);
            state = { ...state, units: { ...state.units, [hostileUnit.id]: hostileUnit } };
            bus.emit('unit:created', { unit: hostileUnit });
          }
        }

        // intercept_courier (#442 MR1): record the removal as an explicit consequence;
        // processEspionageTurn severs it through trade-system's canonical
        // removeRouteById, then emits 'espionage:courier-intercepted' (#1201) — so the
        // event is never observable before the route is actually gone.
        if (evt.missionType === 'intercept_courier' && result.interceptedRouteId) {
          const originalSpy = civEspBefore.spies[evt.spyId];
          const targetCivId = originalSpy?.targetCivId;
          if (targetCivId) {
            consequences.push({
              kind: 'remove-trade-route',
              event: {
                civId,
                targetCivId,
                routeId: result.interceptedRouteId,
                fromCityId: result.interceptedFromCityId!,
                toCityId: result.interceptedToCityId!,
              },
            });
          }
        }

        // bribe_official (#442 MR1): direct bilateral gold transfer — no import-cycle
        // concern (both civilizations are plain state already on GameState), so this
        // applies inline like cyber_attack/misinformation_campaign above.
        if (evt.missionType === 'bribe_official' && result.bribedGoldAmount) {
          const originalSpy = civEspBefore.spies[evt.spyId];
          const targetCivId = originalSpy?.targetCivId;
          const amount = result.bribedGoldAmount as number;
          if (targetCivId && state.civilizations[targetCivId] && state.civilizations[civId]) {
            state = {
              ...state,
              civilizations: {
                ...state.civilizations,
                [targetCivId]: {
                  ...state.civilizations[targetCivId],
                  gold: Math.max(0, state.civilizations[targetCivId].gold - amount),
                },
                [civId]: {
                  ...state.civilizations[civId],
                  gold: state.civilizations[civId].gold + amount,
                },
              },
            };
            bus.emit('espionage:official-bribed', { civId, targetCivId, amount });
          }
        }

        // expose_scandal (#442 MR2): applies the bounded per-partner penalty
        // bilaterally (target <-> each partner), then emits one event naming every
        // affected partner — no import-cycle concern, everything here is plain
        // civilizations/diplomacy state already on GameState.
        if (evt.missionType === 'expose_scandal' && result.exposedPartnerCivIds) {
          const originalSpy = civEspBefore.spies[evt.spyId];
          const targetCivId = originalSpy?.targetCivId;
          const partners = result.exposedPartnerCivIds as string[];
          if (targetCivId && state.civilizations[targetCivId] && partners.length > 0) {
            for (const partnerId of partners) {
              if (!state.civilizations[partnerId]) continue;
              state = {
                ...state,
                civilizations: {
                  ...state.civilizations,
                  [targetCivId]: {
                    ...state.civilizations[targetCivId],
                    diplomacy: modifyRelationship(state.civilizations[targetCivId].diplomacy, partnerId, EXPOSE_SCANDAL_PENALTY),
                  },
                  [partnerId]: {
                    ...state.civilizations[partnerId],
                    diplomacy: modifyRelationship(state.civilizations[partnerId].diplomacy, targetCivId, EXPOSE_SCANDAL_PENALTY),
                  },
                },
              };
            }
            bus.emit('espionage:scandal-exposed', { civId, targetCivId, partnerCivIds: partners });
          }
        }

        // signals_intercept (#442 MR2): persist the snapshot on the acting civ's own
        // EspionageCivState so it can actually be rendered (end-to-end-wiring.md
        // "computed data ... MUST be rendered — dead computed data is a bug"). Latest
        // snapshot per target civ only — a stale disposition list has no value once the
        // target's units have moved, so this overwrites rather than appends.
        if (evt.missionType === 'signals_intercept' && result.nearbyUnits) {
          const originalSpy = civEspBefore.spies[evt.spyId];
          const targetCivId = originalSpy?.targetCivId;
          if (targetCivId) {
            updatedEsp = {
              ...updatedEsp,
              signalsIntelligence: {
                ...(updatedEsp.signalsIntelligence ?? {}),
                [targetCivId]: { turn: state.turn, units: result.nearbyUnits },
              },
            };
            state.espionage![civId] = updatedEsp;
          }
        }

        // Post-#442 audit fix: monitor_troops/gather_intel/identify_resources/
        // monitor_diplomacy compute a real MissionResult above but, before this fix,
        // never persisted or notified it -- the generic espionage:mission-succeeded
        // event has no handler anywhere (see EspionageCivState's matching field
        // comments). Each block below mirrors signals_intercept's persist-then-notify
        // shape: snapshot on the acting civ's own state (never the target's), overwrite
        // per target rather than append (a stale report has no value once the target's
        // state has moved on), then a single attacker-only notification.
        if (evt.missionType === 'monitor_troops' && result.nearbyUnits) {
          const originalSpy = civEspBefore.spies[evt.spyId];
          const targetCivId = originalSpy?.targetCivId;
          const targetCityId = originalSpy?.targetCityId;
          if (targetCivId && targetCityId) {
            updatedEsp = {
              ...updatedEsp,
              troopObservations: {
                ...(updatedEsp.troopObservations ?? {}),
                [targetCityId]: { turn: state.turn, targetCivId, units: result.nearbyUnits },
              },
            };
            state.espionage![civId] = updatedEsp;
            bus.emit('espionage:intel-report-acquired', {
              civId, spyId: evt.spyId, missionType: evt.missionType, targetCivId,
            });
          }
        }

        if (evt.missionType === 'gather_intel' && result.techProgress) {
          const originalSpy = civEspBefore.spies[evt.spyId];
          const targetCivId = originalSpy?.targetCivId;
          if (targetCivId) {
            // #992: rides the same report gather_intel already produces -- never a
            // separate race-specific intel channel. Reads the target's CURRENT real
            // state (national projects, production queue), same as every other field
            // on this report; omitted entirely if the target has entered no race.
            const worldRaceProgress = buildWorldRaceIntelSnapshot(state, targetCivId);
            updatedEsp = {
              ...updatedEsp,
              intelReports: {
                ...(updatedEsp.intelReports ?? {}),
                [targetCivId]: {
                  turn: state.turn,
                  completedTechCount: result.techProgress.completed.length,
                  currentResearch: result.techProgress.currentResearch,
                  researchProgress: result.techProgress.researchProgress,
                  treasury: result.treasury ?? 0,
                  treaties: result.treaties ?? [],
                  ...(worldRaceProgress ? { worldRaceProgress } : {}),
                },
              },
            };
            state.espionage![civId] = updatedEsp;
            state = recordDominationPoliticalReport(state, civId, targetCivId);
            bus.emit('espionage:intel-report-acquired', {
              civId, spyId: evt.spyId, missionType: evt.missionType, targetCivId,
            });
          }
        }

        if (evt.missionType === 'identify_resources' && result.resources) {
          const originalSpy = civEspBefore.spies[evt.spyId];
          const targetCivId = originalSpy?.targetCivId;
          const targetCityId = originalSpy?.targetCityId;
          if (targetCivId && targetCityId) {
            updatedEsp = {
              ...updatedEsp,
              resourceReports: {
                ...(updatedEsp.resourceReports ?? {}),
                [targetCityId]: { turn: state.turn, targetCivId, resources: result.resources },
              },
            };
            state.espionage![civId] = updatedEsp;
            bus.emit('espionage:intel-report-acquired', {
              civId, spyId: evt.spyId, missionType: evt.missionType, targetCivId,
            });
          }
        }

        if (evt.missionType === 'monitor_diplomacy' && result.relationships) {
          const originalSpy = civEspBefore.spies[evt.spyId];
          const targetCivId = originalSpy?.targetCivId;
          if (targetCivId) {
            updatedEsp = {
              ...updatedEsp,
              diplomacyReports: {
                ...(updatedEsp.diplomacyReports ?? {}),
                [targetCivId]: {
                  turn: state.turn,
                  relationships: result.relationships,
                  tradePartners: result.tradePartners ?? [],
                },
              },
            };
            state.espionage![civId] = updatedEsp;
            bus.emit('espionage:intel-report-acquired', {
              civId, spyId: evt.spyId, missionType: evt.missionType, targetCivId,
            });
          }
        }

        break;
      }

      case 'mission_failed':
        bus.emit('espionage:mission-failed', {
          civId, spyId: evt.spyId, missionType: evt.missionType!,
        });
        break;

      case 'spy_expelled': {
        // Note: spy has already been reset by processSpyTurn, so targetCivId is null
        // We need to look at the mission's targetCivId from the event context
        // The spy's original target is in the mission that was active before processing
        const originalSpy = civEspBefore.spies[evt.spyId]; // pre-update spy
        const targetCivId = originalSpy?.targetCivId;
        if (targetCivId && state.civilizations[targetCivId]) {
          // Bilateral update: target civ's view of spy owner
          state.civilizations[targetCivId].diplomacy = handleSpyExpelled(
            state.civilizations[targetCivId].diplomacy, civId, state.turn,
          );
          // Bilateral update: spy owner's view of target civ
          if (state.civilizations[civId]) {
            state.civilizations[civId].diplomacy = modifyRelationship(
              state.civilizations[civId].diplomacy, targetCivId, -5,
            );
          }
        }
        bus.emit('espionage:spy-expelled', {
          civId, spyId: evt.spyId, fromCivId: targetCivId ?? '',
        });
        break;
      }

      case 'spy_promoted':
        bus.emit('espionage:spy-promoted', {
          civId, spyId: evt.spyId, promotion: evt.promotion!,
        });
        break;

      case 'spy_captured': {
        const originalSpy = civEspBefore.spies[evt.spyId]; // pre-update spy
        const targetCivId = originalSpy?.targetCivId;
        if (targetCivId && state.civilizations[targetCivId]) {
          // Bilateral update: target civ's view of spy owner
          state.civilizations[targetCivId].diplomacy = handleSpyCaptured(
            state.civilizations[targetCivId].diplomacy, civId, state.turn,
          );
          // Bilateral update: spy owner's view of target civ
          if (state.civilizations[civId]) {
            state.civilizations[civId].diplomacy = modifyRelationship(
              state.civilizations[civId].diplomacy, targetCivId, -10,
            );
          }
          const targetTechs = state.civilizations[targetCivId].techState.completed ?? [];
          if (targetTechs.includes('counter-intelligence') || targetTechs.includes('digital-surveillance')) {
            state.espionage = turnCapturedSpy(state.espionage!, { captorId: targetCivId, spyOwner: civId, spyId: evt.spyId, turn: state.turn });
            bus.emit('espionage:spy-detected', {
              detectingCivId: targetCivId,
              spyOwner: civId,
              spyId: evt.spyId,
              cityId: originalSpy?.targetCityId ?? '',
            });
          }
        }
        bus.emit('espionage:spy-captured', {
          capturingCivId: targetCivId ?? '', spyOwner: civId, spyId: evt.spyId,
        });
        break;
      }
    }
  }
  return { state, espionageCiv: updatedEsp };
}

/** Recall spies whose target city is gone, and embedded spies whose own city fell. */
function recallSpiesFromLostTargets(state: GameState, civId: string, bus: EventBus): GameState {
  for (const spy of Object.values(state.espionage![civId].spies)) {
    if ((spy.status === 'stationed' || spy.status === 'on_mission') && spy.targetCityId) {
      const targetCity = state.cities[spy.targetCityId];
      if (!targetCity) {
        state.espionage![civId].spies[spy.id] = {
          ...spy,
          status: 'idle',
          targetCivId: null,
          targetCityId: null,
          position: null,
          currentMission: null,
        };
        bus.emit('espionage:spy-recalled', {
          civId, spyId: spy.id, reason: 'city_destroyed',
        });
      }
    }
    // Clean up embedded spies when their own city is destroyed or captured
    if (spy.status === 'embedded' && spy.targetCityId) {
      const targetCity = state.cities[spy.targetCityId];
      if (!targetCity || targetCity.owner !== civId) {
        state.espionage![civId].spies[spy.id] = {
          ...spy,
          status: 'cooldown',
          cooldownTurns: 5,
          targetCityId: null,
          position: null,
        };
        bus.emit('espionage:spy-recalled', {
          civId, spyId: spy.id, reason: 'city_destroyed',
        });
      }
    }
  }
  return state;
}

/** Auto-exfiltrate spies whose infiltration city changed hands or was destroyed. */
function autoExfiltrateDisplacedSpies(state: GameState, civId: string, bus: EventBus): GameState {
  const toAutoExfil: Array<{ spyId: string; cityId: string }> = [];
  for (const spy of Object.values(state.espionage![civId].spies)) {
    if ((spy.status === 'stationed' || spy.status === 'on_mission') && spy.infiltrationCityId) {
      const infiltCity = state.cities[spy.infiltrationCityId];
      // Trigger when city is gone OR the current owner is no longer the original target civ
      if (!infiltCity || infiltCity.owner !== spy.targetCivId) {
        toAutoExfil.push({ spyId: spy.id, cityId: spy.infiltrationCityId });
      }
    }
  }
  for (const { spyId, cityId } of toAutoExfil) {
    const spy = state.espionage![civId].spies[spyId];
    if (!spy) continue;
    state = {
      ...state,
      espionage: {
        ...state.espionage,
        [civId]: {
          ...state.espionage![civId],
          spies: {
            ...state.espionage![civId].spies,
            [spyId]: { ...spy, status: 'cooldown', cooldownTurns: 5, infiltrationCityId: null, cityVisionTurnsLeft: 0, targetCivId: null },
          },
        },
      },
    };
    bus.emit('espionage:spy-auto-exfiltrated', { civId, spyId, cityId });
  }
  return state;
}

/** Passive capture risk for cooldown spies still embedded in a foreign city. */
function applyPassiveCaptureDetection(state: GameState, civId: string, bus: EventBus): GameState {
  const passiveRng = createRng(`passive-detect-${civId}-${state.turn}`);
  const toCapture: string[] = [];
  for (const spy of Object.values(state.espionage![civId].spies)) {
    if (spy.status !== 'cooldown' || !spy.infiltrationCityId || !spy.targetCivId) continue;
    const ci = state.espionage?.[spy.targetCivId]?.counterIntelligence[spy.infiltrationCityId] ?? 0;
    const baseChance = spy.cooldownMode === 'passive_observe' ? 0.04 : 0.02;
    const detectChance = baseChance + ci * 0.002;
    if (passiveRng() < detectChance) {
      toCapture.push(spy.id);
    }
  }
  for (const spyId of toCapture) {
    const spy = state.espionage![civId].spies[spyId];
    if (!spy) continue;
    const capturedById = spy.targetCivId;
    state = {
      ...state,
      espionage: {
        ...state.espionage,
        [civId]: {
          ...state.espionage![civId],
          spies: {
            ...state.espionage![civId].spies,
            [spyId]: { ...spy, status: 'captured', infiltrationCityId: null, targetCivId: null },
          },
        },
      },
    };
    if (capturedById && state.civilizations[capturedById]) {
      state.civilizations[capturedById].diplomacy = handleSpyCaptured(
        state.civilizations[capturedById].diplomacy, civId, state.turn,
      );
      if (state.civilizations[civId]) {
        state.civilizations[civId].diplomacy = modifyRelationship(
          state.civilizations[civId].diplomacy, capturedById, -10,
        );
      }
      const targetTechs = state.civilizations[capturedById].techState.completed ?? [];
      if (targetTechs.includes('counter-intelligence') || targetTechs.includes('digital-surveillance')) {
        state.espionage = turnCapturedSpy(state.espionage!, { captorId: capturedById, spyOwner: civId, spyId, turn: state.turn });
        bus.emit('espionage:spy-detected', {
          detectingCivId: capturedById, spyOwner: civId, spyId,
          cityId: spy.infiltrationCityId ?? '',
        });
      }
    }
    bus.emit('espionage:spy-captured', { capturingCivId: capturedById ?? '', spyOwner: civId, spyId });
  }
  return state;
}

/** Stationed spies passively reveal fog around their target and report nearby troops. */
function applyStationedSpyPassiveAbilities(state: GameState, civId: string, bus: EventBus): GameState {
  for (const spy of Object.values(state.espionage![civId].spies)) {
    if (spy.status === 'stationed' && spy.targetCivId && spy.targetCityId) {
      const targetCity = state.cities[spy.targetCityId];
      if (!targetCity) {
        // City was destroyed/captured — recall spy to idle
        state.espionage![civId].spies[spy.id] = {
          ...spy,
          status: 'idle',
          targetCivId: null,
          targetCityId: null,
          position: null,
          currentMission: null,
        };
        bus.emit('espionage:spy-recalled', {
          civId, spyId: spy.id, reason: 'city_destroyed',
        });
        continue;
      }

      // Passive fog reveal around stationed city
      const revealRadius = 3;
      for (const key of Object.keys(state.map.tiles)) {
        const [q, r] = key.split(',').map(Number);
        if (hexDistance({ q, r }, targetCity.position) <= revealRadius) {
          if (state.civilizations[civId]?.visibility?.tiles) {
            state.civilizations[civId].visibility.tiles[key] = 'visible';
          }
        }
      }

      // Passive troop monitoring — emit event with units near city
      const nearbyUnits: Array<{ type: string; position: HexCoord }> = [];
      for (const unit of Object.values(state.units)) {
        if (unit.owner === spy.targetCivId &&
            hexDistance(unit.position, targetCity.position) <= 4) {
          nearbyUnits.push({ type: unit.type, position: unit.position });
        }
      }
      if (nearbyUnits.length > 0) {
        bus.emit('espionage:mission-succeeded', {
          civId, spyId: spy.id, missionType: 'monitor_troops' as SpyMissionType,
          result: { nearbyUnits, passive: true } as Record<string, unknown>,
        });
      }
    }
  }
  return state;
}

/** Refresh the civ's spy-slot cap from its completed espionage techs. */
function refreshMaxSpies(state: GameState, civId: string): GameState {
  // Update maxSpies based on current tech
  let maxSpies = 0;
  const civ = state.civilizations[civId];
  if (civ) {
    for (const [techId, spyCount] of Object.entries(ESPIONAGE_TECH_MAX_SPIES)) {
      if (civ.techState.completed.includes(techId)) {
        maxSpies = Math.max(maxSpies, spyCount);
      }
    }
    state = { ...state, espionage: { ...state.espionage!, [civId]: { ...state.espionage![civId], maxSpies } } };
  }
  return state;
}

/** Decay every city's spy-injected unrest by 5 per turn. */
function decaySpyUnrest(state: GameState): GameState {
  // Decay spy unrest bonus 5 per turn
  const decayedCities = Object.fromEntries(
    Object.entries(state.cities).map(([cityId, city]) =>
      city.spyUnrestBonus > 0
        ? [cityId, { ...city, spyUnrestBonus: Math.max(0, city.spyUnrestBonus - 5) }]
        : [cityId, city],
    ),
  );
  state = { ...state, cities: decayedCities };
  return state;
}

/**
 * Apply the mission consequences the turn earned (#1201). Each goes through the
 * canonical transition that owns it, and its domain event is emitted only after the
 * state mutation — so an observer never sees a flip/interception event whose state
 * has not actually changed.
 */
function applyEspionageConsequences(
  state: GameState,
  consequences: EspionageConsequence[],
  bus: EventBus,
): GameState {
  for (const consequence of consequences) {
    switch (consequence.kind) {
      case 'transfer-city': {
        const { cityId, civId, victimCivId } = consequence.event;
        if (state.cities[cityId]?.owner === victimCivId) {
          state = transferCapturedCityOwnership(state, cityId, civId, state.turn);
          bus.emit('espionage:city-flipped', consequence.event);
        }
        break;
      }
      case 'remove-trade-route': {
        if (state.marketplace?.tradeRoutes.some(r => r.id === consequence.event.routeId)) {
          state = removeRouteById(state, consequence.event.routeId, bus, 'espionage');
          bus.emit('espionage:courier-intercepted', consequence.event);
        }
        break;
      }
      default: {
        const unhandled: never = consequence;
        throw new Error(`Unhandled espionage consequence: ${JSON.stringify(unhandled)}`);
      }
    }
  }
  return state;
}

/**
 * The espionage turn orchestrator (#1009): one named phase per responsibility,
 * in the exact pre-split order. It owns no rule of its own -- it sequences the
 * domain transitions above.
 */
export function processEspionageTurn(state: GameState, bus: EventBus): GameState {
  if (!state.espionage) return state;

  const turnSeed = `esp-turn-${state.turn}`;
  // #1201: authoritative mission consequences are collected during the per-civ loop
  // and applied here, by the turn itself, after `decaySpyUnrest` (where turn-manager.ts
  // used to apply them from the emitted events).
  const consequences: EspionageConsequence[] = [];

  for (const civId of Object.keys(state.espionage!)) {
    state = turnEligibleCapturedSpiesForCiv(state, civId, bus);

    state.espionage![civId] = pruneDetectedThreats(state.espionage![civId], state.turn);
    const civEspBefore: EspionageCivState = state.espionage![civId];
    const civBonus = resolveCivDefinition(state, state.civilizations[civId]?.civType ?? '')?.bonusEffect;
    const xpMultiplier = civBonus?.type === 'espionage_growth' ? 1 + civBonus.experienceBonus : 1;
    const spyTurnResult = processSpyTurn(civEspBefore, `${turnSeed}-${civId}`, xpMultiplier, { gameState: state, civId });
    const events = spyTurnResult.events;
    state.espionage![civId] = spyTurnResult.state;

    const eventOutcome = applySpyTurnEvents(state, civId, civEspBefore, spyTurnResult.state, events, bus, consequences);
    state = eventOutcome.state;
    state.espionage![civId] = eventOutcome.espionageCiv;

    state = recallSpiesFromLostTargets(state, civId, bus);
    state = autoExfiltrateDisplacedSpies(state, civId, bus);
    state = applyPassiveCaptureDetection(state, civId, bus);
    state = applyStationedSpyPassiveAbilities(state, civId, bus);
    state = refreshMaxSpies(state, civId);
  }

  state = decaySpyUnrest(state);
  return applyEspionageConsequences(state, consequences, bus);
}
