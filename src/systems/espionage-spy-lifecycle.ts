import type {
  DisguiseType,
  EspionageCivState,
  EspionageState,
  FalseReportKind,
  FalseReportRef,
  HexCoord,
  Spy,
  SpyMissionType,
  SpyPromotion,
  UnitType,
} from '@/core/types';
import { createRng } from './map-generator';
import {
  HANDLER_MISSIONS,
  INFILTRATOR_MISSIONS,
  PROMOTION_XP_THRESHOLD,
  SPY_NAMES,
  DEBRIEF_TURNS,
  getDebriefDenial,
  type DebriefDenialReason,
} from './espionage-catalog';
export { DEBRIEF_DENIAL_MESSAGES, DEBRIEF_TURNS, getDebriefDenial } from './espionage-catalog';
export type { DebriefDenialReason } from './espionage-catalog';
import { getInfiltrationSuccessChance } from './espionage-probability';
import { setCounterIntelligence } from './espionage-counterintel';

/**
 * Spy lifecycle transitions (#1009): creation, disguise, embed/unembed, recall,
 * cleanup, promotion and infiltration. Each function is a pure
 * `EspionageCivState -> EspionageCivState` (or payload) transition; turn
 * orchestration lives in `espionage-turn.ts`.
 */
export function createSpyFromUnit(
  state: EspionageCivState,
  unitId: string,
  owner: string,
  unitType: UnitType,
  seed: string,
): { state: EspionageCivState; spy: Spy } {
  const rng = createRng(seed);
  const nameIndex = Math.floor(rng() * SPY_NAMES.length);
  const spy: Spy = {
    id: unitId,
    owner,
    name: `Agent ${SPY_NAMES[nameIndex]}`,
    unitType,
    targetCivId: null,
    targetCityId: null,
    position: null,
    status: 'idle',
    experience: 0,
    currentMission: null,
    cooldownTurns: 0,
    promotion: undefined,
    promotionAvailable: false,
    feedsFalseIntel: false,
    disguiseAs: null,
    infiltrationCityId: null,
    cityVisionTurnsLeft: 0,
    stolenTechFrom: {},
  };
  return {
    state: { ...state, spies: { ...state.spies, [unitId]: spy } },
    spy,
  };
}

export function setDisguise(
  state: EspionageCivState,
  spyId: string,
  disguiseAs: DisguiseType | null,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);
  if (spy.status !== 'idle') throw new Error('Disguise can only be set while spy is on the map (idle)');
  return {
    ...state,
    spies: { ...state.spies, [spyId]: { ...spy, disguiseAs } },
  };
}

export function cleanupDeadSpyUnit(
  espionage: EspionageState,
  owner: string,
  unitId: string,
): EspionageState {
  const civEsp = espionage[owner];
  if (!civEsp?.spies[unitId]) return espionage;
  const { [unitId]: _removed, ...remainingSpies } = civEsp.spies;
  return {
    ...espionage,
    [owner]: { ...civEsp, spies: remainingSpies },
  };
}

export function embedSpy(
  state: EspionageCivState,
  spyId: string,
  cityId: string,
  cityPosition: HexCoord,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'idle') throw new Error('Spy must be idle to embed');
  const baseCi = 15;
  const expBonus = Math.floor(spy.experience * 0.3);
  const newCi = (state.counterIntelligence[cityId] ?? 0) + baseCi + expBonus;
  const withCi = setCounterIntelligence(state, cityId, newCi);
  return {
    ...withCi,
    spies: {
      ...withCi.spies,
      [spyId]: { ...spy, status: 'embedded', targetCityId: cityId, position: { ...cityPosition } },
    },
  };
}

export function unembedSpy(
  state: EspionageCivState,
  spyId: string,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'embedded') return state;
  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: { ...spy, status: 'cooldown', cooldownTurns: 5, targetCityId: null },
    },
  };
}

export function recallSpy(
  state: EspionageCivState,
  spyId: string,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);
  if (spy.status === 'embedded') return state; // embedded spies must use unembedSpy
  // Recalling abandons a debrief in progress.
  const { debriefUntilTurn: _abandonedDebrief, ...rest } = spy;

  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...rest,
        status: 'idle',
        targetCivId: null,
        targetCityId: null,
        position: null,
        currentMission: null,
      },
    },
  };
}

