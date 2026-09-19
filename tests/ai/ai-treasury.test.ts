import { describe, expect, it, vi } from 'vitest';
import { applyAIGoldSpending } from '@/ai/ai-treasury';
import type { GameState, OpponentChallenge } from '@/core/types';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { foundCity } from '@/systems/city-system';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import * as roadNetwork from '@/systems/road-network';

/**
 * #1125 — `getCitiesConnectedToCapital` (`road-network.ts`) is called exactly
 * once per `calculateCivEconomy` invocation (from `projectCivGrossGold`'s call
 * inside it). It lives in a DIFFERENT module from `economy-system.ts`, so
 * `vi.spyOn` on it (unlike spying on `calculateCivEconomy` itself, which is
 * called from `getRushBuyQuote` in the SAME file and therefore invisible to an
 * external spy on that binding) gives an exact, cross-module-observable proxy
 * for how many times the whole-civ economy projection actually runs. See the
 * #1125 design doc's Task 0 finding for why `calculateCivEconomy` itself
 * cannot be spied on directly here.
 *
 * #1126 update: before #1126, `calculateCivEconomy` called `projectCivGrossGold`
 * TWICE per invocation (an unused base projection plus the real, pirate-modified
 * one), so this proxy's counts here used to be double what they are now. #1126
 * made the base projection lazy (computed only when a caller overrides
 * `grossGoldPerTurn`, which no production call site here does) -- see that
 * issue's fix in `economy-system.ts`. The counts below reflect the current,
 * fixed 1x-per-call shape.
 */
function countConnectivityChecks(fn: () => GameState): { result: GameState; calls: number } {
  let calls = 0;
  const orig = roadNetwork.getCitiesConnectedToCapital;
  const spy = vi.spyOn(roadNetwork, 'getCitiesConnectedToCapital').mockImplementation((...args) => {
    calls += 1;
    return orig(...args);
  });
  try {
    return { result: fn(), calls };
  } finally {
    spy.mockRestore();
  }
}

function setupState(
  cityIds = ['city-a'],
  options: { challenge?: OpponentChallenge } = {},
): GameState {
  const state = createNewGame({
    civType: 'generic',
    mapSize: 'small',
    opponentCount: 1,
    gameTitle: 'ai-treasury-test',
    opponentChallenge: options.challenge,
    seed: options.challenge
      ? `ai-treasury-${cityIds.join('-')}-${options.challenge}`
      : `ai-treasury-${cityIds.join('-')}`,
  });
  const civ = state.civilizations['ai-1']!;
  const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
  civ.cities = [];
  for (const [index, cityId] of cityIds.entries()) {
    const city = foundCity(
      civ.id,
      index === 0
        ? settler.position
        : { q: settler.position.q + index * 3, r: settler.position.r },
      state.map,
      state.idCounters,
    );
    city.id = cityId;
    city.population = 4;
    city.productionQueue = [];
    city.productionProgress = 0;
    state.cities[cityId] = city;
    civ.cities.push(cityId);
    for (const coord of [city.position, ...hexNeighbors(city.position)]) {
      const tile = state.map.tiles[hexKey(coord)];
      if (tile && (tile.terrain === 'coast' || tile.terrain === 'ocean')) {
        tile.terrain = 'plains';
      }
    }
  }
  civ.units = civ.units.filter(id => state.units[id]?.type !== 'settler');
  delete state.units[settler.id];
  return state;
}

