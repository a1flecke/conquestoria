import { describe, expect, it } from 'vitest';
import { createUnit } from '@/systems/unit-system';
import {
  applyPillageToState,
  canPillageTile,
  getPillageGoldReward,
  GOLD_PER_PILLAGE_BUILD_TURN,
} from '@/systems/pillage-system';
import type { GameState, HexTile } from '@/core/types';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeTile(overrides: Partial<HexTile> = {}): HexTile {
  return {
    coord: { q: 1, r: 0 },
    terrain: 'plains',
    elevation: 'lowland',
    resource: null,
    improvement: 'farm',
    owner: 'ai-1',
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    hasRoad: false,
    ...overrides,
  };
}

function makePillageState(tileOverrides: Partial<HexTile> = {}): GameState {
  const unit = { ...createUnit('warrior', 'player', { q: 1, r: 0 }, mkC()), id: 'raider' };
  const tile = makeTile(tileOverrides);
  return {
    turn: 5,
    era: 1,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 4, height: 4, wrapsHorizontally: false, rivers: [], tiles: { '1,0': tile } },
    units: { raider: unit },
    cities: {},
    civilizations: {
      player: {
        id: 'player', name: 'Player', color: '#fff', isHuman: true, civType: 'rome',
        cities: [], units: ['raider'],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 10,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 1 } },
      },
      'ai-1': {
        id: 'ai-1', name: 'AI', color: '#d94a4a', isHuman: false, civType: 'egypt',
        cities: [], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 1 } },
      },
    },
  } as unknown as GameState;
}

describe('pillage-system', () => {
  describe('getPillageGoldReward', () => {
    it('derives gold from IMPROVEMENT_BUILD_TURNS, not a hand-authored table', () => {
      expect(getPillageGoldReward('farm')).toBe(4 * GOLD_PER_PILLAGE_BUILD_TURN);
      expect(getPillageGoldReward('oil_well')).toBe(5 * GOLD_PER_PILLAGE_BUILD_TURN);
    });

    it('awards real gold for a pillaged resource outpost, not zero (#541 second-pass review)', () => {
      // resource_outpost has IMPROVEMENT_BUILD_TURNS 0 (it's Expedition-placed, not
      // worker-built) — a naive lookup would price it at 0 gold despite it being the
      // most impactful thing on the map to burn (it denies a strategic resource).
      expect(getPillageGoldReward('resource_outpost')).toBeGreaterThan(0);
      expect(getPillageGoldReward('resource_outpost')).toBe(5 * GOLD_PER_PILLAGE_BUILD_TURN);
    });
  });

  describe('canPillageTile', () => {
    it('is true for an enemy tile with a finished improvement', () => {
      expect(canPillageTile(makeTile({ owner: 'ai-1' }), 'player')).toBe(true);
    });

    it("is false when the tile is owned by the pillaging unit's own civ", () => {
      expect(canPillageTile(makeTile({ owner: 'player' }), 'player')).toBe(false);
    });

    it('is true for a null-owner (unclaimed) tile with a finished improvement', () => {
      expect(canPillageTile(makeTile({ owner: null }), 'player')).toBe(true);
    });

    it('is false when the improvement is mid-construction and there is no road', () => {
      expect(canPillageTile(makeTile({ improvementTurnsLeft: 2, hasRoad: false }), 'player')).toBe(false);
    });

    it('is true for a road-only tile with no finished improvement', () => {
      expect(canPillageTile(makeTile({ improvement: 'none', improvementTurnsLeft: 0, hasRoad: true }), 'player')).toBe(true);
    });

    it('is false for a missing tile', () => {
      expect(canPillageTile(undefined, 'player')).toBe(false);
    });
  });

  describe('applyPillageToState', () => {
    it('clears the improvement, awards gold, and heals the unit', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'ai-1' });
      const result = applyPillageToState(state, 'raider');

      expect(result.ok).toBe(true);
      expect(result.goldAwarded).toBe(4 * GOLD_PER_PILLAGE_BUILD_TURN);
      expect(result.improvementPillaged).toBe('farm');
      expect(result.state.map.tiles['1,0'].improvement).toBe('none');
      expect(result.state.map.tiles['1,0'].improvementTurnsLeft).toBe(0);
      expect(result.state.civilizations.player.gold).toBe(10 + 4 * GOLD_PER_PILLAGE_BUILD_TURN);
      expect(result.state.units.raider.health).toBe(100);
      expect(result.state.units.raider.hasActed).toBe(true);
      expect(result.state.units.raider.movementPointsLeft).toBe(0);
    });

    it('also clears a road present on the same tile, in the same action', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'ai-1', hasRoad: true });
      const result = applyPillageToState(state, 'raider');

      expect(result.roadPillaged).toBe(true);
      expect(result.state.map.tiles['1,0'].hasRoad).toBe(false);
    });

    it('caps healing at 100', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'ai-1' });
      state.units.raider = { ...state.units.raider, health: 90 };
      const result = applyPillageToState(state, 'raider');
      expect(result.state.units.raider.health).toBe(100);
    });

    it('refuses to pillage a self-owned tile', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'player' });
      const result = applyPillageToState(state, 'raider');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('own-tile');
      expect(result.state).toBe(state);
    });

    it("reports 'missing-tile', not the misleading 'own-tile', when the unit's tile doesn't exist (#541 second-pass review)", () => {
      const state = makePillageState({ improvement: 'farm', owner: 'ai-1' });
      state.map.tiles = {};
      const result = applyPillageToState(state, 'raider');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('missing-tile');
    });

    it('refuses to pillage a mid-construction improvement with no road', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'ai-1', improvementTurnsLeft: 2 });
      const result = applyPillageToState(state, 'raider');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('nothing-to-pillage');
    });

    it('refuses to act twice — hasActed blocks a second pillage', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'ai-1' });
      state.units.raider = { ...state.units.raider, hasActed: true };
      const result = applyPillageToState(state, 'raider');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('already-acted');
    });

    it('refuses to pillage with a non-combat unit (0 strength)', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'ai-1' });
      const worker = { ...createUnit('worker', 'player', { q: 1, r: 0 }, mkC()), id: 'raider' };
      state.units = { raider: worker };
      const result = applyPillageToState(state, 'raider');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no-strength');
    });

    it('awards zero gold for a road-only tile (no finished improvement)', () => {
      const state = makePillageState({ improvement: 'none', owner: 'ai-1', hasRoad: true });
      const result = applyPillageToState(state, 'raider');
      expect(result.ok).toBe(true);
      expect(result.goldAwarded).toBe(0);
      expect(result.improvementPillaged).toBeNull();
      expect(result.state.map.tiles['1,0'].hasRoad).toBe(false);
    });
  });
});
