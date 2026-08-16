import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-system';
import { createEmptyPirateState } from '@/core/pirate-state';
import { NO_LAND_UNIT_WATER_RECOVERY } from '@/systems/unit-water-recovery';
import type { PendingMapIntent, SelectionSnapshot } from '@/app/ports';
import { resolveMapTapIntent } from '@/input/map-tap-intent';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeFixture(): GameState {
  const state = createNewGame(undefined, 'tap-intent', 'small');
  state.currentPlayer = 'player';
  return state;
}

function makeVisible(state: GameState, coord: { q: number; r: number }) {
  state.civilizations.player.visibility.tiles[`${coord.q},${coord.r}`] = 'visible';
}

function snapshot(overrides: Partial<SelectionSnapshot> = {}): SelectionSnapshot {
  return {
    selectedUnitId: null,
    movementRange: [],
    attackRange: [],
    pendingIntent: { kind: 'none' },
    waterRecovery: NO_LAND_UNIT_WATER_RECOVERY,
    ...overrides,
  };
}

function placePlayerUnit(state: GameState, id: string, overrides: Partial<GameState['units'][string]> = {}) {
  const template = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'warrior');
  if (!template) throw new Error('missing player warrior template');
  state.units[id] = { ...template, id, owner: 'player', position: { q: 0, r: 0 }, ...overrides };
  if (!state.civilizations.player.units.includes(id)) state.civilizations.player.units.push(id);
  return state.units[id];
}

function placeEnemyUnit(state: GameState, id: string, owner: string, overrides: Partial<GameState['units'][string]> = {}) {
  const template = Object.values(state.units).find(u => u.type === 'warrior') ?? createUnit('warrior', owner, { q: 5, r: 5 }, mkC());
  state.units[id] = { ...template, id, owner, position: { q: 1, r: 0 }, ...overrides };
  if (state.civilizations[owner] && !state.civilizations[owner].units.includes(id)) {
    state.civilizations[owner].units.push(id);
  }
  return state.units[id];
}

