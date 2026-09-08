import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { generateSummary } from '@/core/hotseat-events';
import { setMinorCivWarState } from '@/systems/minor-civ-actions';
import { processMinorCivCoalitionsTurn } from '@/systems/minor-civ-coalition-system';
import { declareMajorWar } from '@/systems/diplomacy-system';
import { evaluateVassalageConsent } from '@/ai/ai-treaty-consent';
import { majorCivWarOpponentIds } from '@/core/owner-kind';
import { getUnrestPressureBreakdown } from '@/systems/faction-system';
import { getUnrestRecommendations } from '@/systems/unrest-guidance';
import { foundCityInState } from '@/systems/city-founding-system';
import { normalizeLoadedState } from '@/storage/save-manager';
import { createHotSeatGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';

// #1041 — the player was shown "War weariness: +24 / you're at war with 3 empires
// (Diplomacy screen)" while the Diplomacy screen listed zero major-civ wars. The
// three phantom "empires" were city-states: minor-civ war state (direct wars and
// coalition wars) rides the same `atWarWith` array as major-civ wars, and the
// war-weariness unrest row plus its make-peace guidance counted the raw array.
//
// War weariness / "at war with N empires" is a MAJOR-civ concept. City-state
// conflict is modelled by the minor-civ grievance / coalition systems.

// createNewGame starts the player with a settler, not a city.
function withPlayerCity(state: ReturnType<typeof createNewGame>): {
  state: ReturnType<typeof createNewGame>;
  cityId: string;
} {
  const settlerId = state.civilizations.player.units.find(id => state.units[id]?.type === 'settler');
  if (!settlerId) throw new Error('player has no settler');
  const founded = foundCityInState(state, settlerId, new EventBus());
  return { state: founded.state as ReturnType<typeof createNewGame>, cityId: founded.cityId };
}

function threeMinorCivIds(state: ReturnType<typeof createNewGame>): string[] {
  const ids = Object.keys(state.minorCivs).filter(id => !state.minorCivs[id].isDestroyed);
  if (ids.length < 3) throw new Error(`need >=3 minor civs, got ${ids.length}`);
  return ids.slice(0, 3);
}

describe('#1041 war weariness counts major-civ wars only', () => {
  it('city-state wars do not add a War weariness unrest row', () => {
    let { state, cityId } = withPlayerCity(createNewGame(undefined, '1041-minor-only', 'small'));

    // baseline: no War weariness row
    expect(getUnrestPressureBreakdown(cityId, state).find(r => r.label === 'War weariness'))
      .toBeUndefined();

    for (const mcId of threeMinorCivIds(state)) {
      const result = setMinorCivWarState(state, 'player', mcId, true);
      expect(result.ok).toBe(true);
      state = result.state;
    }

    // three real city-state wars are now on player.diplomacy.atWarWith
    expect(state.civilizations.player.diplomacy.atWarWith).toHaveLength(3);

    const rows = getUnrestPressureBreakdown(cityId, state);
    expect(rows.find(r => r.label === 'War weariness')).toBeUndefined();
  });

  it('unrest guidance does not tell the player they are at war with N empires for city-state wars', () => {
    let { state, cityId } = withPlayerCity(createNewGame(undefined, '1041-guidance', 'small'));
    for (const mcId of threeMinorCivIds(state)) {
      state = setMinorCivWarState(state, 'player', mcId, true).state;
    }

    const recs = getUnrestRecommendations(cityId, state);
    expect(recs.find(r => r.kind === 'make-peace')).toBeUndefined();
    expect(recs.find(r => r.rowLabel === 'War weariness')).toBeUndefined();
  });

  // The screenshots in #1041 are most consistent with a minor-civ *coalition*
  // war; setMinorCivWarState and activateCoalitionWar funnel through the exact
  // same declareWar(major.diplomacy, mcId) mutation, so this drives the other
  // real entry path to the identical atWarWith contents.
  it('a minor-civ coalition war produces no War weariness row', () => {
    let { state, cityId } = withPlayerCity(createNewGame(undefined, '1041-coalition', 'small'));
    const members = threeMinorCivIds(state);
    state = {
      ...state,
      minorCivCoalitions: {
        'coalition-1': {
          id: 'coalition-1', targetCivId: 'player', memberIds: members,
          status: 'forming', createdTurn: state.turn, updatedTurn: state.turn,
          cooldownUntilTurn: state.turn,
        },
      },
    };
    state = processMinorCivCoalitionsTurn(state) as typeof state;

    expect(state.minorCivCoalitions?.['coalition-1'].status).toBe('active');
    expect(state.civilizations.player.diplomacy.atWarWith).toEqual(expect.arrayContaining(members));
    expect(getUnrestPressureBreakdown(cityId, state).find(r => r.label === 'War weariness'))
      .toBeUndefined();
  });

  it('the hot-seat handoff summary omits city-state war ids', () => {
    let state = createNewGame(undefined, '1041-handoff', 'small');
    for (const mcId of threeMinorCivIds(state)) {
      state = setMinorCivWarState(state, 'player', mcId, true).state;
    }
    expect(generateSummary(state, 'player').atWarWith).toEqual([]);
  });

  it('a real major-civ war still produces war weariness and make-peace guidance', () => {
    let { state, cityId } = withPlayerCity(createNewGame(undefined, '1041-major-war', 'small'));
    const otherMajorId = Object.keys(state.civilizations).find(id => id !== 'player');
    if (!otherMajorId) throw new Error('need a second major civ');

    // mix a real major war with two city-state wars — only the major one counts
    state = declareMajorWar(state, 'player', otherMajorId, new EventBus());
    for (const mcId of threeMinorCivIds(state).slice(0, 2)) {
      state = setMinorCivWarState(state, 'player', mcId, true).state;
    }

    const rows = getUnrestPressureBreakdown(cityId, state);
    expect(rows.find(r => r.label === 'War weariness')?.amount).toBe(8);

    const makePeace = getUnrestRecommendations(cityId, state).find(r => r.kind === 'make-peace');
    expect(makePeace).toBeDefined();
    expect((makePeace?.params as { warCivIds: string[] }).warCivIds).toEqual([otherMajorId]);

    expect(generateSummary(state, 'player').atWarWith).toEqual([otherMajorId]);
  });

  it('save/load continuity: a save carrying mc- war ids computes no War weariness after reload', () => {
    let { state, cityId } = withPlayerCity(createNewGame(undefined, '1041-save-load', 'small'));
    for (const mcId of threeMinorCivIds(state)) {
      state = setMinorCivWarState(state, 'player', mcId, true).state;
    }
    const reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)) as GameState);

    // the city-state war ids are legitimate data — not scrubbed on load
    expect(reloaded.civilizations.player.diplomacy.atWarWith).toHaveLength(3);
    // ...but they still produce no imperial war weariness after a round-trip
    expect(getUnrestPressureBreakdown(cityId, reloaded).find(r => r.label === 'War weariness'))
      .toBeUndefined();
    expect(generateSummary(reloaded, 'player').atWarWith).toEqual([]);
  });

  it('hot seat: filtering is owner-scoped, not viewer-scoped', () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    }, '1041-hotseat');

    // Alice is at war with a city-state; Bob is at war with a major civ.
    const mcId = Object.keys(state.minorCivs)[0];
    state.civilizations['player-1'].diplomacy.atWarWith = [mcId];
    state.civilizations['player-2'].diplomacy.atWarWith = ['player-1'];
    state.civilizations['player-1'].diplomacy.atWarWith.push('player-2');

    expect(generateSummary(state, 'player-1').atWarWith).toEqual(['player-2']);
    expect(generateSummary(state, 'player-2').atWarWith).toEqual(['player-1']);
  });

  it('#1041 sweep: AI vassalage-consent load signal counts major wars only', () => {
    // proposeVassalage() feeds evaluateVassalageConsent a `warCount` that used to
    // be raw atWarWith.length; it now routes through majorCivWarOpponentIds. This
    // pins that composition — evaluateVassalageConsent's own boundary
    // (warCount <= 1) is fixed by tests/ai/ai-treaty-consent.test.ts.
    const base = { relationship: 0, diplomacyFocus: 0.5, militaryCount: 4, vassalCount: 0 };
    expect(evaluateVassalageConsent({
      ...base, warCount: majorCivWarOpponentIds(['mc-a', 'mc-b', 'mc-c']).length,
    }).accepted).toBe(true);
    expect(evaluateVassalageConsent({
      ...base, warCount: majorCivWarOpponentIds(['ai-9', 'ai-8']).length,
    }).accepted).toBe(false);
  });
});
