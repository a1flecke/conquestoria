import { describe, it, expect } from 'vitest';
import {
  generateQuest,
  checkQuestCompletion,
  processQuestExpiry,
  awardQuestReward,
  isQuestTargetKnownToPlayer,
} from '@/systems/quest-system';
import type { Quest } from '@/core/types';

describe('quest system', () => {
  describe('generateQuest', () => {
    it('generates destroy_camp quest for militaristic archetype', () => {
      const quest = generateQuest('militaristic', 'mc-sparta', 'player', 1, {
        barbarianCamps: { camp1: { id: 'camp1', position: { q: 5, r: 5 }, strength: 5, spawnCooldown: 0 } },
        era: 1,
        minorCivs: {
          'mc-sparta': { cityId: 'city-sparta' },
        },
        cities: {
          'city-sparta': {
            id: 'city-sparta',
            owner: 'mc-sparta',
            position: { q: 4, r: 5 },
            ownedTiles: [{ q: 4, r: 5 }],
          },
        },
        units: {},
      } as any, () => 0.1);
      expect(quest).toBeDefined();
      expect(quest!.type).toBe('destroy_camp');
      expect(quest!.status).toBe('active');
      expect(quest!.turnIssued).toBe(1);
    });

    it('generates gift_gold quest for mercantile archetype', () => {
      const quest = generateQuest('mercantile', 'mc-carthage', 'player', 5, {
        barbarianCamps: {},
        era: 1,
      } as any, () => 0.1);
      expect(quest).toBeDefined();
      expect(quest!.type).toBe('gift_gold');
      expect((quest!.target as any).amount).toBe(25);
    });

    it('scales gift_gold amount by era', () => {
      const quest = generateQuest('mercantile', 'mc-carthage', 'player', 5, {
        barbarianCamps: {},
        era: 3,
      } as any, () => 0.1);
      expect(quest).toBeDefined();
      expect((quest!.target as any).amount).toBe(75);
    });

    it('returns null if no valid targets exist', () => {
      const quest = generateQuest('militaristic', 'mc-sparta', 'player', 1, {
        barbarianCamps: {},
        era: 1,
      } as any, () => 0.0);
      // Should fall back to another type or return null
      expect(quest === null || quest.type !== 'destroy_camp').toBe(true);
    });

    it('sets expiry 20 turns from issued turn', () => {
      const quest = generateQuest('mercantile', 'mc-carthage', 'player', 10, {
        barbarianCamps: {},
        era: 1,
      } as any, () => 0.1);
      expect(quest).toBeDefined();
      expect(quest!.expiresOnTurn).toBe(30);
    });

    it('preserves chainNext field as undefined', () => {
      const quest = generateQuest('mercantile', 'mc-carthage', 'player', 1, {
        barbarianCamps: {},
        era: 1,
      } as any, () => 0.1);
      expect(quest).toBeDefined();
      expect(quest!.chainNext).toBeUndefined();
    });

    it('does not emit trade_route quests while the trade-route gameplay loop is unsupported', () => {
      const quest = generateQuest('mercantile', 'mc-carthage', 'player', 5, {
        barbarianCamps: {},
        era: 1,
        minorCivs: {
          'mc-carthage': { cityId: 'city-carthage' },
        },
        cities: {
          'city-carthage': {
            id: 'city-carthage',
            owner: 'mc-carthage',
            position: { q: 5, r: 5 },
            ownedTiles: [{ q: 5, r: 5 }],
          },
        },
        units: {},
        civilizations: {
          player: { units: [], cities: [] },
        },
        map: { tiles: {} },
      } as any, () => 0.8);
      expect(quest?.type).not.toBe('trade_route');
    });

    it('returns null when no nearby hostile units exist for a defeat_units quest', () => {
      const quest = generateQuest('militaristic', 'mc-sparta', 'player', 5, {
        barbarianCamps: {},
        era: 1,
        minorCivs: {
          'mc-sparta': { cityId: 'city-sparta' },
        },
        cities: {
          'city-sparta': {
            id: 'city-sparta',
            owner: 'mc-sparta',
            position: { q: 5, r: 5 },
            ownedTiles: [{ q: 5, r: 5 }],
          },
        },
        units: {},
        civilizations: {
          player: { units: [], cities: [] },
        },
        map: { tiles: {} },
      } as any, () => 0.8);
      expect(quest).toBeNull();
    });

    it('targets the nearby barbarian camp instead of a faraway one', () => {
      const quest = generateQuest('militaristic', 'mc-sparta', 'player', 1, {
        barbarianCamps: {
          far: { id: 'far', position: { q: 20, r: 20 }, strength: 5, spawnCooldown: 0 },
          near: { id: 'near', position: { q: 6, r: 5 }, strength: 5, spawnCooldown: 0 },
        },
        era: 1,
        minorCivs: {
          'mc-sparta': { cityId: 'city-sparta' },
        },
        cities: {
          'city-sparta': {
            id: 'city-sparta',
            owner: 'mc-sparta',
            position: { q: 5, r: 5 },
            ownedTiles: [{ q: 5, r: 5 }],
          },
        },
        units: {},
        civilizations: {
          player: { units: [], cities: [] },
        },
        map: { tiles: {} },
      } as any, () => 0.1);
      expect(quest).toBeDefined();
      expect((quest!.target as any).campId).toBe('near');
    });
  });

  describe('checkQuestCompletion', () => {
    it('completes destroy_camp when camp no longer exists', () => {
      const quest: Quest = {
        id: 'q1', type: 'destroy_camp', description: 'test',
        target: { type: 'destroy_camp', campId: 'camp1' },
        reward: { relationshipBonus: 25, gold: 50 },
        progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: 21,
      };
      const result = checkQuestCompletion(quest, { barbarianCamps: {} } as any);
      expect(result).toBe(true);
    });

    it('does not complete destroy_camp when camp still exists', () => {
      const quest: Quest = {
        id: 'q1', type: 'destroy_camp', description: 'test',
        target: { type: 'destroy_camp', campId: 'camp1' },
        reward: { relationshipBonus: 25 },
        progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: 21,
      };
      const result = checkQuestCompletion(quest, {
        barbarianCamps: { camp1: { id: 'camp1', position: { q: 0, r: 0 }, strength: 5, spawnCooldown: 0 } },
      } as any);
      expect(result).toBe(false);
    });

    it('completes gift_gold when progress >= target amount', () => {
      const quest: Quest = {
        id: 'q2', type: 'gift_gold', description: 'test',
        target: { type: 'gift_gold', amount: 50 },
        reward: { relationshipBonus: 20 },
        progress: 50, status: 'active', turnIssued: 1, expiresOnTurn: 21,
      };
      const result = checkQuestCompletion(quest, {} as any);
      expect(result).toBe(true);
    });
  });

  describe('processQuestExpiry', () => {
    it('marks quest as expired when turn exceeds expiry', () => {
      const quest: Quest = {
        id: 'q1', type: 'destroy_camp', description: 'test',
        target: { type: 'destroy_camp', campId: 'camp1' },
        reward: { relationshipBonus: 25 },
        progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: 21,
      };
      const result = processQuestExpiry(quest, 22);
      expect(result.status).toBe('expired');
    });

    it('does not expire quest before expiry turn', () => {
      const quest: Quest = {
        id: 'q1', type: 'destroy_camp', description: 'test',
        target: { type: 'destroy_camp', campId: 'camp1' },
        reward: { relationshipBonus: 25 },
        progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: 21,
      };
      const result = processQuestExpiry(quest, 15);
      expect(result.status).toBe('active');
    });

    it('does not expire quest with null expiry', () => {
      const quest: Quest = {
        id: 'q1', type: 'gift_gold', description: 'test',
        target: { type: 'gift_gold', amount: 50 },
        reward: { relationshipBonus: 20 },
        progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: null,
      };
      const result = processQuestExpiry(quest, 999);
      expect(result.status).toBe('active');
    });
  });

  describe('awardQuestReward', () => {
    it('returns relationship bonus and gold', () => {
      const reward = { relationshipBonus: 25, gold: 50 };
      const result = awardQuestReward(reward);
      expect(result.relationshipBonus).toBe(25);
      expect(result.gold).toBe(50);
    });
  });

  describe('quest target visibility', () => {
    it('treats a city-targeted quest as unknown when the city has not been discovered', () => {
      const quest = {
        id: 'q-city',
        type: 'defeat_units',
        description: 'Clear 2 units from Rome',
        target: { type: 'defeat_units', count: 2, nearPosition: { q: 6, r: 0 }, radius: 8, cityId: 'rome' },
        reward: { relationshipBonus: 20 },
        progress: 0,
        status: 'active',
        turnIssued: 1,
        expiresOnTurn: 21,
      } as unknown as Quest;

      const state = {
        cities: {
          rome: {
            id: 'rome',
            owner: 'outsider',
            name: 'Rome',
            position: { q: 6, r: 0 },
          },
        },
        civilizations: {
          player: {
            visibility: { tiles: {} },
            knownCivilizations: ['outsider'],
          },
        },
      } as any;

      expect(isQuestTargetKnownToPlayer(state, 'player', quest)).toBe(false);
    });
  });
});
