import type { Civilization, HexCoord, Unit } from '@/core/types';
import { getEmpireFlatTechYields } from '@/systems/tech-yield-system';
import { resolveCivDefinition } from '@/systems/civ-registry';

/**
 * The facts of one civilization's visit in the per-civ phase, captured once by `startCivTurn` and read by every
 * later step. `civ` and `currentCivState` are deliberately two different snapshots: `civ` is the record the visit
 * began with (the round iterates `Object.entries` of the roster once), `currentCivState` is the record after the
 * start-of-turn systems have run. Steps read each where the loop always did, so neither is "refreshed".
 */
export interface CivTurn {
  readonly civId: string;
  readonly civ: Civilization;
  readonly currentCivState: Civilization;
  readonly civDef: ReturnType<typeof resolveCivDefinition>;
  /** Units that existed before this turn's production created any (gene-therapy recharge reads only these). */
  readonly unitIdsAtTurnStart: string[];
}

/**
 * Gold and science accumulated while one civ's cities produce. `totalGold` is the single running figure the later
 * steps adjust in a fixed order (drain, network plans, bonuses, upkeep, tribute, remittance) before it is credited to
 * `grossGoldByCiv`; the other fields are written once by city production and only read afterwards.
 */
export interface CivIncome {
  totalGold: number;
  readonly authoritativeCityScience: Record<string, number>;
  readonly baseGoldByCityId: Record<string, number>;
  readonly empireFlatTechYields: ReturnType<typeof getEmpireFlatTechYields>;
}

/** The civ's units and city positions as they stood after standing orders ran, for diplomacy and vision. */
export interface CivRoster {
  readonly civUnits: Unit[];
  readonly cityPositions: HexCoord[];
}
