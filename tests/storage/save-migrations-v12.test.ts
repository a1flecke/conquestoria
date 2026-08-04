import { describe, it, expect } from 'vitest';
import { migrateSaveToCurrent, CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';
import { createNewGame } from '@/core/game-state';
import type { SoloSetupConfig } from '@/core/types';

/**
 * Migration 12 absorbs the 18 versioned fixups that used to live in
 * main.ts's migrateLegacySave() -- 124 lines that mutated module-scope
 * gameState in place, were never exported, and had no tests. See #787 and
 * docs/superpowers/plans/2026-08-04-composition-root-decomposition.md.
 */

const CONFIG: SoloSetupConfig = {
  civType: 'generic',
  mapSize: 'small',
  opponentCount: 1,
  gameTitle: 'migration fixture',
  seed: 'save-migration-v12',
};

/** Stamp a fresh state as v11 so only migration 12 runs. */
function asV11(): Record<string, unknown> {
  return { ...(createNewGame(CONFIG) as unknown as Record<string, unknown>), saveSchemaVersion: 11 };
}

describe('save migration 12 — absorbed main.ts legacy fixups', () => {
  it('backfills civType, diplomacy, and lastCombatTurnByLandmass', () => {
    const raw = asV11();
    const civs = raw.civilizations as Record<string, Record<string, unknown>>;
    for (const civ of Object.values(civs)) {
      delete civ.civType;
      delete civ.diplomacy;
      delete civ.lastCombatTurnByLandmass;
    }

    const migrated = migrateSaveToCurrent(raw);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    for (const civ of Object.values(migrated.civilizations)) {
      expect(civ.civType).toBe('generic');
      expect(civ.lastCombatTurnByLandmass).toEqual({});
      expect(civ.diplomacy.atWarWith).toEqual([]);
      expect(civ.diplomacy.treaties).toEqual([]);
      expect(civ.diplomacy.events).toEqual([]);
    }
  });

  it('seeds diplomacy relationships for every other civ at zero', () => {
    const raw = asV11();
    const civs = raw.civilizations as Record<string, Record<string, unknown>>;
    const civIds = Object.keys(civs);
    for (const civ of Object.values(civs)) delete civ.diplomacy;

    const migrated = migrateSaveToCurrent(raw);

    for (const civId of civIds) {
      const relationships = migrated.civilizations[civId].diplomacy.relationships;
      expect(Object.keys(relationships).sort()).toEqual(civIds.filter(id => id !== civId).sort());
      expect(Object.values(relationships).every(value => value === 0)).toBe(true);
    }
  });

  it('backfills the full advisor roster, including treasurer, scholar, and spymaster', () => {
    const raw = asV11();
    const settings = raw.settings as Record<string, unknown>;
    delete settings.advisorsEnabled;

    const migrated = migrateSaveToCurrent(raw);

    expect(migrated.settings.advisorsEnabled).toEqual({
      builder: true, explorer: true, chancellor: true, warchief: true,
      treasurer: true, scholar: true, spymaster: true, artisan: true,
    });
  });

  it('adds only the missing advisors to a partial roster', () => {
    const raw = asV11();
    const settings = raw.settings as Record<string, unknown>;
    settings.advisorsEnabled = { builder: false, explorer: true, chancellor: true, warchief: true, artisan: true };

    const migrated = migrateSaveToCurrent(raw);

    // The pre-existing `false` must survive -- these are player preferences.
    expect(migrated.settings.advisorsEnabled!.builder).toBe(false);
    expect(migrated.settings.advisorsEnabled!.treasurer).toBe(true);
    expect(migrated.settings.advisorsEnabled!.scholar).toBe(true);
    expect(migrated.settings.advisorsEnabled!.spymaster).toBe(true);
  });

  it('backfills every tech track priority to medium', () => {
    const raw = asV11();
    const civs = raw.civilizations as Record<string, Record<string, Record<string, unknown>>>;
    for (const civ of Object.values(civs)) {
      civ.techState.trackPriorities = { military: 'high' };
    }

    const migrated = migrateSaveToCurrent(raw);

    for (const civ of Object.values(migrated.civilizations)) {
      const priorities = civ.techState.trackPriorities as Record<string, string>;
      expect(priorities.military).toBe('high');
      for (const track of [
        'economy', 'science', 'civics', 'exploration', 'agriculture', 'medicine',
        'philosophy', 'arts', 'maritime', 'metallurgy', 'construction',
        'communication', 'espionage', 'spirituality',
      ]) {
        expect(priorities[track], track).toBe('medium');
      }
    }
  });

  it('reshapes legacy trade routes to id/goldPerTrip/turnsPerTrip and drops goldPerTurn', () => {
    const raw = asV11();
    (raw.marketplace as { tradeRoutes: unknown[] }).tradeRoutes = [
      { fromCityId: 'a', toCityId: 'b', goldPerTurn: 4 },
      { fromCityId: 'c', toCityId: 'd', goldPerTurn: 3, turnsPerTrip: 5 },
    ];

    const migrated = migrateSaveToCurrent(raw);
    const [first, second] = migrated.marketplace!.tradeRoutes;

    expect(first.id).toBe('route-legacy-1');
    expect(first.goldPerTrip).toBe(12);
    expect(first.turnsPerTrip).toBe(3);
    expect('goldPerTurn' in first).toBe(false);

    expect(second.id).toBe('route-legacy-2');
    expect(second.goldPerTrip).toBe(15);
    expect(second.turnsPerTrip).toBe(5);
  });

  it('flags legacy saves with no beasts block so lairs place on the first tick', () => {
    const raw = asV11();
    delete raw.beasts;

    const migrated = migrateSaveToCurrent(raw);

    expect(migrated.beasts!.migrationPending).toBe(true);
    expect(migrated.beasts!.lairs).toEqual({});
    expect(migrated.beasts!.mode).toBe('wild');
  });

  it('preserves an existing beasts block instead of resetting it', () => {
    const raw = asV11();
    const lairs = (raw.beasts as { lairs: unknown }).lairs;

    const migrated = migrateSaveToCurrent(raw);

    expect(migrated.beasts!.lairs).toEqual(lairs);
    expect(migrated.beasts!.migrationPending).toBeUndefined();
  });

  it('backfills tile.wonder and unit.isResting', () => {
    const raw = asV11();
    for (const tile of Object.values((raw.map as { tiles: Record<string, Record<string, unknown>> }).tiles)) {
      delete tile.wonder;
    }
    for (const unit of Object.values(raw.units as Record<string, Record<string, unknown>>)) {
      delete unit.isResting;
    }

    const migrated = migrateSaveToCurrent(raw);

    expect(Object.values(migrated.map.tiles).every(tile => tile.wonder === null)).toBe(true);
    expect(Object.values(migrated.units).every(unit => unit.isResting === false)).toBe(true);
  });

  it('rebuilds legendary discovered sites from wonderDiscoverers', () => {
    const raw = asV11();
    const tiles = (raw.map as { tiles: Record<string, { coord: { q: number; r: number }; wonder?: string | null }> }).tiles;
    const [firstKey] = Object.keys(tiles);
    tiles[firstKey].wonder = 'mount-olympus';
    raw.wonderDiscoverers = { 'mount-olympus': ['player'] };
    // The rebuild fires only for a history object that LACKS discoveredSites --
    // see the sibling test below for the wholly-absent case.
    raw.legendaryWonderHistory = { destroyedStrongholds: [] };

    const migrated = migrateSaveToCurrent(raw);
    const sites = migrated.legendaryWonderHistory!.discoveredSites;

    expect(sites).toHaveLength(1);
    expect(sites[0].civId).toBe('player');
    expect(sites[0].siteId).toBe('mount-olympus');
    expect(sites[0].siteType).toBe('natural-wonder');
    expect(sites[0].position).toEqual(tiles[firstKey].coord);
  });

  it('does NOT rebuild discovered sites when legendaryWonderHistory is absent entirely', () => {
    // Quirk carried over verbatim from main.ts:5192-5211: the absent-history
    // default already supplies `discoveredSites: []`, which makes the rebuild
    // guard false. Pinned deliberately -- changing it would alter what old
    // saves show in the wonder codex, which is out of scope for #787.
    const raw = asV11();
    const tiles = (raw.map as { tiles: Record<string, { wonder?: string | null }> }).tiles;
    tiles[Object.keys(tiles)[0]].wonder = 'mount-olympus';
    raw.wonderDiscoverers = { 'mount-olympus': ['player'] };
    delete raw.legendaryWonderHistory;

    const migrated = migrateSaveToCurrent(raw);

    expect(migrated.legendaryWonderHistory!.discoveredSites).toEqual([]);
  });

  it('backfills the remaining optional containers', () => {
    const raw = asV11();
    delete raw.pendingEvents;
    delete raw.tribalVillages;
    delete raw.discoveredWonders;
    delete raw.wonderDiscoverers;
    delete raw.legendaryWonderIntel;
    delete raw.minorCivs;
    delete raw.marketplace;
    delete raw.resurgentCampCooldownByCivLandmass;

    const migrated = migrateSaveToCurrent(raw);

    expect(migrated.pendingEvents).toEqual({});
    expect(migrated.tribalVillages).toEqual({});
    expect(migrated.discoveredWonders).toEqual({});
    expect(migrated.wonderDiscoverers).toEqual({});
    expect(migrated.legendaryWonderIntel).toEqual({});
    expect(migrated.minorCivs).toEqual({});
    expect(migrated.marketplace!.tradeRoutes).toEqual([]);
    expect(migrated.resurgentCampCooldownByCivLandmass).toEqual({});
  });

  it('is idempotent — migrating an already-migrated save changes nothing', () => {
    // migrateLegacySave ran on EVERY campaign entry, so nearly every real v11
    // save already carries these fields. Migration 12 must default, never clobber.
    const raw = asV11();
    const once = migrateSaveToCurrent(raw);
    const twice = migrateSaveToCurrent({ ...once, saveSchemaVersion: 11 });

    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});