describe('applyAIGoldSpending (#1094)', () => {
  it('rush-buys active production when gold comfortably exceeds the maintenance reserve', () => {
    const state = setupState();
    const civ = state.civilizations['ai-1']!;
    civ.gold = 5000;
    state.cities['city-a']!.productionQueue = ['warrior'];

    const result = applyAIGoldSpending(state, 'ai-1', new EventBus());

    expect(result.cities['city-a']!.productionQueue).toEqual([]);
    expect(result.civilizations['ai-1']!.gold).toBeLessThan(5000);
  });

  it('does nothing when the city has no active production', () => {
    const state = setupState();
    state.civilizations['ai-1']!.gold = 5000;
    state.cities['city-a']!.productionQueue = [];

    const result = applyAIGoldSpending(state, 'ai-1', new EventBus());

    expect(result.civilizations['ai-1']!.gold).toBe(5000);
  });

  it('does not spend below the maintenance reserve, but does once gold clears it', () => {
    // warrior costs 8 production; rushBuyMultiplier is 2.5, so rushing from 0
    // progress costs ceil(8 * 2.5) = 20. With population 1 (zero free building
    // slots) and one non-core building, building upkeep is a flat 1/turn, so
    // the 2-round reserve this module requires is 2. 21 gold covers the rush
    // cost but leaves only 1 in reserve (< 2) -- must not spend. 22 leaves
    // exactly 2 -- must spend.
    const belowReserve = setupState();
    belowReserve.cities['city-a']!.population = 1;
    belowReserve.cities['city-a']!.buildings.push('walls');
    belowReserve.cities['city-a']!.productionQueue = ['warrior'];
    belowReserve.civilizations['ai-1']!.gold = 21;
    const belowResult = applyAIGoldSpending(belowReserve, 'ai-1', new EventBus());
    expect(belowResult.civilizations['ai-1']!.gold).toBe(21);
    expect(belowResult.cities['city-a']!.productionQueue).toEqual(['warrior']);

    const atReserve = setupState();
    atReserve.cities['city-a']!.population = 1;
    atReserve.cities['city-a']!.buildings.push('walls');
    atReserve.cities['city-a']!.productionQueue = ['warrior'];
    atReserve.civilizations['ai-1']!.gold = 22;
    const atResult = applyAIGoldSpending(atReserve, 'ai-1', new EventBus());
    expect(atResult.civilizations['ai-1']!.gold).toBe(2);
    expect(atResult.cities['city-a']!.productionQueue).toEqual([]);
  });

  it('does not rush-buy when gold is short of the rush cost (delegated to getRushBuyQuote)', () => {
    const state = setupState();
    state.civilizations['ai-1']!.gold = 1;
    state.cities['city-a']!.productionQueue = ['warrior'];

    const result = applyAIGoldSpending(state, 'ai-1', new EventBus());

    expect(result.civilizations['ai-1']!.gold).toBe(1);
    expect(result.cities['city-a']!.productionQueue).toEqual(['warrior']);
  });

  it('rush-buys across multiple cities in one round while gold allows it', () => {
    const state = setupState(['city-a', 'city-b']);
    const civ = state.civilizations['ai-1']!;
    civ.gold = 5000;
    state.cities['city-a']!.productionQueue = ['warrior'];
    state.cities['city-b']!.productionQueue = ['worker'];

    const result = applyAIGoldSpending(state, 'ai-1', new EventBus());

    expect(result.cities['city-a']!.productionQueue).toEqual([]);
    expect(result.cities['city-b']!.productionQueue).toEqual([]);
  });

  it('never touches an unrelated civ or a human-owned city', () => {
    const state = setupState();
    state.civilizations['ai-1']!.gold = 5000;
    state.cities['city-a']!.productionQueue = ['warrior'];
    state.cities['city-a']!.owner = 'player';

    const result = applyAIGoldSpending(state, 'ai-1', new EventBus());

    expect(result.cities['city-a']!.productionQueue).toEqual(['warrior']);
    expect(result.civilizations['ai-1']!.gold).toBe(5000);
  });

  it('is a no-op for an unknown civ id', () => {
    const state = setupState();
    const result = applyAIGoldSpending(state, 'unknown-civ', new EventBus());
    expect(result).toBe(state);
  });
});