export function checkAndApplyPromotion(
  spy: Spy,
  lastMissionType: SpyMissionType,
): Spy {
  if (spy.promotion !== undefined) return spy;          // already promoted
  if (spy.experience < PROMOTION_XP_THRESHOLD) return spy;

  let promotion: SpyPromotion;
  if (INFILTRATOR_MISSIONS.has(lastMissionType)) {
    promotion = 'infiltrator';
  } else if (HANDLER_MISSIONS.has(lastMissionType)) {
    promotion = 'handler';
  } else {
    promotion = 'sentinel';
  }

  return { ...spy, promotion, promotionAvailable: false };
}

export type DebriefResult =
  | { ok: true; state: EspionageCivState }
  | { ok: false; state: EspionageCivState; reason: DebriefDenialReason };

/**
 * Start a debrief: the spy stops working for `DEBRIEF_TURNS` turns, then the espionage turn checks whether it was
 * turned. Offered on every stationed spy, so the offer itself says nothing about the spy (the old instant
 * "verify agent" button appeared only on a turned spy, which gave the secret away).
 */
export function startDebrief(state: EspionageCivState, spyId: string, turn: number): DebriefResult {
  const denial = getDebriefDenial(state, spyId);
  if (denial) return { ok: false, state, reason: denial };
  const spy = state.spies[spyId];
  return {
    ok: true,
    state: { ...state, spies: { ...state.spies, [spyId]: { ...spy, debriefUntilTurn: turn + DEBRIEF_TURNS } } },
  };
}

/** Chance a debrief exposes a turned spy; a Sentinel (counter-intelligence) spy is harder to fool. */
export const DEBRIEF_EXPOSE_CHANCE = 0.75;
export const DEBRIEF_EXPOSE_CHANCE_SENTINEL = 0.9;

export function getDebriefExposeChance(spy: Pick<Spy, 'promotion'>): number {
  return spy.promotion === 'sentinel' ? DEBRIEF_EXPOSE_CHANCE_SENTINEL : DEBRIEF_EXPOSE_CHANCE;
}

type ReportRng = () => number;

/**
 * A double agent's reports lie, its missions do not (a lie misleads, it never secretly wrecks a plan). Each lie is
 * a plausible distortion of the real figure, never an invention from nothing: a sighting list is halved or doubled,
 * a count or a treasury is scaled, relations are turned around, half the resources go unreported.
 */
export function falsifyUnitSightings<T>(units: readonly T[], rng: ReportRng): T[] {
  if (rng() < 0.5) return units.filter((_, index) => index % 2 === 0 && index < units.length - 1);
  return units.flatMap(unit => [unit, unit]);
}

export function falsifyFigure(value: number, rng: ReportRng): number {
  return Math.max(0, Math.round(value * (rng() < 0.5 ? 0.5 : 2)));
}

export function falsifyRelationships(relationships: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(relationships).map(([civId, score]) => [civId, -score]));
}

export function falsifyResources(resources: readonly string[], rng: ReportRng): string[] {
  return resources.filter(() => rng() < 0.5);
}

export function recordFalseReport(state: EspionageCivState, spyId: string, ref: FalseReportRef): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) return state;
  const falseReports = [...(spy.falseReports ?? []).filter(r => !(r.kind === ref.kind && r.key === ref.key)), ref];
  return { ...state, spies: { ...state.spies, [spyId]: { ...spy, falseReports } } };
}

function withoutReport<T extends { turn: number }>(
  reports: Record<string, T> | undefined,
  key: string,
  turn: number,
): Record<string, T> | undefined {
  if (!reports || reports[key]?.turn !== turn) return reports;
  const { [key]: _struck, ...rest } = reports;
  return rest;
}

const REPORT_FIELD: Record<FalseReportKind, 'troopObservations' | 'intelReports' | 'resourceReports' | 'diplomacyReports' | 'signalsIntelligence'> = {
  troops: 'troopObservations',
  intel: 'intelReports',
  resources: 'resourceReports',
  diplomacy: 'diplomacyReports',
  signals: 'signalsIntelligence',
};