describe('resolveMapTapIntent', () => {
  // ── Pending-intent precedence: a pending intent consumes the tap before ──
  // ── anything else runs, matching handleHexTap's fixed precedence order. ──
  describe('pending intents', () => {
    it('ignores every tap while a city-capture choice is pending', () => {
      const state = makeFixture();
      const pending: PendingMapIntent = { kind: 'city-capture', choice: { cityId: 'x', occupiedPopulation: 1, razeGold: 1 } as never };

      const intent = resolveMapTapIntent(state, snapshot({ pendingIntent: pending }), { q: 3, r: 3 }, false);

      expect(intent).toEqual({ kind: 'ignore' });
    });

    it('resolves a pending journey to the tapped coord', () => {
      const state = makeFixture();
      const pending: PendingMapIntent = { kind: 'journey', unitId: 'unit-1' };

      const intent = resolveMapTapIntent(state, snapshot({ pendingIntent: pending }), { q: 2, r: 2 }, false);

      expect(intent).toEqual({ kind: 'resolve-pending', pending, coord: { q: 2, r: 2 } });
    });

    it('resolves a pending air mission to the tapped coord', () => {
      const state = makeFixture();
      const pending: PendingMapIntent = { kind: 'air-mission', unitId: 'unit-1', mission: 'strike' };

      const intent = resolveMapTapIntent(state, snapshot({ pendingIntent: pending }), { q: 2, r: 2 }, false);

      expect(intent).toEqual({ kind: 'resolve-pending', pending, coord: { q: 2, r: 2 } });
    });

    it('resolves a pending unload when the tap is inside the legal range', () => {
      const state = makeFixture();
      const pending: PendingMapIntent = { kind: 'unload', transportId: 't1', cargoUnitId: 'c1', range: [{ q: 2, r: 2 }] };

      const intent = resolveMapTapIntent(state, snapshot({ pendingIntent: pending }), { q: 2, r: 2 }, false);

      expect(intent).toEqual({ kind: 'resolve-pending', pending, coord: { q: 2, r: 2 } });
    });

    it('mis-taps a pending unload when the tap is outside the legal range', () => {
      const state = makeFixture();
      const pending: PendingMapIntent = { kind: 'unload', transportId: 't1', cargoUnitId: 'c1', range: [{ q: 2, r: 2 }] };

      const intent = resolveMapTapIntent(state, snapshot({ pendingIntent: pending }), { q: 9, r: 9 }, false);

      expect(intent).toEqual({ kind: 'mistap', pending });
    });

    it('journey and air-mission take precedence over animation-lock and every other check', () => {
      const state = makeFixture();
      const pending: PendingMapIntent = { kind: 'journey', unitId: 'unit-1' };

      const intent = resolveMapTapIntent(state, snapshot({ pendingIntent: pending, selectedUnitId: 'unit-1' }), { q: 2, r: 2 }, true);

      expect(intent.kind).toBe('resolve-pending');
    });

    it('swallows a tap under a pending unload while the selected unit is mid-animation, instead of resolving the unload', () => {
      // handleHexTap checks isUnitAnimationLocked before ever reading the
      // pending-unload intent (unlike journey/air-mission, which are checked
      // before the animation-lock check) -- an ordering this test locks in
      // after an earlier draft of resolveMapTapIntent got it backwards.
      const state = makeFixture();
      const pending: PendingMapIntent = { kind: 'unload', transportId: 't1', cargoUnitId: 'c1', range: [{ q: 2, r: 2 }] };

      const intent = resolveMapTapIntent(state, snapshot({ pendingIntent: pending, selectedUnitId: 't1' }), { q: 2, r: 2 }, true);

      expect(intent).toEqual({ kind: 'animation-locked' });
    });
  });

  // ── No unit selected: pirate HQ selection, enemy info, own unit/city, ──
  // ── wonder atlas, or a plain deselect. ──
  describe('no unit selected', () => {
    it('opens a pirate faction panel when tapping a known pirate headquarters', () => {
      const state = makeFixture();
      state.pirates = createEmptyPirateState();
      state.pirates.factions['faction-1'] = {
        id: 'faction-1', name: 'Test Pirates', spawnedRound: 1, behavior: 'raiding', maritimeStage: 1,
        notoriety: 1, shipIds: [],
        headquarters: { kind: 'coastal-enclave', position: { q: 4, r: 4 }, integrity: 40, maxIntegrity: 100 },
        tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
        transitionGuards: { emittedEventKeys: [] },
      } as never;
      state.pirates.intelByCiv.player = {
        'faction-1': {
          factionId: 'faction-1', level: 'sighted', discoveredRound: 1, lastUpdatedRound: 1,
          lastKnownHeadquarters: { kind: 'coastal-enclave', position: { q: 4, r: 4 }, observedRound: 1 },
        } as never,
      };

      const intent = resolveMapTapIntent(state, snapshot(), { q: 4, r: 4 }, false);

      expect(intent).toEqual({ kind: 'open-pirate-faction', factionId: 'faction-1' });
    });

    it('selects a friendly unit tapped directly', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { position: { q: 3, r: 3 } });

      const intent = resolveMapTapIntent(state, snapshot(), { q: 3, r: 3 }, false);

      expect(intent).toEqual({ kind: 'select-unit', unitId: 'unit-1' });
    });

    it('opens a stack picker for multiple friendly units on one hex', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { position: { q: 3, r: 3 } });
      placePlayerUnit(state, 'unit-2', { position: { q: 3, r: 3 } });

      const intent = resolveMapTapIntent(state, snapshot(), { q: 3, r: 3 }, false);

      expect(intent).toEqual({ kind: 'open-stack-picker', coord: { q: 3, r: 3 }, unitIds: ['unit-1', 'unit-2'] });
    });

    it('shows enemy unit info when tapping a hostile unit with nothing selected', () => {
      const state = makeFixture();
      placeEnemyUnit(state, 'enemy-1', 'ai-1', { position: { q: 3, r: 3 } });
      makeVisible(state, { q: 3, r: 3 });

      const intent = resolveMapTapIntent(state, snapshot(), { q: 3, r: 3 }, false);

      expect(intent).toEqual({ kind: 'enemy-unit-info', unitId: 'enemy-1' });
    });

    it('opens the owning player city panel when tapping an owned city', () => {
      const state = makeFixture();
      state.cities.home = { ...foundCity('player', { q: 3, r: 3 }, state.map, mkC()), id: 'home', owner: 'player', position: { q: 3, r: 3 } };
      state.civilizations.player.cities.push('home');

      const intent = resolveMapTapIntent(state, snapshot(), { q: 3, r: 3 }, false);

      expect(intent).toEqual({ kind: 'open-city', cityId: 'home' });
    });

    it('opens the wonder atlas when tapping a discovered natural wonder', () => {
      const state = makeFixture();
      const key = '3,3';
      state.map.tiles[key] = { ...state.map.tiles[key], wonder: 'great-falls' };
      state.wonderDiscoverers = { 'great-falls': ['player'] };
      makeVisible(state, { q: 3, r: 3 });

      const intent = resolveMapTapIntent(state, snapshot(), { q: 3, r: 3 }, false);

      expect(intent).toEqual({ kind: 'open-wonder-atlas', wonderId: 'great-falls', coord: { q: 3, r: 3 } });
    });

    it('deselects on a tap that matches nothing', () => {
      const state = makeFixture();

      const intent = resolveMapTapIntent(state, snapshot(), { q: 3, r: 3 }, false);

      expect(intent).toEqual({ kind: 'deselect' });
    });
  });

  // ── A unit is selected: animation lock, blockers, and the ──
  // ── move/attack/assault/confirm-war family via resolveSelectedUnitTapIntent. ──
  describe('unit selected', () => {
    it('swallows the tap while the selected unit is mid-animation', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1');

      const intent = resolveMapTapIntent(state, snapshot({ selectedUnitId: 'unit-1' }), { q: 3, r: 3 }, true);

      expect(intent).toEqual({ kind: 'animation-locked' });
    });

    it('blocks re-selecting a committed caravan when the tapped hex is out of range', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { committedToRouteId: 'route-1' });

      const intent = resolveMapTapIntent(state, snapshot({ selectedUnitId: 'unit-1' }), { q: 3, r: 3 }, false);

      expect(intent).toEqual({ kind: 'blocked-caravan-committed', unitId: 'unit-1' });
    });

    it('reports a movement blocker for an unreachable out-of-range tap', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { position: { q: 0, r: 0 } });

      const intent = resolveMapTapIntent(state, snapshot({ selectedUnitId: 'unit-1' }), { q: 3, r: 3 }, false);

      expect(intent.kind).toBe('blocked-movement');
    });

    it('opens a combat preview when tapping an attackable enemy in attack range', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { position: { q: 0, r: 0 } });
      placeEnemyUnit(state, 'enemy-1', 'ai-1', { position: { q: 1, r: 0 } });
      makeVisible(state, { q: 1, r: 0 });

      const intent = resolveMapTapIntent(
        state,
        snapshot({ selectedUnitId: 'unit-1', attackRange: [{ q: 1, r: 0 }] }),
        { q: 1, r: 0 },
        false,
      );

      expect(intent).toEqual({ kind: 'combat-preview', attackerId: 'unit-1', defenderId: 'enemy-1', targetCoord: { q: 1, r: 0 } });
    });

    it('blocks the attack preview instead of previewing when the naval gate disallows the attacker', () => {
      // A second, amphibious-assault-aware naval-gate check that handleHexTap
      // runs specifically inside the attack-preview branch (distinct from the
      // earlier blocked-naval-gate check above, which only fires for a tap
      // that isn't a legal move/attack target at all). An earlier draft of
      // resolveMapTapIntent omitted this second check entirely.
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { position: { q: 0, r: 0 }, type: 'warrior' });
      placeEnemyUnit(state, 'sea-serpent-1', 'beasts', { position: { q: 1, r: 0 }, type: 'beast_sea_serpent' as never });
      makeVisible(state, { q: 1, r: 0 });

      const intent = resolveMapTapIntent(
        state,
        snapshot({ selectedUnitId: 'unit-1', attackRange: [{ q: 1, r: 0 }] }),
        { q: 1, r: 0 },
        false,
      );

      expect(intent).toEqual({
        kind: 'blocked-naval-gate', unitId: 'unit-1',
        reason: 'Only ships and ranged units can fight the Sea Serpent.',
      });
    });

    it('does nothing when the selected unit no longer exists (a true no-op, not a deselect)', () => {
      // handleHexTap's real branch here is a bare `return;` -- distinct from
      // the deselect-and-tap-SFX fallback this function uses for an
      // unremarkable empty-hex tap. An earlier draft of resolveMapTapIntent
      // conflated the two.
      const state = makeFixture();

      const intent = resolveMapTapIntent(
        state,
        snapshot({ selectedUnitId: 'gone', movementRange: [{ q: 1, r: 1 }] }),
        { q: 1, r: 1 },
        false,
      );

      expect(intent).toEqual({ kind: 'ignore' });
    });

    it('moves the selected unit to a reachable empty hex', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { position: { q: 0, r: 0 } });

      const intent = resolveMapTapIntent(
        state,
        snapshot({ selectedUnitId: 'unit-1', movementRange: [{ q: 1, r: 1 }] }),
        { q: 1, r: 1 },
        false,
      );

      expect(intent).toEqual({ kind: 'move', unitId: 'unit-1', coord: { q: 1, r: 1 } });
    });

    it('previews a city assault when resolveSelectedUnitTapIntent returns assault-city', () => {
      const state = makeFixture();
      const unit = placePlayerUnit(state, 'unit-1', { position: { q: 0, r: 0 } });
      state.cities.enemyCity = { ...foundCity('ai-1', { q: 1, r: 0 }, state.map, mkC()), id: 'enemyCity', owner: 'ai-1', position: { q: 1, r: 0 } };
      state.civilizations['ai-1'].cities.push('enemyCity');
      state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
      state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
      const profile = unit.type;
      void profile;

      const intent = resolveMapTapIntent(
        state,
        snapshot({ selectedUnitId: 'unit-1', movementRange: [{ q: 1, r: 0 }] }),
        { q: 1, r: 0 },
        false,
      );

      expect(intent).toEqual({ kind: 'assault-preview', attackerId: 'unit-1', cityId: 'enemyCity', embarkedAssault: false });
    });

    // #845: an undefended barbarian camp previously had no dedicated intent at all -- a tap
    // resolved as an ordinary 'move' and the unit walked onto it. This proves the tap now
    // routes to a dedicated preview, and that a non-adjacent camp correctly stays a plain
    // 'blocked-movement' rather than a silent move/deselect.
    it('previews a camp assault when resolveSelectedUnitTapIntent returns assault-camp', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { position: { q: 0, r: 0 } });
      state.barbarianCamps['camp-1'] = { id: 'camp-1', position: { q: 1, r: 0 }, strength: 10, spawnCooldown: 3 };

      const intent = resolveMapTapIntent(
        state,
        snapshot({ selectedUnitId: 'unit-1', movementRange: [{ q: 1, r: 0 }] }),
        { q: 1, r: 0 },
        false,
      );

      expect(intent).toEqual({ kind: 'assault-camp-preview', attackerId: 'unit-1', campId: 'camp-1' });
    });

    it('reports a clear barbarian-camp blocker when tapping a non-adjacent undefended camp', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { position: { q: 0, r: 0 } });
      const campCoord = { q: 2, r: 0 };
      state.barbarianCamps['camp-1'] = { id: 'camp-1', position: campCoord, strength: 10, spawnCooldown: 3 };

      const intent = resolveMapTapIntent(
        state,
        snapshot({ selectedUnitId: 'unit-1', movementRange: [{ q: 1, r: 0 }] }),
        campCoord,
        false,
      );

      expect(intent).toEqual({
        kind: 'blocked-movement',
        unitId: 'unit-1',
        reason: { code: 'barbarian-camp', message: 'Move adjacent, then attack to destroy the camp.' },
      });
    });

    // #843: a non-adjacent undefended enemy city is correctly excluded from movementRange by
    // buildSelectedUnitHighlights post-fix (see selected-unit-highlights.test.ts), so tapping
    // it falls into this !canMove && !canAttack branch. It must resolve to a clear
    // 'blocked-movement' with the 'foreign-city' reason -- not a silent 'deselect', and not a
    // 'move' that would then fail downstream at execution.
    it('reports a clear foreign-city blocker when tapping a non-adjacent undefended enemy city', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { position: { q: 0, r: 0 } });
      const cityCoord = { q: 2, r: 0 };
      state.cities.enemyCity = { ...foundCity('ai-1', cityCoord, state.map, mkC()), id: 'enemyCity', owner: 'ai-1', position: cityCoord };
      state.civilizations['ai-1'].cities.push('enemyCity');
      state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
      state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
      makeVisible(state, cityCoord);

      const intent = resolveMapTapIntent(
        state,
        // Deliberately does NOT include the city coordinate -- matching the corrected,
        // adjacency-gated output of buildSelectedUnitHighlights for a non-adjacent city.
        snapshot({ selectedUnitId: 'unit-1', movementRange: [{ q: 1, r: 0 }] }),
        cityCoord,
        false,
      );

      expect(intent).toEqual({
        kind: 'blocked-movement',
        unitId: 'unit-1',
        reason: { code: 'foreign-city', message: 'Move adjacent, then use the city assault action.' },
      });
    });

    it('asks for war confirmation when resolveSelectedUnitTapIntent returns confirm-war-city', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { position: { q: 0, r: 0 } });
      state.cities.enemyCity = { ...foundCity('ai-1', { q: 1, r: 0 }, state.map, mkC()), id: 'enemyCity', owner: 'ai-1', position: { q: 1, r: 0 } };
      state.civilizations['ai-1'].cities.push('enemyCity');
      state.civilizations.player.diplomacy.atWarWith = [];
      state.civilizations['ai-1'].diplomacy.atWarWith = [];

      const intent = resolveMapTapIntent(
        state,
        snapshot({ selectedUnitId: 'unit-1', movementRange: [{ q: 1, r: 0 }] }),
        { q: 1, r: 0 },
        false,
      );

      expect(intent).toEqual({ kind: 'confirm-war-city', attackerId: 'unit-1', cityId: 'enemyCity', defenderId: 'ai-1' });
    });

    it('asks for war confirmation when resolveSelectedUnitTapIntent returns confirm-war-minor-civ', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { position: { q: 0, r: 0 } });
      state.cities['mc-city'] = { ...foundCity('mc-warriors', { q: 1, r: 0 }, state.map, mkC()), id: 'mc-city', owner: 'mc-warriors', position: { q: 1, r: 0 } };
      state.civilizations.player.diplomacy.atWarWith = [];

      const intent = resolveMapTapIntent(
        state,
        snapshot({ selectedUnitId: 'unit-1', movementRange: [{ q: 1, r: 0 }] }),
        { q: 1, r: 0 },
        false,
      );

      expect(intent).toEqual({ kind: 'confirm-war-minor-civ', attackerId: 'unit-1', cityId: 'mc-city', minorCivId: 'mc-warriors' });
    });

    it('assaults a minor civ directly when already at war with it', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { position: { q: 0, r: 0 } });
      state.cities['mc-city'] = { ...foundCity('mc-warriors', { q: 1, r: 0 }, state.map, mkC()), id: 'mc-city', owner: 'mc-warriors', position: { q: 1, r: 0 } };
      state.civilizations.player.diplomacy.atWarWith = ['mc-warriors'];

      const intent = resolveMapTapIntent(
        state,
        snapshot({ selectedUnitId: 'unit-1', movementRange: [{ q: 1, r: 0 }] }),
        { q: 1, r: 0 },
        false,
      );

      expect(intent).toEqual({ kind: 'assault-minor-civ', attackerId: 'unit-1', coord: { q: 1, r: 0 }, cityId: 'mc-city', minorCivId: 'mc-warriors' });
    });

    it('reports worker-busy instead of moving a unit still finishing an improvement', () => {
      const state = makeFixture();
      state.map.tiles['0,0'] = { ...state.map.tiles['0,0'], roadTurnsLeft: 2 };
      placePlayerUnit(state, 'unit-1', {
        position: { q: 0, r: 0 },
        type: 'worker',
        workerTask: { action: 'build_road', coord: { q: 0, r: 0 } },
      } as never);

      const intent = resolveMapTapIntent(
        state,
        snapshot({ selectedUnitId: 'unit-1', movementRange: [{ q: 1, r: 1 }] }),
        { q: 1, r: 1 },
        false,
      );

      expect(intent).toEqual({ kind: 'worker-busy', unitId: 'unit-1', coord: { q: 1, r: 1 } });
    });

    it('re-selects a friendly stack instead of moving when the tapped hex has no move/attack range match', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'unit-1', { position: { q: 0, r: 0 } });
      placePlayerUnit(state, 'unit-2', { position: { q: 5, r: 5 } });

      const intent = resolveMapTapIntent(
        state,
        snapshot({ selectedUnitId: 'unit-1', movementRange: [{ q: 1, r: 1 }] }),
        { q: 5, r: 5 },
        false,
      );

      expect(intent).toEqual({ kind: 'select-unit', unitId: 'unit-2' });
    });
  });
});
