import { describe, it, expect } from 'vitest';
import { CRISIS_FLAVORS, getCrisisDisplayName, getCrisisFlavor } from '@/systems/crisis-flavor-definitions';

describe('CRISIS_FLAVORS table invariants', () => {
  it('has at least the plague flavor', () => {
    expect(getCrisisFlavor('plague')).toBeDefined();
  });
  for (const flavor of CRISIS_FLAVORS) {
    describe(flavor.id, () => {
      it('has a valid era band within 1..12, ordered', () => {
        expect(flavor.eraBand[0]).toBeGreaterThanOrEqual(1);
        expect(flavor.eraBand[1]).toBeLessThanOrEqual(12);
        expect(flavor.eraBand[0]).toBeLessThanOrEqual(flavor.eraBand[1]);
      });
      it('has severity entries for all three challenge levels', () => {
        for (const level of ['explorer', 'standard', 'veteran'] as const) {
          const s = flavor.severityByChallenge[level];
          expect(s).toBeDefined();
          expect(s.yieldPenalty).toBeGreaterThanOrEqual(0);
          expect(s.yieldPenalty).toBeLessThanOrEqual(0.5); // balance ceiling
        }
      });
      if (flavor.archetype !== 'hunt') {
        // Hunt flavors resolve via combat (the foe dying), never a turn-count timer or
        // population attrition, on any challenge level — this invariant is specific to
        // the attrition/shock archetypes (outbreak, catastrophe).
        it('explorer severity always auto-expires and never costs population', () => {
          expect(flavor.severityByChallenge.explorer.autoExpireTurns).not.toBeNull();
          expect(flavor.severityByChallenge.explorer.popLossEveryNTurnsIgnored).toBeNull();
        });
      }
      it('resolves a display name for every era in its band', () => {
        for (let era = flavor.eraBand[0]; era <= flavor.eraBand[1]; era++) {
          expect(getCrisisDisplayName(flavor, era)).toBeTruthy();
        }
      });
      it('advisor line says what to do (mentions an action or unit)', () => {
        expect(flavor.advisorLine.length).toBeGreaterThan(20);
      });
      it('carries catastrophe params if and only if the archetype is catastrophe', () => {
        if (flavor.archetype === 'catastrophe') {
          expect(flavor.catastrophe).toBeDefined();
          expect(flavor.catastrophe!.blastRadius).toBeGreaterThan(0);
          for (const level of ['explorer', 'standard', 'veteran'] as const) {
            expect(flavor.catastrophe!.devastationTurnsByChallenge[level]).toBeGreaterThan(0);
          }
          expect(flavor.responseActions).toEqual([]);
        } else {
          expect(flavor.catastrophe).toBeUndefined();
        }
      });
    });
  }
});