describe('applyAIGoldSpending economy-projection reuse (#1125)', () => {
  const FOUR_CITIES = ['city-a', 'city-b', 'city-c', 'city-d'];

  it('computes the whole-civ economy projection once per round, not once per producing city', () => {
    const state = setupState(FOUR_CITIES);
    state.civilizations['ai-1']!.gold = 0; // every quote is unavailable -- zero purchases
    for (const cityId of FOUR_CITIES) state.cities[cityId]!.productionQueue = ['warrior'];

    const { calls } = countConnectivityChecks(() => applyAIGoldSpending(state, 'ai-1', new EventBus()));

    // getCitiesConnectedToCapital runs exactly once per calculateCivEconomy call
    // (post-#1126: projectCivGrossGold's single real projection; the unused base
    // projection is no longer computed at all). One projection for the whole
    // round, zero purchases to invalidate it => exactly 1, not
    // FOUR_CITIES.length (4) as unmodified `getRushBuyQuote` would produce by
    // recomputing per producing city.
    expect(calls).toBe(1);
  });

  it('recomputes the projection only after a successful purchase invalidates it', () => {
    // gold=25 affords exactly ONE warrior rush on this 4-city fixture and
    // leaves nothing for a second (empirically confirmed against this exact
    // fixture shape -- 4 default-population cities, no extra buildings -- with
    // the values below), so exactly city-a succeeds and city-b/c/d are
    // correctly denied by getRushBuyQuote's own gold check.
    const state = setupState(FOUR_CITIES);
    state.civilizations['ai-1']!.gold = 25;
    for (const cityId of FOUR_CITIES) state.cities[cityId]!.productionQueue = ['warrior'];

    const { result, calls } = countConnectivityChecks(() => applyAIGoldSpending(state, 'ai-1', new EventBus()));

    expect(result.cities['city-a']!.productionQueue).toEqual([]);
    expect(result.cities['city-b']!.productionQueue).toEqual(['warrior']);
    expect(result.cities['city-c']!.productionQueue).toEqual(['warrior']);
    expect(result.cities['city-d']!.productionQueue).toEqual(['warrior']);
    expect(result.civilizations['ai-1']!.gold).toBe(0);
    // Pre-#1125 shape: city-a's outer check (1 calculateCivEconomy) + its
    // successful rushBuyActiveProduction (2 more, its own re-validation +
    // post-purchase economyStatusByCiv persistence, both deliberately
    // untouched by #1125 -- design doc §5d) = 3 calls; city-b/c/d each pay
    // their OWN outer-check call (1 each) = 3 more. Total 6 calculateCivEconomy
    // calls.
    //
    // Post-#1125: one batched projection covers city-a's outer check (1 call)
    // + city-a's own rushBuyActiveProduction cost (2 calls, unchanged) = 3,
    // THEN the purchase invalidates the batched projection so city-b's outer
    // check recomputes it fresh ONCE (1 call) -- correctly reflecting the
    // now-lower gold -- and city-c/d reuse THAT same still-valid projection
    // (0 more calls, since neither purchases). Total 4 calculateCivEconomy
    // calls (6 -> 4).
    //
    // Post-#1126: each calculateCivEconomy call now does exactly 1
    // getCitiesConnectedToCapital call instead of 2 (the unused base
    // projection is no longer computed). 4 calculateCivEconomy calls => 4
    // connectivity checks (was 8 before #1126).
    expect(calls).toBe(4);
  });

  it('does not recompute the projection for a city with no active production', () => {
    const state = setupState(FOUR_CITIES);
    state.civilizations['ai-1']!.gold = 0;
    state.cities['city-a']!.productionQueue = ['warrior'];
    // city-b/c/d stay empty -- applyAIGoldSpending must `continue` before ever
    // asking for a quote, so they must not contribute to the projection count.

    const { calls } = countConnectivityChecks(() => applyAIGoldSpending(state, 'ai-1', new EventBus()));

    expect(calls).toBe(1);
  });

  it.each<OpponentChallenge>(['explorer', 'standard', 'veteran'])(
    'gives every challenge tier the identical batching shape (%s)',
    (challenge) => {
      // Zero-purchase shape is exact and gold-arithmetic-independent (getRushBuyQuote
      // denies on `civ.gold < rushCost` before any yield/maintenance number matters),
      // so it isolates whether a challenge tier gets a different call-count shortcut
      // -- per `.claude/rules/game-balance.md`'s Production Cost Context section,
      // difficulty must change neither a production cost nor its legality.
      const state = setupState(FOUR_CITIES, { challenge });
      state.civilizations['ai-1']!.gold = 0;
      for (const cityId of FOUR_CITIES) state.cities[cityId]!.productionQueue = ['warrior'];

      const { calls } = countConnectivityChecks(() => applyAIGoldSpending(state, 'ai-1', new EventBus()));

      expect(calls).toBe(1);
    },
  );

  it.each(['rome', 'greece'])(
    'gives every civ personality/type the identical batching shape (%s)',
    (civType) => {
      // applyAIGoldSpending reads only civ.cities/gold and city.owner/productionQueue
      // -- never civ.civType or any personality-derived field -- so no civ type can
      // get a personality-specific performance shortcut. Same zero-purchase,
      // gold-arithmetic-independent shape as the difficulty parity test above.
      const state = createNewGame({
        civType, mapSize: 'small', opponentCount: 1, gameTitle: 'ai-treasury-personality-test',
        seed: `ai-treasury-personality-${civType}`,
      });
      const civ = state.civilizations['ai-1']!;
      const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
      civ.cities = [];
      for (const [index, cityId] of FOUR_CITIES.entries()) {
        const city = foundCity(
          civ.id,
          index === 0 ? settler.position : { q: settler.position.q + index * 3, r: settler.position.r },
          state.map,
          state.idCounters,
        );
        city.id = cityId;
        city.population = 4;
        city.productionQueue = ['warrior'];
        city.productionProgress = 0;
        state.cities[cityId] = city;
        civ.cities.push(cityId);
        for (const coord of [city.position, ...hexNeighbors(city.position)]) {
          const tile = state.map.tiles[hexKey(coord)];
          if (tile && (tile.terrain === 'coast' || tile.terrain === 'ocean')) tile.terrain = 'plains';
        }
      }
      civ.units = civ.units.filter(id => state.units[id]?.type !== 'settler');
      delete state.units[settler.id];
      civ.gold = 0;

      const { calls } = countConnectivityChecks(() => applyAIGoldSpending(state, 'ai-1', new EventBus()));

      expect(calls).toBe(1);
    },
  );

  it('behaves identically for an AI civ regardless of solo vs. hot-seat human seating', () => {
    // applyAIGoldSpending takes an explicit civId and never reads state.currentPlayer
    // (confirmed by reading its body -- no such reference exists), so hot-seat turn
    // cycling cannot leak into or out of this function. This regression proves it
    // rather than relying on that code-read claim alone.
    const solo = setupState(FOUR_CITIES);
    solo.civilizations['ai-1']!.gold = 25;
    for (const cityId of FOUR_CITIES) solo.cities[cityId]!.productionQueue = ['warrior'];
    const soloResult = applyAIGoldSpending(solo, 'ai-1', new EventBus());

    const hotSeat = createHotSeatGame(
      {
        playerCount: 2,
        mapSize: 'small',
        players: [
          { name: 'Player 1', slotId: 'player-1', civType: 'generic', isHuman: true },
          { name: 'Player 2', slotId: 'player-2', civType: 'generic', isHuman: true },
        ],
      },
      'ai-treasury-hotseat',
    );
    // Graft an AI civ onto the hot-seat state using the exact same city/gold shape
    // as the solo case, so the only difference between the two runs is hotSeat
    // config + an extra human civ existing alongside -- not a different economy.
    hotSeat.civilizations['ai-1'] = solo.civilizations['ai-1'];
    for (const cityId of FOUR_CITIES) hotSeat.cities[cityId] = solo.cities[cityId]!;
    hotSeat.currentPlayer = 'player-1';
    const hotSeatResult = applyAIGoldSpending(hotSeat, 'ai-1', new EventBus());

    for (const cityId of FOUR_CITIES) {
      expect(hotSeatResult.cities[cityId]!.productionQueue).toEqual(soloResult.cities[cityId]!.productionQueue);
    }
    expect(hotSeatResult.civilizations['ai-1']!.gold).toBe(soloResult.civilizations['ai-1']!.gold);
  });
});
