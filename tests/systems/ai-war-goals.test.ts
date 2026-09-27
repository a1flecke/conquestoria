import { describe, it, expect } from 'vitest';
import { chooseWarGoal } from '@/ai/ai-war-goals';
import { NATIONAL_INTENT_POSTURE } from '@/ai/ai-national-intent';

describe('chooseWarGoal (#988)', () => {
  it('picks the nearest known enemy city under a non-dominate posture', () => {
    const result = chooseWarGoal({
      posture: NATIONAL_INTENT_POSTURE.expand,
      opponentHasOverlord: false,
      actorIsVassal: false,
      ownCapitalPosition: { q: 0, r: 0 },
      knownEnemyCities: [
        { id: 'far-city', position: { q: 10, r: 10 } },
        { id: 'near-city', position: { q: 1, r: 1 } },
      ],
    });
    expect(result).toEqual({ kind: 'conquer_city', targetCityId: 'near-city' });
  });

  it('breaks distance ties deterministically by city id', () => {
    const result = chooseWarGoal({
      posture: NATIONAL_INTENT_POSTURE.expand,
      opponentHasOverlord: false,
      actorIsVassal: false,
      ownCapitalPosition: { q: 0, r: 0 },
      knownEnemyCities: [
        { id: 'city-b', position: { q: 2, r: 0 } },
        { id: 'city-a', position: { q: 0, r: 2 } },
      ],
    });
    expect(result?.targetCityId).toBe('city-a');
  });

  it('prefers force_vassalage under a dominate posture when the opponent has no overlord', () => {
    const result = chooseWarGoal({
      posture: NATIONAL_INTENT_POSTURE.dominate,
      opponentHasOverlord: false,
      actorIsVassal: false,
      ownCapitalPosition: { q: 0, r: 0 },
      knownEnemyCities: [{ id: 'city-a', position: { q: 1, r: 1 } }],
    });
    expect(result).toEqual({ kind: 'force_vassalage' });
  });

  it('falls back to conquer_city under dominate posture if the opponent already has an overlord', () => {
    const result = chooseWarGoal({
      posture: NATIONAL_INTENT_POSTURE.dominate,
      opponentHasOverlord: true,
      actorIsVassal: false,
      ownCapitalPosition: { q: 0, r: 0 },
      knownEnemyCities: [{ id: 'city-a', position: { q: 1, r: 1 } }],
    });
    expect(result?.kind).toBe('conquer_city');
  });

  it('never proposes any goal for an actor that is itself a vassal (#1054: foreign policy belongs to the overlord)', () => {
    const result = chooseWarGoal({
      posture: NATIONAL_INTENT_POSTURE.dominate,
      opponentHasOverlord: false,
      actorIsVassal: true,
      ownCapitalPosition: { q: 0, r: 0 },
      knownEnemyCities: [{ id: 'city-a', position: { q: 1, r: 1 } }],
    });
    expect(result).toBeNull();
  });

  it('returns null when no enemy city is known and vassalage is not viable (nothing to declare yet)', () => {
    const result = chooseWarGoal({
      posture: NATIONAL_INTENT_POSTURE.expand,
      opponentHasOverlord: true,
      actorIsVassal: false,
      ownCapitalPosition: { q: 0, r: 0 },
      knownEnemyCities: [],
    });
    expect(result).toBeNull();
  });

  it('returns null when the actor has no known capital position', () => {
    const result = chooseWarGoal({
      posture: NATIONAL_INTENT_POSTURE.expand,
      opponentHasOverlord: true,
      actorIsVassal: false,
      ownCapitalPosition: null,
      knownEnemyCities: [{ id: 'city-a', position: { q: 1, r: 1 } }],
    });
    expect(result).toBeNull();
  });

  it('skips a known city with no remembered position', () => {
    const result = chooseWarGoal({
      posture: NATIONAL_INTENT_POSTURE.expand,
      opponentHasOverlord: false,
      actorIsVassal: false,
      ownCapitalPosition: { q: 0, r: 0 },
      knownEnemyCities: [
        { id: 'no-position', position: null },
        { id: 'has-position', position: { q: 3, r: 3 } },
      ],
    });
    expect(result).toEqual({ kind: 'conquer_city', targetCityId: 'has-position' });
  });
});
