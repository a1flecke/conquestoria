import { describe, it, expect } from 'vitest';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
import { normalizeLoadedState } from '@/storage/save-manager';
import { CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';
import type { GameState, HotSeatConfig } from '@/core/types';

/**
 * main.ts's migrateLegacySave() ran on brand-new HOT-SEAT games (createHotSeatGame
 * -> enterCampaign -> migrate) but not on brand-new SOLO games, which called
 * startGame() directly. So the two new-game paths did not provably produce the
 * same state shape, and nothing tested that they did. #787 phase 1 deletes that
 * function; these tests are what replaces the guarantee.
 *
 * Note on scope: createNewGame/createHotSeatGame do not set saveSchemaVersion, so
 * a fresh state reads as version 0 and normalizeLoadedState replays migrations
 * 1..12, not just 12. A whole-state equality assertion would therefore fail on any
 * pre-existing non-idempotency anywhere in that chain -- which is why the gate
 * below is scoped to the fields phase 1 actually relocated, and the whole-state
 * comparison is kept separately as a diagnostic.
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
    it(`${label}: no relocated fixup overwrites anything a fresh game already set`, () => {
      const state = make();
      const normalized = normalizeLoadedState(structuredClone(state));

      expect(normalized.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);

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

    it(`${label}: fields a fresh game genuinely omits get their documented default`, () => {
      // createNewGame does not set these two; migrateLegacySave defaulted them at
      // campaign entry and migration 12 keeps doing so. Asserted rather than
      // assumed, because `{}` vs `undefined` decides whether downstream readers
      // need `?? {}`.
      const normalized = normalizeLoadedState(structuredClone(make()));

      expect(normalized.pendingEvents).toEqual({});
      expect(normalized.resurgentCampCooldownByCivLandmass).toEqual({});
      // Same story one level down: createNewGame builds legendaryWonderHistory
      // with only destroyedStrongholds/discoveredSites, and builds civs with no
      // lastCombatTurnByLandmass at all.
      expect(normalized.legendaryWonderHistory!.networkPlanResolutions).toEqual([]);
      for (const [civId, civ] of Object.entries(normalized.civilizations)) {
        expect(civ.lastCombatTurnByLandmass, civId).toEqual({});
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
      for (const civ of Object.values(state.civilizations)) {
        expect(civ.civType).toBeDefined();
        expect(civ.diplomacy).toBeDefined();
        expect(civ.lastCombatTurnByLandmass).toBeDefined();
      }
    }
  });

  it('ratchet: the load pipeline adds exactly these fields to a fresh game, and no others', () => {
    // A fresh state carries no saveSchemaVersion, so it reads as version 0 and
    // normalizeLoadedState replays migrations 1..12 plus every unconditional
    // normalizer. That legitimately enriches a new game. This pins the exact set
    // so a future change that starts adding something new has to say so here.
    //
    // Only `pendingEvents` and `resurgentCampCooldownByCivLandmass` belong to
    // #787 phase 1 (migration 12). The rest predate it:
    //   reconReveals, nationalProjectChoices  -- earlier numbered migrations
    //   pirateFleets, pirateFleetCooldownByCivLandmass -- migrateLegacyPirateFleets
    //   legendaryWonderAvailability -- key set to undefined by its normalizer
    const state = SOLO();
    const normalized = normalizeLoadedState(structuredClone(state)) as unknown as Record<string, unknown>;
    const before = state as unknown as Record<string, unknown>;

    expect(Object.keys(normalized).filter(key => !(key in before)).sort()).toEqual([
      // #888: normalizeGeneratedGenerals defaults the fallback-officer registry
      // to {} on load, same as withReligionDefaults does for `religions`.
      'generatedGenerals',
      'legendaryWonderAvailability',
      'nationalProjectChoices',
      'pendingEvents',
      'pirateFleetCooldownByCivLandmass',
      'pirateFleets',
      'reconReveals',
      'resurgentCampCooldownByCivLandmass',
      'saveSchemaVersion',
    ]);
    expect(Object.keys(before).filter(key => !(key in normalized))).toEqual([]);
  });
});
