// tests/systems/diplomacy-negative.test.ts
import { describe, it, expect } from 'vitest';
import {
  canOfferVassalage,
  canProposeEmbargo,
  canProposeLeague,
  isVassalBlocked,
} from '@/systems/diplomacy-system';

describe('negative tests — blocked actions', () => {
  it('vassal cannot offer vassalage in era 1', () => {
    expect(canOfferVassalage(1, 3, 1, 5, 1)).toBe(false);
  });

  it('vassal cannot offer with peak cities < 2', () => {
    expect(canOfferVassalage(0, 1, 0, 5, 2)).toBe(false);
  });

  it('civ above 50% peak cannot offer vassalage', () => {
    expect(canOfferVassalage(3, 3, 5, 5, 2)).toBe(false);
  });

  it('cannot propose embargo without currency tech in era 1', () => {
    expect(canProposeEmbargo([], 1, [], 'target')).toBe(false);
  });

  it('cannot propose embargo against ally', () => {
    const alliances = [{ type: 'alliance' as const, civA: 'self', civB: 'target', turnsRemaining: -1 }];
    expect(canProposeEmbargo(['currency'], 2, alliances, 'target')).toBe(false);
  });

  it('vassal cannot propose embargo', () => {
    expect(canProposeEmbargo(['currency'], 2, [], 'target', true)).toBe(false);
  });

  it('cannot propose league without writing tech', () => {
    expect(canProposeLeague([], [], null)).toBe(false);
  });

  it('cannot join second league', () => {
    const league = { id: 'l-1', members: ['self', 'other'], formedTurn: 1 };
    expect(canProposeLeague(['science-writing'], [], league)).toBe(false);
  });

  it('vassal cannot propose league', () => {
    expect(canProposeLeague(['science-writing'], [], null, true)).toBe(false);
  });

  it('vassal cannot declare war independently', () => {
    expect(isVassalBlocked('declare_war', true)).toBe(true);
  });

  it('vassal cannot sign treaties independently', () => {
    expect(isVassalBlocked('non_aggression_pact', true)).toBe(true);
    expect(isVassalBlocked('trade_agreement', true)).toBe(true);
    expect(isVassalBlocked('open_borders', true)).toBe(true);
    expect(isVassalBlocked('alliance', true)).toBe(true);
  });

  it('non-vassal is not blocked', () => {
    expect(isVassalBlocked('declare_war', false)).toBe(false);
    expect(isVassalBlocked('propose_embargo', false)).toBe(false);
  });
});