export interface DebriefOutcome {
  state: EspionageCivState;
  /** Set when the debrief exposed a double agent. */
  exposed?: { captorCivId: string; falseReportCount: number; turnsTurned: number };
}

/**
 * Finish a debrief. `exposeRoll` is the one draw that decides it; a spy that was never turned always comes back
 * clean, so the result can only ever be a true exposure or "found nothing". An exposed spy is honest from now on
 * and every report it falsified that has not since been replaced is struck from the owner's files.
 */
export function finishDebrief(state: EspionageCivState, spyId: string, turn: number, exposeRoll: number): DebriefOutcome {
  const spy = state.spies[spyId];
  if (!spy) return { state };
  const { debriefUntilTurn: _done, ...rest } = spy;
  if (!spy.turnedBy || exposeRoll >= getDebriefExposeChance(spy)) {
    return { state: { ...state, spies: { ...state.spies, [spyId]: { ...rest, lastDebriefTurn: turn } } } };
  }
  let next: EspionageCivState = state;
  const falseReports = spy.falseReports ?? [];
  for (const ref of falseReports) {
    const field = REPORT_FIELD[ref.kind];
    next = { ...next, [field]: withoutReport(next[field] as Record<string, { turn: number }> | undefined, ref.key, ref.turn) };
  }
  const { turnedBy: _captor, feedsFalseIntel: _lying, turnedOnTurn, falseReports: _struck, ...honest } = rest;
  return {
    state: { ...next, spies: { ...next.spies, [spyId]: { ...honest, feedsFalseIntel: false, lastDebriefTurn: turn } } },
    exposed: { captorCivId: spy.turnedBy, falseReportCount: falseReports.length, turnsTurned: Math.max(0, turn - (turnedOnTurn ?? turn)) },
  };
}

export interface InfiltrationResult {
  civEsp: EspionageCivState;
  removeUnitFromMap: boolean;
  caught: boolean;
  era1ScoutResult?: { tilesToReveal: HexCoord[] };
}

const INFILTRATION_FAIL_COOLDOWN = 3;
const INFILTRATION_CATCH_CHANCE = 0.25;

export function attemptInfiltration(
  state: EspionageCivState,
  spyId: string,
  unitType: UnitType,
  targetCityId: string,
  targetPosition: HexCoord,
  cityCI: number,
  seed: string,
): InfiltrationResult {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'idle') throw new Error(`Spy ${spyId} cannot infiltrate (not idle)`);

  const rng = createRng(seed);
  const chance = getInfiltrationSuccessChance(unitType, spy.experience, cityCI);
  const roll = rng();

  if (roll < chance) {
    const era1 = unitType === 'spy_scout';
    // #1693: a successful infiltration always embeds the spy off the map, including the
    // era-1 scout. A scout left on the map could share its target city's tile with a unit
    // the city later completes (e.g. a naval unit in port), producing an illegal
    // mixed-owner stack (`assertNoIllegalBlockingOccupancy`). The espionage record is the
    // spy from here on, exactly as for every other type; the scout still receives the
    // era-1 result and city vision.
    const updatedSpy: Spy = {
      ...spy,
      status: 'stationed',
      infiltrationCityId: targetCityId,
      cityVisionTurnsLeft: 5,
      cooldownTurns: 0,
      position: { ...targetPosition },
      experience: Math.min(100, spy.experience + 5),
    };
    return {
      civEsp: { ...state, spies: { ...state.spies, [spyId]: updatedSpy } },
      removeUnitFromMap: true,
      caught: false,
      era1ScoutResult: era1 ? { tilesToReveal: [] } : undefined,
    };
  } else {
    const catchRoll = rng();
    const caught = catchRoll < INFILTRATION_CATCH_CHANCE;
    const updatedSpy: Spy = {
      ...spy,
      status: caught ? 'captured' : 'cooldown',
      cooldownTurns: caught ? 0 : INFILTRATION_FAIL_COOLDOWN,
      cooldownMode: caught ? undefined : 'stay_low',
    };
    return {
      civEsp: { ...state, spies: { ...state.spies, [spyId]: updatedSpy } },
      removeUnitFromMap: false,
      caught,
    };
  }
}
