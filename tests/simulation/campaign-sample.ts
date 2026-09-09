/**
 * #1005 — one round's worth of a long-horizon campaign, reduced to PLAIN DATA.
 *
 * `runAICampaign` (ai-playability-fixture.ts) calls `buildCampaignRoundSample`
 * once per completed round and hands the result to the caller's `observe`
 * callback. The observer NEVER sees `GameState`: everything the long-horizon
 * suite reasons about is a scalar, a string, or an array of those. That is what
 * makes the campaign report deterministic by construction, and what makes it
 * structurally impossible for the analysis layer to perturb the simulation.
 *
 * This module is deliberately NOT under `tests/simulation/long-horizon/` (the
 * excluded directory): the fixture that produces samples lives in the ordinary
 * suite, so the sample type has to as well. It is types + one pure function, no
 * `.test.ts`, so nothing collects it.
 */
import type { GameState, UnitType } from '@/core/types';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { getAvailableTechs } from '@/systems/tech-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

/** Cumulative, per-civ counters the fixture accrues from the round's event bus. */
export interface CampaignCivCounters {
  capturesMade: number;
  capturesSuffered: number;
  peaceEventsInvolvingCiv: number;
  warDeclarationsInvolvingCiv: number;
}

export function emptyCivCounters(): CampaignCivCounters {
  return {
    capturesMade: 0,
    capturesSuffered: 0,
    peaceEventsInvolvingCiv: 0,
    warDeclarationsInvolvingCiv: 0,
  };
}

export interface CampaignCivSample extends CampaignCivCounters {
  civId: string;
  isHuman: boolean;
  isEliminated: boolean;
  living: boolean;
  cities: number;
  population: number;
  units: number;
  settlers: number;
  workers: number;
  completedTechs: number;
  civEra: number;
  hasCurrentResearch: boolean;
  availableTechCount: number;
  gold: number;
  citiesWithEmptyQueue: number;
  atWarWith: string[];
  activePlanCount: number;
  /** max over this civ's live plans of (state.turn - plan.lastProgressTurn) */
  maxPlanNoProgressRounds: number;
}

export interface CampaignRoundSample {
  round: number;
  turn: number;
  era: number;
  gameOver: boolean;
  winner: string | null;
  gameOverReason: string | null;
  minorCivCount: number;
  barbarianCampCount: number;
  totalUnits: number;
  totalCities: number;
  /** JSON length of the state as it entered this round — reuses the fixture's mutation-check string. */
  stateBytesBeforeRound: number;
  /** cumulative across the whole run so far (fixture-tracked) */
  planProgressTransitions: number;
  civs: CampaignCivSample[];
}

function isWorkerUnitType(type: string): boolean {
  const definition = UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS];
  return Boolean(definition?.canBuildImprovements);
}

/**
 * Reduce one completed round to a `CampaignRoundSample`. Pure: reads `state`,
 * never mutates it, returns only plain data.
 *
 * @param stateBytesBeforeRound  `beforeInput.length` from the fixture's existing
 *   mutation check — passed in so this never adds a third `JSON.stringify`.
 */
export function buildCampaignRoundSample(
  round: number,
  state: GameState,
  stateBytesBeforeRound: number,
  planProgressTransitions: number,
  countersByCiv: ReadonlyMap<string, CampaignCivCounters>,
): CampaignRoundSample {
  const civs: CampaignCivSample[] = Object.values(state.civilizations)
    .map(civ => {
      const ownedCityIds = civ.cities.filter(id => state.cities[id]?.owner === civ.id);
      const ownedUnitIds = civ.units.filter(id => state.units[id]?.owner === civ.id);
      const unitTypes: UnitType[] = ownedUnitIds
        .map(id => state.units[id]?.type)
        .filter((type): type is UnitType => type !== undefined);
      const plans = [
        ...(state.opponentAI?.majorCivs?.[civ.id]?.primaryPlan
          ? [state.opponentAI.majorCivs[civ.id]!.primaryPlan!]
          : []),
        ...Object.values(state.opponentAI?.majorCivs?.[civ.id]?.defensePlansByCityId ?? {}),
      ];
      const counters = countersByCiv.get(civ.id) ?? emptyCivCounters();
      return {
        civId: civ.id,
        isHuman: Boolean(civ.isHuman),
        isEliminated: Boolean(civ.isEliminated),
        living: getCivilizationLiveness(state, civ.id).living,
        cities: ownedCityIds.length,
        population: ownedCityIds.reduce(
          (sum, id) => sum + (state.cities[id]?.population ?? 0),
          0,
        ),
        units: ownedUnitIds.length,
        settlers: unitTypes.filter(type => type === 'settler').length,
        workers: unitTypes.filter(isWorkerUnitType).length,
        completedTechs: civ.techState.completed.length,
        civEra: resolveCivilizationEra(civ.techState.completed),
        hasCurrentResearch: Boolean(civ.techState.currentResearch),
        availableTechCount: getAvailableTechs(civ.techState).length,
        gold: Math.round(civ.gold),
        citiesWithEmptyQueue: ownedCityIds.filter(
          id => (state.cities[id]?.productionQueue.length ?? 0) === 0,
        ).length,
        atWarWith: [...(civ.diplomacy?.atWarWith ?? [])].sort(),
        activePlanCount: plans.length,
        maxPlanNoProgressRounds: plans.reduce(
          (max, plan) => Math.max(max, state.turn - plan.lastProgressTurn),
          0,
        ),
        ...counters,
      };
    })
    .sort((a, b) => a.civId.localeCompare(b.civId));

  return {
    round,
    turn: state.turn,
    era: state.era,
    gameOver: Boolean(state.gameOver),
    winner: state.winner ?? null,
    gameOverReason: state.gameOverReason ?? null,
    minorCivCount: Object.keys(state.minorCivs ?? {}).length,
    barbarianCampCount: Object.keys(state.barbarianCamps ?? {}).length,
    totalUnits: Object.keys(state.units).length,
    totalCities: Object.keys(state.cities).length,
    stateBytesBeforeRound,
    planProgressTransitions,
    civs,
  };
}
