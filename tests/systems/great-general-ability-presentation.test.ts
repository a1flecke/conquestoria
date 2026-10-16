import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, Unit } from '@/core/types';
import { issueLastStand, issueRally, issueSeizeTheMoment } from '@/systems/great-general-abilities';
import { describeGeneralAbilityMoment, MAX_DRAWN_AFFECTED_HEXES } from '@/systems/great-general-ability-presentation';
import { resolveGeneralDefinition } from '@/systems/great-general-definitions';
import { getGeneralPresentation } from '@/systems/great-general-presentation';

// #889: what a Great General command looked like, derived from the before/after difference.

function unit(id: string, overrides: Partial<Unit> = {}): Unit {
  return {
    id, type: 'warrior', owner: 'player', position: { q: 1, r: 0 }, movementPointsLeft: 1, health: 40,
    experience: 0, hasMoved: false, hasActed: false, isResting: false, ...overrides,
  } as Unit;
}

function world(seed: string, generalOverrides: Partial<Unit> = {}): GameState {
  const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed });
  state.units['gen-1'] = unit('gen-1', {
    type: 'great_general', position: { q: 0, r: 0 }, health: 100, generalDefinitionId: 'gen_hannibal', ...generalOverrides,
  });
  state.civilizations.player.units = ['gen-1'];
  return state;
}

function addUnits(state: GameState, units: Unit[]): GameState {
  for (const u of units) state.units[u.id] = u;
  state.civilizations.player.units = ['gen-1', ...units.map(u => u.id)];
  return state;
}

const hurt = { landSupply: { state: 'severe', hostileUnsupportedTurns: 6, suppliedTurnsSinceRecovery: 0 } } as Partial<Unit>;

