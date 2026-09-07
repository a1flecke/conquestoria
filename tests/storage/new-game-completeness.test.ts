import { describe, it, expect } from 'vitest';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
import { normalizeLoadedState } from '@/storage/save-manager';
import { CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';
import type { GameState, HotSeatConfig } from '@/core/types';

/**
 * main.ts's migrateLegacySave() ran on brand-new HOT-SEAT games (createHotSeatGame
 * -> enterCampaign -> migrate) but not on brand-new SOLO games, which called
 * startGame() directly. So the two new-game paths did not provably produce the
 * same state shape, and nothing tested that they did. #787 phase 1 deleted that
 * function; these tests are what replaces the guarantee.
 *
 * #1004: createNewGame / createHotSeatGame now stamp `saveSchemaVersion` with
 * CURRENT_SAVE_SCHEMA_VERSION. Previously they left it undefined, so a fresh
 * state read as version 0 and `normalizeLoadedState` replayed the ENTIRE 1..N
 * historical migration chain over a brand-new current-schema game — which is
 * exactly what broke same-seed save/reload determinism (a fresh game's first
 * autosave silently ran placeLateResources, the v24 research-cost retime, etc.).
 * A new game IS current, so now only the unconditional normalizers touch it on
 * load. The ratchet below pins that (now much smaller) set.
 */

const SOLO = (): GameState => createNewGame({
  civType: 'generic',
  mapSize: 'small',
  opponentCount: 2,
  gameTitle: 'solo completeness',
  seed: 'new-game-completeness-solo',
});

const HOT_SEAT_CONFIG: HotSeatConfig = {
  playerCount: 2,
  mapSize: 'small',
  players: [
    { slotId: 'player-1', name: 'A', civType: 'generic', isHuman: true },
    { slotId: 'player-2', name: 'B', civType: 'generic', isHuman: true },
  ],
};

const HOT_SEAT = (): GameState => createHotSeatGame(HOT_SEAT_CONFIG, undefined, 'hot seat completeness', 'standard');

describe('freshly created games need no legacy fixups', () => {
  for (const [label, make] of [['solo', SOLO], ['hot seat', HOT_SEAT]] as const) {
    it(`${label}: is stamped at the current schema, so load runs no numbered migration`, () => {
      const state = make();
      expect(state.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);

      const normalized = normalizeLoadedState(structuredClone(state));
      expect(normalized.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    });

    it(`${label}: no unconditional normalizer overwrites anything a fresh game already set`, () => {
      const state = make();
      const normalized = normalizeLoadedState(structuredClone(state));

      // Beasts: a fresh game already has its lairs placed, so the legacy
      // migrationPending flag must NOT be set -- setting it would make
      // processTurn re-place lairs on the first tick of a brand-new game.
      expect(normalized.beasts!.migrationPending).toBeUndefined();
      expect(normalized.beasts!.lairs).toEqual(state.beasts!.lairs);
      expect(normalized.beasts!.mode).toBe(state.beasts!.mode);

      expect(normalized.marketplace!.tradeRoutes).toEqual(state.marketplace!.tradeRoutes);
      expect(normalized.legendaryWonderHistory!.destroyedStrongholds)
        .toEqual(state.legendaryWonderHistory!.destroyedStrongholds);
      expect(normalized.legendaryWonderHistory!.discoveredSites)
        .toEqual(state.legendaryWonderHistory!.discoveredSites);
      expect(normalized.legendaryWonderIntel).toEqual(state.legendaryWonderIntel);
      expect(normalized.tribalVillages).toEqual(state.tribalVillages);
      expect(normalized.discoveredWonders).toEqual(state.discoveredWonders);
      expect(normalized.wonderDiscoverers).toEqual(state.wonderDiscoverers);
      expect(normalized.settings.advisorsEnabled).toEqual(state.settings.advisorsEnabled);

      // minorCivs is `??= {}` only. The roster must survive intact -- a
      // clobbering migration would silently delete every minor civ. (The per-civ
      // `economy` block that normalizeMinorCivEconomyState adds on load is a
      // pre-existing normalizer, not part of this phase; see the ratchet below.)
      expect(Object.keys(normalized.minorCivs).sort()).toEqual(Object.keys(state.minorCivs).sort());

      for (const [civId, civ] of Object.entries(normalized.civilizations)) {
        const original = state.civilizations[civId];
        expect(civ.civType, civId).toBe(original.civType);
        expect(civ.diplomacy, civId).toEqual(original.diplomacy);
        expect(civ.techState.trackPriorities, civId).toEqual(original.techState.trackPriorities);
        expect(civ.knownCivilizations, civId).toEqual(original.knownCivilizations);
      }
    });
  }

  it('both new-game paths agree on the fields the deleted migrateLegacySave used to backfill', () => {
    // The actual defect migrateLegacySave was hiding: solo and hot seat took
    // different routes into a campaign, so only one of them got these fixups.
    const solo = normalizeLoadedState(structuredClone(SOLO()));
    const hotSeat = normalizeLoadedState(structuredClone(HOT_SEAT()));

    for (const state of [solo, hotSeat]) {
      expect(Object.keys(state.settings.advisorsEnabled!).sort()).toEqual([
        'artisan', 'builder', 'chancellor', 'explorer',
        'scholar', 'spymaster', 'treasurer', 'warchief',
      ]);
      expect(state.beasts!.migrationPending).toBeUndefined();
      expect(state.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
      for (const civ of Object.values(state.civilizations)) {
        expect(civ.civType).toBeDefined();
        expect(civ.diplomacy).toBeDefined();
      }
    }
  });

  it('ratchet: the load pipeline adds exactly these fields to a fresh game, and no others', () => {
    // A fresh game is now stamped at the current schema (#1004), so
    // normalizeLoadedState runs ZERO numbered migrations over it — only the
    // unconditional normalizers. What they still add are optional bookkeeping
    // containers, every one of them read behind `?? {}` / `?? []`:
    //   generatedGenerals              -- normalizeGeneratedGenerals
    //   legendaryWonderAvailability    -- key assigned by its normalizer
    //   nationalProjectChoices         -- national-project normalizer
    //   pirateFleets / pirateFleetCooldownByCivLandmass / resurgentCampCooldownByCivLandmass
    //                                  -- normalizeThreatPressureDefaults
    // This pins the set so a future change that starts adding something new has
    // to update it here (and, ideally, set it at creation instead).
    const state = SOLO();
    const normalized = normalizeLoadedState(structuredClone(state)) as unknown as Record<string, unknown>;
    const before = state as unknown as Record<string, unknown>;

    expect(Object.keys(normalized).filter(key => !(key in before)).sort()).toEqual([
      'generatedGenerals',
      'legendaryWonderAvailability',
      'nationalProjectChoices',
      'pirateFleetCooldownByCivLandmass',
      'pirateFleets',
      'resurgentCampCooldownByCivLandmass',
    ]);
    expect(Object.keys(before).filter(key => !(key in normalized))).toEqual([]);
  });
});
