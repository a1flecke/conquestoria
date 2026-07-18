import type { GameState, Religion, ReligionBoon } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { seededLcg } from './seeded-lcg';
import { NAME_CANDIDATES, NEUTRAL_NAME_CANDIDATES } from './religion-definitions';
import { getCapitalCityId } from './capital-system';

function pickReligionName(civType: string, seed: number): string {
  const pool = NAME_CANDIDATES[civType] ?? NEUTRAL_NAME_CANDIDATES;
  const rng = seededLcg(seed);
  return pool[Math.floor(rng() * pool.length)];
}

export function foundReligion(
  state: GameState,
  civId: string,
  buildingCityId: string,
  bus: EventBus,
): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  const alreadyHasReligion = Object.values(state.religions ?? {}).some(r => r.ownerCivId === civId);
  if (alreadyHasReligion) return state;

  const religionId = `religion-${civId}`;
  const seed = state.turn * 92821 + civId.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) * 17;
  const name = pickReligionName(civ.civType, seed);

  const religion: Religion = { id: religionId, name, ownerCivId: civId, foundedTurn: state.turn };
  const capitalId = getCapitalCityId(state, civId);

  const cityFaith = { ...(state.cityFaith ?? {}) };
  cityFaith[buildingCityId] = { religionId, isHolyCity: true };
  if (capitalId && capitalId !== buildingCityId) {
    cityFaith[capitalId] = { religionId };
  }

  const nextState: GameState = {
    ...state,
    religions: { ...(state.religions ?? {}), [religionId]: religion },
    cityFaith,
  };
  bus.emit('religion:founded', { religionId, civId, cityId: buildingCityId, name });
  return nextState;
}

export function chooseBoon(state: GameState, religionId: string, boon: ReligionBoon): GameState {
  const religion = state.religions?.[religionId];
  if (!religion) return state;
  return { ...state, religions: { ...state.religions, [religionId]: { ...religion, boon } } };
}
