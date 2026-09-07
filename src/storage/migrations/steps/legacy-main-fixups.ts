import type { GameState, TradeRoute, Unit } from '@/core/types';
import { createMarketplaceState } from '@/systems/trade-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';

/**
 * Schema 12 (#787) — the eighteen versioned fixups that used to live in
 * `main.ts`'s `migrateLegacySave()`: 124 lines that mutated module-scope state in
 * place, were never exported, and had no tests. Every field it touches is guarded,
 * because a migration runs on anything — including deliberately malformed fixtures.
 */

const ALL_TECH_TRACKS = [
  'military', 'economy', 'science', 'civics', 'exploration',
  'agriculture', 'medicine', 'philosophy', 'arts', 'maritime',
  'metallurgy', 'construction', 'communication', 'espionage', 'spirituality',
] as const;

const ALL_ADVISORS = [
  'builder', 'explorer', 'chancellor', 'warchief',
  'treasurer', 'scholar', 'spymaster', 'artisan',
] as const;

/** A trade route as written by builds predating the id/goldPerTrip reshape. */
interface LegacyTradeRoute {
  id?: string;
  goldPerTrip?: number;
  turnsPerTrip?: number;
  goldPerTurn?: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `key in value`, deliberately returning a plain boolean rather than a type
 * predicate.
 *
 * Tile.wonder and Unit.isResting are declared REQUIRED in core/types.ts, so a
 * direct `'wonder' in tile` narrows the false branch to `never` and the
 * subsequent spread stops compiling. That narrowing is wrong here by
 * construction: the entire premise of a migration is that an old save really is
 * missing a field the current type says is mandatory. Routing the check through
 * an untyped record view keeps the runtime semantics of `in` (which is what
 * main.ts's migrateLegacySave used) without letting the compiler assume the
 * absent case is impossible.
 */
function hasField(value: object, key: string): boolean {
  return key in (value as Record<string, unknown>);
}

// #787 phase 1: the 18 versioned fixups that used to live in main.ts's
// migrateLegacySave() -- 124 lines of in-place mutation on module-scope
// gameState, never exported, never tested, and reachable only by entering a
// campaign. Two of its behaviours are load-bearing and preserved here:
//
//  - EVERY fixup defaults rather than overwrites. migrateLegacySave ran on every
//    campaign entry, so nearly every real v11 save already carries these fields;
//    a clobbering migration would wipe live player data. Enforced by the
//    idempotency case in tests/storage/save-migrations-v12.test.ts.
//  - Ordering: discoveredSites is rebuilt from wonderDiscoverers, and the trade
//    route reshape reads marketplace, so those defaults are applied first.
//
// The four *derived* fixups (refreshKnownCivilizations, reconstructLastSeenFromMap,
// clearStaleSoloPendingEvents) are not here -- they recompute state from the map
// and civ roster on every load, so they belong in normalizeLoadedState. The
// councilTalkLevel fixup is not here either: it reads IndexedDB user settings,
// not save data, so it cannot be a deterministic (state) => GameState. It lives
// in src/storage/settings-merge.ts.
export function migrateLegacyMainFixups(state: GameState): GameState {
  const next: GameState = { ...state };

  // Every field below is guarded. migrateLegacySave only ever ran on fully
  // loaded campaign saves, but a migration runs on anything -- including the
  // deliberately malformed fixture in save-migrations.test.ts ("leaves a
  // malformed legacy civilization for later state normalization"), which has a
  // civ with no techState and no settings/map/units at all. Migrations must
  // tolerate that shape and leave it for normalizeLoadedState.

  // --- Civilizations: civType, lastCombatTurnByLandmass, diplomacy, tracks ---
  const civIds = Object.keys(next.civilizations ?? {});
  next.civilizations = Object.fromEntries(
    Object.entries(next.civilizations ?? {}).map(([civId, civ]) => {
      if (!isObject(civ)) return [civId, civ];
      const migrated = { ...civ };
      migrated.civType ??= 'generic';
      migrated.knownCivilizations ??= [];
      migrated.lastCombatTurnByLandmass ??= {};
      // createDiplomacyState rather than the object literal main.ts used: that
      // literal omitted treacheryScore/vassalage and only compiled behind an
      // `as any`. The canonical constructor yields a complete DiplomacyState.
      migrated.diplomacy ??= createDiplomacyState(civIds, civId, 0);
      if (isObject(migrated.techState)) {
        const trackPriorities = { ...(migrated.techState.trackPriorities ?? {}) } as Record<string, string>;
        for (const track of ALL_TECH_TRACKS) {
          trackPriorities[track] ??= 'medium';
        }
        migrated.techState = {
          ...migrated.techState,
          trackPriorities: trackPriorities as typeof migrated.techState.trackPriorities,
        };
      }
      return [civId, migrated];
    }),
  );

  // --- Settings: advisor roster (M3b added treasurer/scholar, M4a spymaster) ---
  if (isObject(next.settings)) {
    const advisorsEnabled = { ...(next.settings.advisorsEnabled ?? {}) } as Record<string, boolean>;
    for (const advisor of ALL_ADVISORS) {
      advisorsEnabled[advisor] ??= true;
    }
    next.settings = {
      ...next.settings,
      advisorsEnabled: advisorsEnabled as NonNullable<GameState['settings']['advisorsEnabled']>,
    };
  }

  // --- Optional containers ---
  next.pendingEvents ??= {};
  next.tribalVillages ??= {};
  next.discoveredWonders ??= {};
  next.wonderDiscoverers ??= {};
  next.legendaryWonderIntel ??= {};
  next.minorCivs ??= {};
  next.resurgentCampCooldownByCivLandmass ??= {};

  // --- Legendary wonder history (reads wonderDiscoverers, so it runs after) ---
  const history = { ...(next.legendaryWonderHistory ?? { destroyedStrongholds: [], discoveredSites: [] }) };
  history.networkPlanResolutions ??= [];
  if (!history.discoveredSites) {
    const discoveredSites: NonNullable<GameState['legendaryWonderHistory']>['discoveredSites'] = [];
    for (const [wonderId, discoverers] of Object.entries(next.wonderDiscoverers ?? {})) {
      const wonderTile = Object.values(next.map?.tiles ?? {}).find(tile => tile.wonder === wonderId);
      for (const civId of discoverers) {
        if (discoveredSites.some(record => record.civId === civId && record.siteId === wonderId)) continue;
        discoveredSites.push({
          civId,
          siteId: wonderId,
          siteType: 'natural-wonder',
          position: wonderTile?.coord ?? { q: 0, r: 0 },
          turn: next.turn,
        });
      }
    }
    history.discoveredSites = discoveredSites;
  }
  next.legendaryWonderHistory = history;

  // --- Tile.wonder and Unit.isResting backfills ---
  const tiles = next.map?.tiles;
  if (tiles) {
    next.map = {
      ...next.map,
      tiles: Object.fromEntries(
        Object.entries(tiles).map(([key, tile]) => (
          hasField(tile, 'wonder') ? [key, tile] : [key, { ...tile, wonder: null }]
        )),
      ),
    };
  }
  const units = next.units;
  if (units) {
    next.units = Object.fromEntries(
      Object.entries(units).map(([unitId, unit]) => (
        hasField(unit, 'isResting') ? [unitId, unit] : [unitId, { ...unit, isResting: false }]
      )),
    );
  }

  // --- Marketplace, then the TradeRoute reshape that reads it ---
  const marketplace = isObject(next.marketplace) ? next.marketplace : createMarketplaceState();
  let legacyRouteN = 1;
  next.marketplace = {
    ...marketplace,
    tradeRoutes: (Array.isArray(marketplace.tradeRoutes) ? marketplace.tradeRoutes : []).map(route => {
      if (!isObject(route)) return route;
      const legacy = route as TradeRoute & LegacyTradeRoute;
      if (legacy.id && legacy.goldPerTrip && legacy.turnsPerTrip) {
        legacyRouteN += 1;
        return legacy;
      }
      const turnsPerTrip = legacy.turnsPerTrip ?? 3;
      const { goldPerTurn, ...rest } = legacy;
      return {
        ...rest,
        id: legacy.id ?? `route-legacy-${legacyRouteN++}`,
        turnsPerTrip,
        goldPerTrip: legacy.goldPerTrip ?? (goldPerTurn ?? 2) * turnsPerTrip,
      };
    }),
  };

  // --- Beasts: flag legacy saves so processTurn places lairs on the FIRST tick
  // after load, deferring the paw markers until the player has taken an action.
  next.beasts ??= { mode: 'wild', lairs: {}, sightingsByCiv: {}, migrationPending: true };

  return next;
}
