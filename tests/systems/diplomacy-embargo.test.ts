import { describe, it, expect } from 'vitest';
import {
  canProposeEmbargo,
  proposeEmbargo,
  joinEmbargo,
  leaveEmbargo,
  enforceEmbargoes,
  cleanupEmbargoes,
} from '@/systems/diplomacy-system';
import type { Embargo } from '@/core/types';

describe('embargoes', () => {
  describe('canProposeEmbargo', () => {
    it('returns true with currency tech in era >= 2', () => {
      expect(canProposeEmbargo(['currency'], 2, [], 'target')).toBe(true);
    });

    it('returns false in era 1 without currency tech', () => {
      expect(canProposeEmbargo([], 1, [], 'target')).toBe(false);
    });

    it('returns false if target is ally', () => {
      const alliances = [{ type: 'alliance' as const, civA: 'self', civB: 'target', turnsRemaining: -1 }];
      expect(canProposeEmbargo(['currency'], 2, alliances, 'target')).toBe(false);
    });

    it('returns false if vassal', () => {
      expect(canProposeEmbargo(['currency'], 2, [], 'target', true)).toBe(false);
    });
  });

  describe('proposeEmbargo', () => {
    it('creates a new embargo with proposer as participant', () => {
      const embargoes: Embargo[] = [];
      const result = proposeEmbargo(embargoes, 'proposer', 'target', 10);
      expect(result).toHaveLength(1);
      expect(result[0].targetCivId).toBe('target');
      expect(result[0].participants).toContain('proposer');
    });

    it('merges into existing embargo for same target', () => {
      const embargoes: Embargo[] = [
        { id: 'emb-1', targetCivId: 'target', participants: ['civ-a'], proposedTurn: 5 },
      ];
      const result = proposeEmbargo(embargoes, 'civ-b', 'target', 10);
      expect(result).toHaveLength(1);
      expect(result[0].participants).toContain('civ-a');
      expect(result[0].participants).toContain('civ-b');
    });
  });

  describe('joinEmbargo', () => {
    it('adds participant to embargo', () => {
      const embargoes: Embargo[] = [
        { id: 'emb-1', targetCivId: 'target', participants: ['civ-a'], proposedTurn: 5 },
      ];
      const result = joinEmbargo(embargoes, 'emb-1', 'civ-b');
      expect(result[0].participants).toContain('civ-b');
    });
  });

  describe('leaveEmbargo', () => {
    it('removes participant from embargo', () => {
      const embargoes: Embargo[] = [
        { id: 'emb-1', targetCivId: 'target', participants: ['civ-a', 'civ-b'], proposedTurn: 5 },
      ];
      const result = leaveEmbargo(embargoes, 'emb-1', 'civ-a');
      expect(result[0].participants).not.toContain('civ-a');
    });
  });

  describe('enforceEmbargoes', () => {
    it('removes trade routes between participant and target', () => {
      const embargoes: Embargo[] = [
        { id: 'emb-1', targetCivId: 'target', participants: ['civ-a'], proposedTurn: 5 },
      ];
      const routes = [
        { fromCityId: 'city-1', foreignCivId: 'target' },
        { fromCityId: 'city-2', foreignCivId: 'neutral' },
      ];
      const cityOwners = { 'city-1': 'civ-a', 'city-2': 'civ-a' };
      const result = enforceEmbargoes(embargoes, routes as any, cityOwners);
      expect(result).toHaveLength(1);
      expect(result[0].foreignCivId).toBe('neutral');
    });

    it('also blocks embargoed civ trading with participants', () => {
      const embargoes: Embargo[] = [
        { id: 'emb-1', targetCivId: 'target', participants: ['civ-a'], proposedTurn: 5 },
      ];
      const routes = [{ fromCityId: 'city-t', foreignCivId: 'civ-a' }];
      const cityOwners = { 'city-t': 'target' };
      const result = enforceEmbargoes(embargoes, routes as any, cityOwners);
      expect(result).toHaveLength(0);
    });
  });

  describe('cleanupEmbargoes', () => {
    it('removes embargoes with no participants', () => {
      const embargoes: Embargo[] = [
        { id: 'emb-1', targetCivId: 'target', participants: [], proposedTurn: 5 },
        { id: 'emb-2', targetCivId: 'other', participants: ['civ-a'], proposedTurn: 5 },
      ];
      const result = cleanupEmbargoes(embargoes);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('emb-2');
    });
  });
});
