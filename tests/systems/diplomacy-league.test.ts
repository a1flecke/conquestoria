import { describe, it, expect } from 'vitest';
import {
  canProposeLeague,
  proposeLeague,
  inviteToLeague,
  petitionLeague,
  votePetition,
  leaveLeague,
  checkLeagueDissolution,
  getLeagueForCiv,
  triggerLeagueDefense,
} from '@/systems/diplomacy-system';
import type { DefensiveLeague, DiplomacyState } from '@/core/types';

function makeDipState(overrides?: Partial<DiplomacyState>): DiplomacyState {
  return {
    relationships: {}, treaties: [], events: [], atWarWith: [],
    treacheryScore: 0,
    vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 3, peakMilitary: 5 },
    ...overrides,
  };
}

describe('defensive leagues', () => {
  describe('canProposeLeague', () => {
    it('returns true with writing tech', () => {
      expect(canProposeLeague(['science-writing'], [], null)).toBe(true);
    });

    it('returns false without writing tech', () => {
      expect(canProposeLeague([], [], null)).toBe(false);
    });

    it('returns false if already in a league', () => {
      const league: DefensiveLeague = { id: 'l-1', members: ['self'], formedTurn: 1 };
      expect(canProposeLeague(['science-writing'], [], league)).toBe(false);
    });

    it('returns false if vassal', () => {
      expect(canProposeLeague(['science-writing'], [], null, true)).toBe(false);
    });
  });

  describe('proposeLeague', () => {
    it('creates a league with two founding members', () => {
      const leagues: DefensiveLeague[] = [];
      const result = proposeLeague(leagues, 'civ-a', 'civ-b', 10);
      expect(result).toHaveLength(1);
      expect(result[0].members).toContain('civ-a');
      expect(result[0].members).toContain('civ-b');
    });
  });

  describe('inviteToLeague', () => {
    it('adds member to existing league', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b'], formedTurn: 5 },
      ];
      const result = inviteToLeague(leagues, 'l-1', 'civ-c');
      expect(result[0].members).toContain('civ-c');
    });
  });

  describe('votePetition', () => {
    it('approves when majority has relationship > 10', () => {
      expect(votePetition({ 'civ-a': 15, 'civ-b': 20, 'civ-c': 5 })).toBe(true);
    });

    it('rejects when majority has relationship <= 10', () => {
      expect(votePetition({ 'civ-a': 5, 'civ-b': 8, 'civ-c': 15 })).toBe(false);
    });
  });

  describe('leaveLeague', () => {
    it('removes member from league', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b', 'civ-c'], formedTurn: 5 },
      ];
      const { leagues: result } = leaveLeague(leagues, 'l-1', 'civ-b');
      expect(result[0].members).not.toContain('civ-b');
    });

    it('dissolves league when < 2 members remain and reports dissolved ID', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b'], formedTurn: 5 },
      ];
      const { leagues: result, dissolvedLeagueIds } = leaveLeague(leagues, 'l-1', 'civ-b');
      expect(result).toHaveLength(0);
      expect(dissolvedLeagueIds).toContain('l-1');
    });
  });

  describe('checkLeagueDissolution', () => {
    it('dissolves league when two members are at war', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b', 'civ-c'], formedTurn: 5 },
      ];
      const atWarPairs = [{ civA: 'civ-a', civB: 'civ-b' }];
      const result = checkLeagueDissolution(leagues, atWarPairs);
      expect(result).toHaveLength(0);
    });

    it('keeps league if no members at war', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b'], formedTurn: 5 },
      ];
      const result = checkLeagueDissolution(leagues, []);
      expect(result).toHaveLength(1);
    });
  });

  describe('getLeagueForCiv', () => {
    it('returns the league a civ belongs to', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b'], formedTurn: 5 },
      ];
      expect(getLeagueForCiv(leagues, 'civ-a')?.id).toBe('l-1');
    });

    it('returns null if civ is not in any league', () => {
      expect(getLeagueForCiv([], 'civ-a')).toBeNull();
    });
  });

  describe('triggerLeagueDefense', () => {
    it('returns list of civs that must declare war', () => {
      const leagues: DefensiveLeague[] = [
        { id: 'l-1', members: ['civ-a', 'civ-b', 'civ-c'], formedTurn: 5 },
      ];
      const result = triggerLeagueDefense(leagues, 'civ-a', 'attacker');
      expect(result).toContain('civ-b');
      expect(result).toContain('civ-c');
      expect(result).not.toContain('civ-a');
    });

    it('returns empty if target not in a league', () => {
      const result = triggerLeagueDefense([], 'civ-a', 'attacker');
      expect(result).toHaveLength(0);
    });
  });
});
