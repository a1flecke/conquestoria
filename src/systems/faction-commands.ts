// src/systems/faction-commands.ts
// #1246: the player/AI instant actions on unrest — Appease and Concede, with their costs. Self-contained:
// no pressure model, no relief ladder, no turn orchestration.
import type { GameState, City } from '../core/types';
import { TECH_TREE, resolveCivilizationEra } from './tech-definitions';

const GOLD_APPEASE_COST_PER_POP = 15;

// Concede (ideological concession) is priced as a multiple of the Appease cost.
// The civics-discounted multiplier MUST stay > 1 so Concede always costs strictly
// more than Appease and the two stay a real choice (#918). See
// .claude/rules/game-balance.md "Unrest Instant-Action Costs (Appease vs Concede)".
export const CONCESSION_COST_MULTIPLIER = 2;
export const CONCESSION_COST_MULTIPLIER_CIVICS = 1.5;
export const CONCESSION_IMMUNITY_TURNS = 15; // uprising: turns of no-new-unrest after conceding

export function getCityAppeaseCost(city: City): number {
  return city.population * GOLD_APPEASE_COST_PER_POP;
}

// Ideological concession (MR4, issue #354): a permanent resolution alongside gold
// appeasement. CONCESSION_COST_MULTIPLIER (2x) the appeasement cost, discounted to
// CONCESSION_COST_MULTIPLIER_CIVICS (1.5x) — but never to parity with Appease
// (#918) — if the owner has researched any civics-track tech of the *current* era
// (rewards civics investment without requiring a specific tech id, so future
// civics techs qualify automatically). The 1.5x floor keeps Concede strictly more
// expensive than Appease at every city size, so the two stay a real choice:
// Appease is the cheap, repeatable, once-per-turn stopgap that only suppresses;
// Concede is the pricier permanent fix (full clear + CONCESSION_IMMUNITY_TURNS of
// immunity to new unrest, including contagion).
export function getConcessionCost(state: GameState, city: City): number {
  const base = getCityAppeaseCost(city);
  const multiplier = hasCurrentEraCivicsTech(state, city.owner)
    ? CONCESSION_COST_MULTIPLIER_CIVICS
    : CONCESSION_COST_MULTIPLIER;
  return Math.round(base * multiplier);
}

function hasCurrentEraCivicsTech(state: GameState, civId: string): boolean {
  const civ = state.civilizations[civId];
  if (!civ) return false;
  const completed = new Set(civ.techState.completed);
  const civEra = resolveCivilizationEra(civ.techState.completed);
  return TECH_TREE.some(tech => tech.track === 'civics' && tech.era === civEra && completed.has(tech.id));
}

export function concedeToMovement(
  state: GameState,
  cityId: string,
  civId: string,
): { success: boolean; state: GameState; message: string } {
  const city = state.cities[cityId];
  if (!city || city.unrestLevel === 0) {
    return { success: false, state, message: 'This city has no unrest to concede to.' };
  }
  const cost = getConcessionCost(state, city);
  const civ = state.civilizations[civId];
  if (!civ || civ.gold < cost) {
    return { success: false, state, message: `Not enough gold — conceding to ${city.name} costs ${cost}.` };
  }
  return {
    success: true,
    message: `${city.name} granted a charter for ${cost} gold — immune to unrest for ${CONCESSION_IMMUNITY_TURNS} turns.`,
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: { ...civ, gold: civ.gold - cost },
      },
      cities: {
        ...state.cities,
        [cityId]: {
          ...city,
          unrestLevel: 0,
          unrestTurns: 0,
          spyUnrestBonus: 0,
          concessionImmunityUntilTurn: state.turn + CONCESSION_IMMUNITY_TURNS,
        },
      },
    },
  };
}

export function appeaseFaction(
  state: GameState,
  cityId: string,
  civId: string,
): { success: boolean; state: GameState; message: string } {
  const city = state.cities[cityId];
  if (!city || city.unrestLevel === 0) {
    return { success: false, state, message: 'This city has no unrest to appease.' };
  }
  if (city.appeasedOnTurn === state.turn) {
    return { success: false, state, message: 'This city has already been appeased this turn.' };
  }
  const cost = getCityAppeaseCost(city);
  const civ = state.civilizations[civId];
  if (!civ || civ.gold < cost) {
    return { success: false, state, message: `Not enough gold — appeasing ${city.name} costs ${cost}.` };
  }
  return {
    success: true,
    message: `${city.name} appeased for ${cost} gold.`,
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: { ...civ, gold: civ.gold - cost },
      },
      cities: {
        ...state.cities,
        [cityId]: {
          ...city,
          spyUnrestBonus: 0,
          unrestTurns: Math.max(0, city.unrestTurns - 2),
          unrestLevel: city.unrestLevel === 2 ? 1 : city.unrestLevel,
          appeasedOnTurn: state.turn,
        },
      },
    },
  };
}