describe('describeGeneralAbilityMoment (#889)', () => {
  it('Rally: names the units steadied and the HP restored, in the General\'s crest colours', () => {
    const before = addUnits(world('gap-rally-1'), [unit('u1', hurt), unit('u2', { ...hurt, position: { q: 1, r: 1 } })]);
    const after = issueRally(before, 'gen-1');
    const moment = describeGeneralAbilityMoment('rally', before, after, 'gen-1');

    expect(moment).not.toBeNull();
    expect(moment!.kind).toBe('rally');
    expect(moment!.affectedCount).toBe(2);
    expect(moment!.summary).toMatch(/^Rally: 2 units steadied, \d+ HP restored\.$/);
    const restored = ['u1', 'u2'].reduce((sum, id) => sum + (after.units[id]!.health - before.units[id]!.health), 0);
    expect(moment!.summary).toContain(`${restored} HP`);
    const presentation = getGeneralPresentation(resolveGeneralDefinition(before, 'gen_hannibal')!);
    expect(moment!.accent).toBe(presentation.primary);
    expect(moment!.glow).toBe(presentation.secondary);
    expect(moment!.generalCoord).toEqual({ q: 0, r: 0 });
    expect(moment!.isFinalCommand).toBe(false);
  });

  it('Seize the Moment: counts only the units that can act again', () => {
    const before = addUnits(world('gap-seize-1'), [
      unit('u1', { hasActed: true }), unit('u2', { hasActed: true, position: { q: 1, r: 1 } }), unit('u3', { position: { q: 0, r: 1 } }),
    ]);
    const after = issueSeizeTheMoment(before, 'gen-1', ['u1']);
    const moment = describeGeneralAbilityMoment('seize', before, after, 'gen-1');

    expect(moment!.affectedCount).toBe(1);
    expect(moment!.affectedCoords).toEqual([{ q: 1, r: 0 }]);
    expect(moment!.summary).toBe('Seize the Moment: 1 unit can act again.');
  });

  it('Last Stand: states the defence bonus and how long it lasts', () => {
    const before = { ...addUnits(world('gap-ls-1'), [unit('u1'), unit('u2', { position: { q: 1, r: 1 } })]), turn: 4 };
    const after = issueLastStand(before, 'gen-1', { q: 1, r: 0 });
    const moment = describeGeneralAbilityMoment('last-stand', before, after, 'gen-1');

    expect(moment!.affectedCount).toBe(2);
    const hold = after.units.u1!.lastStandHold!;
    const percent = Math.round((hold.defenseBonusMultiplier - 1) * 100);
    expect(moment!.summary).toBe(`Last Stand: 2 units hold the line, +${percent}% defense for ${hold.expiresTurn - before.turn} turns.`);
  });

  it('a command that changed nothing is not celebrated', () => {
    const before = world('gap-none-1'); // nobody nearby to rally
    const after = issueRally(before, 'gen-1');
    expect(after).toBe(before);
    expect(describeGeneralAbilityMoment('rally', before, after, 'gen-1')).toBeNull();
    expect(describeGeneralAbilityMoment('last-stand', before, issueLastStand(before, 'gen-1', { q: 1, r: 0 }), 'gen-1')).toBeNull();
  });

  it('describes only its own ability: a Rally difference is not a Seize or a Last Stand', () => {
    const before = addUnits(world('gap-cross-1'), [unit('u1', hurt)]);
    const after = issueRally(before, 'gen-1');
    expect(describeGeneralAbilityMoment('seize', before, after, 'gen-1')).toBeNull();
    expect(describeGeneralAbilityMoment('last-stand', before, after, 'gen-1')).toBeNull();
  });

  it('the last Command Charge is a Final Command: flagged and the retirement is stated', () => {
    const before = addUnits(world('gap-final-1', { generalCommandChargesUsed: 2 }), [unit('u1', hurt)]);
    const after = issueRally(before, 'gen-1');
    const moment = describeGeneralAbilityMoment('rally', before, after, 'gen-1');

    expect(moment!.isFinalCommand).toBe(true);
    expect(moment!.summary).toMatch(/^Final Command: Rally: 1 unit steadied/);
    expect(moment!.summary).toContain('Hannibal');
    expect(moment!.summary).toContain('retires at the end of this turn');
  });

  it('an ordinary command is not marked final, and the summary says nothing of retirement', () => {
    const before = addUnits(world('gap-final-2', { generalCommandChargesUsed: 1 }), [unit('u1', hurt)]);
    const moment = describeGeneralAbilityMoment('rally', before, issueRally(before, 'gen-1'), 'gen-1');
    expect(moment!.isFinalCommand).toBe(false);
    expect(moment!.summary).not.toMatch(/retire/i);
  });

  it('bounds the hexes drawn, nearest first, and lists each hex once for a stack', () => {
    const many = Array.from({ length: 8 }, (_, i) => unit(`m${i}`, { ...hurt, position: { q: 1, r: i % 2 } }));
    const state = world('gap-bound-1');
    state.units['gen-1'] = { ...state.units['gen-1']!, generalDefinitionId: 'gen_hannibal' };
    const before = addUnits(state, many);
    const after = issueRally(before, 'gen-1');
    const moment = describeGeneralAbilityMoment('rally', before, after, 'gen-1')!;

    // commandCapacity bounds the command; the drawn hexes are distinct and never above the cap.
    const keys = moment.affectedCoords.map(c => `${c.q},${c.r}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeLessThanOrEqual(MAX_DRAWN_AFFECTED_HEXES);
    expect(moment.affectedCount).toBeGreaterThanOrEqual(keys.length);
  });

  it('is a pure reading: neither state is changed', () => {
    const before = addUnits(world('gap-pure-1'), [unit('u1', hurt)]);
    const after = issueRally(before, 'gen-1');
    const beforeJson = JSON.stringify(before);
    const afterJson = JSON.stringify(after);
    describeGeneralAbilityMoment('rally', before, after, 'gen-1');
    expect(JSON.stringify(before)).toBe(beforeJson);
    expect(JSON.stringify(after)).toBe(afterJson);
  });

  it('returns null for a unit that is not a General', () => {
    const before = addUnits(world('gap-nogen-1'), [unit('u1', hurt)]);
    expect(describeGeneralAbilityMoment('rally', before, issueRally(before, 'gen-1'), 'u1')).toBeNull();
  });
});
