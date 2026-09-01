import { describe, expect, it, vi } from 'vitest';
import {
  getHeroicCommandEligibility, spendHeroicCommandCharge, getRallyPreview, issueRally,
  getSeizeTheMomentEligibleUnits, issueSeizeTheMoment,
  getLastStandPreview, issueLastStand, resolveLastStandDefenseBonus,
} from '@/systems/great-general-abilities';
import { createNewGame } from '@/core/game-state';
import type { GeneralCareerEvent, Unit } from '@/core/types';

export function makeGeneral(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'gen-1',
    type: 'great_general',
    owner: 'player',
    position: { q: 0, r: 0 },
    movementPointsLeft: 3,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
    generalDefinitionId: 'gen_hannibal',
    ...overrides,
  } as Unit;
}

describe('getHeroicCommandEligibility', () => {
  it('is eligible with full charges, no cooldown, and no spawn-turn restriction', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-1' });
    const result = getHeroicCommandEligibility(state, makeGeneral());
    expect(result.eligible).toBe(true);
    expect(result.chargesRemaining).toBe(3);
    expect(result.isFinalCharge).toBe(false);
  });

  it('is ineligible on the General\'s spawn turn (contract §13/§17)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-2' });
    const result = getHeroicCommandEligibility(state, makeGeneral({ generalNoCommandThisTurn: true }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/next turn/i);
  });

  it('is ineligible with zero charges remaining', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-3' });
    const result = getHeroicCommandEligibility(state, makeGeneral({ generalCommandChargesUsed: 3 }));
    expect(result.eligible).toBe(false);
    expect(result.chargesRemaining).toBe(0);
  });

  it('is ineligible while on cooldown, and reports turns remaining', () => {
    const state = { ...createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-4' }), turn: 5 };
    const result = getHeroicCommandEligibility(state, makeGeneral({ generalCommandCooldownUntilTurn: 12 }));
    expect(result.eligible).toBe(false);
    expect(result.cooldownTurnsRemaining).toBe(7);
  });

  it('flags the 3rd charge as isFinalCharge (Final Command, contract §21)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-5' });
    const result = getHeroicCommandEligibility(state, makeGeneral({ generalCommandChargesUsed: 2 }));
    expect(result.eligible).toBe(true);
    expect(result.chargesRemaining).toBe(1);
    expect(result.isFinalCharge).toBe(true);
  });
});

describe('spendHeroicCommandCharge', () => {
  it('increments generalCommandChargesUsed and starts the shared cooldown from the definition', () => {
    const state = { ...createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-6' }), turn: 8 };
    state.units['gen-1'] = makeGeneral();
    const result = spendHeroicCommandCharge(state, 'gen-1');
    expect(result.units['gen-1'].generalCommandChargesUsed).toBe(1);
    expect(result.units['gen-1'].generalCommandCooldownUntilTurn).toBe(18); // turn 8 + cooldownTurns 10
  });

  it('is a no-op state pass-through when the unit id does not resolve to a General', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-7' });
    const result = spendHeroicCommandCharge(state, 'nonexistent');
    expect(result).toBe(state);
  });
});

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
    movementPointsLeft: 1, health: 40, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    ...overrides,
  } as Unit;
}

describe('getRallyPreview / issueRally', () => {
  function setup(severity: 'grace' | 'degraded' | 'severe' = 'severe', health = 40) {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-1' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = makeUnit({
      health,
      landSupply: { state: severity, hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    });
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    return state;
  }

  it('previews the stage transition: severe -> degraded', () => {
    const preview = getRallyPreview(setup('severe'), 'gen-1');
    expect(preview.targets).toHaveLength(1);
    expect(preview.targets[0].stageBefore).toBe('severe');
    expect(preview.targets[0].stageAfter).toBe('degraded');
  });

  it('previews the stage transition: degraded -> grace', () => {
    const preview = getRallyPreview(setup('degraded'), 'gen-1');
    expect(preview.targets[0].stageAfter).toBe('grace');
  });

  it('grace does not reduce further (contract §18: "no extra stage reduction")', () => {
    const preview = getRallyPreview(setup('grace'), 'gen-1');
    expect(preview.targets[0].stageAfter).toBe('grace');
  });

  it('restores bounded HP up to 100, never above', () => {
    const preview = getRallyPreview(setup('severe', 90), 'gen-1');
    expect(preview.targets[0].healthAfter).toBe(100);
    expect(preview.targets[0].healthAfter).toBeLessThanOrEqual(100);
  });

  it('does NOT set Full Supply (contract §18: "Rally does not make units Full Supply")', () => {
    const state = setup('severe');
    const result = issueRally(state, 'gen-1');
    expect(result.units['unit-1'].landSupply!.state).not.toBe('full');
    expect(result.units['unit-1'].landSupply!.state).toBe('degraded');
  });

  it('sets rallyProtectedThisRound on every targeted unit', () => {
    const result = issueRally(setup('severe'), 'gen-1');
    expect(result.units['unit-1'].rallyProtectedThisRound).toBe(true);
  });

  it('spends exactly one charge and starts the shared cooldown', () => {
    const state = { ...setup('severe'), turn: 3 };
    const result = issueRally(state, 'gen-1');
    expect(result.units['gen-1'].generalCommandChargesUsed).toBe(1);
    expect(result.units['gen-1'].generalCommandCooldownUntilTurn).toBe(13);
  });

  it('is a no-op when the General is ineligible (e.g. on cooldown)', () => {
    const state = setup('severe');
    state.units['gen-1'] = { ...state.units['gen-1'], generalCommandCooldownUntilTurn: 999 };
    const result = issueRally(state, 'gen-1');
    expect(result).toBe(state);
  });

  it('does NOT spend a charge when there are zero eligible targets (review fix: never waste a lifetime charge on a no-op)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-4' });
    state.units['gen-1'] = makeGeneral(); // no other units in range at all
    state.civilizations.player.units = ['gen-1'];
    const result = issueRally(state, 'gen-1');
    expect(result).toBe(state);
    expect(result.units['gen-1'].generalCommandChargesUsed).toBeUndefined();
  });

  it('excludes full-supply and stable-unsupported units from targeting', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-2' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = makeUnit({ landSupply: { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 } });
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    expect(getRallyPreview(state, 'gen-1').targets).toHaveLength(0);
  });

  it('prioritizes by missing HP and stage severity, capped at commandCapacity', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-3' });
    state.units['gen-1'] = makeGeneral(); // V1 commandCapacity = 3
    for (let i = 1; i <= 4; i++) {
      state.units[`unit-${i}`] = makeUnit({
        id: `unit-${i}`, health: 100 - i * 10,
        landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
      });
    }
    state.civilizations.player.units = ['gen-1', 'unit-1', 'unit-2', 'unit-3', 'unit-4'];
    const preview = getRallyPreview(state, 'gen-1');
    expect(preview.targets).toHaveLength(3);
    // unit-4 has the most missing HP (60) -- must be included over unit-1 (least missing HP, 90)
    expect(preview.targets.map(t => t.unitId)).toContain('unit-4');
    expect(preview.targets.map(t => t.unitId)).not.toContain('unit-1');
  });
});

describe('getSeizeTheMomentEligibleUnits / issueSeizeTheMoment', () => {
  function setup() {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'seize-1' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = makeUnit({ id: 'unit-1', position: { q: 1, r: 0 }, hasActed: true, hasMoved: true, movementPointsLeft: 0 });
    state.units['unit-2'] = makeUnit({ id: 'unit-2', position: { q: 1, r: 1 }, hasActed: false, hasMoved: false, movementPointsLeft: 2 });
    state.civilizations.player.units = ['gen-1', 'unit-1', 'unit-2'];
    return state;
  }

  it('lists only units that have already acted this turn (contract §19: "must have already used normal action")', () => {
    const { eligible } = getSeizeTheMomentEligibleUnits(setup(), 'gen-1');
    expect(eligible.map(e => e.unitId)).toEqual(['unit-1']);
  });

  it('labels each eligible unit with its real display name and HP, not the raw internal type string (review fix)', () => {
    const { eligible } = getSeizeTheMomentEligibleUnits(setup(), 'gen-1');
    expect(eligible[0].label).not.toBe('warrior'); // not the bare UnitType string
    expect(eligible[0].label).toMatch(/warrior/i); // UNIT_DEFINITIONS.warrior.name contains "Warrior"
    expect(eligible[0].label).toContain('HP');
  });

  it('resets hasActed on selected units so they can act again', () => {
    const result = issueSeizeTheMoment(setup(), 'gen-1', ['unit-1']);
    expect(result.units['unit-1'].hasActed).toBe(false);
  });

  it('does NOT restore movementPointsLeft (contract §19: "no full movement refresh")', () => {
    const state = setup();
    state.units['unit-1'] = { ...state.units['unit-1'], movementPointsLeft: 0 };
    const result = issueSeizeTheMoment(state, 'gen-1', ['unit-1']);
    expect(result.units['unit-1'].movementPointsLeft).toBe(0);
  });

  it('leaves an unselected eligible unit untouched', () => {
    const result = issueSeizeTheMoment(setup(), 'gen-1', ['unit-1']);
    expect(result.units['unit-2'].hasActed).toBe(false); // was already false, unchanged
    expect(result.units['unit-2'].hasMoved).toBe(false);
  });

  it('ignores a selected id that is not actually eligible, and does not spend a charge if that leaves zero valid activations', () => {
    const state = setup();
    const result = issueSeizeTheMoment(state, 'gen-1', ['unit-2']); // unit-2 has NOT acted -- ineligible, so toActivate ends up empty
    expect(result.units['unit-2'].hasActed).toBe(false); // unchanged from its already-false starting value
    expect(result).toBe(state); // review fix: no valid activation -> no charge spent
    expect(result.units['gen-1'].generalCommandChargesUsed).toBeUndefined();
  });

  it('spends exactly one charge regardless of how many units were selected', () => {
    const state = { ...setup(), turn: 2 };
    const result = issueSeizeTheMoment(state, 'gen-1', ['unit-1']);
    expect(result.units['gen-1'].generalCommandChargesUsed).toBe(1);
  });

  it('does NOT spend a charge when confirmed with an empty selection', () => {
    const state = setup();
    const result = issueSeizeTheMoment(state, 'gen-1', []);
    expect(result).toBe(state); // referential no-op
    expect(result.units['gen-1'].generalCommandChargesUsed).toBeUndefined();
  });

  it('caps eligible-unit selection at commandCapacity when previewing', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'seize-2' });
    state.units['gen-1'] = makeGeneral(); // V1 commandCapacity = 3
    for (let i = 1; i <= 4; i++) {
      state.units[`unit-${i}`] = makeUnit({ id: `unit-${i}`, position: { q: 1, r: 0 }, hasActed: true });
    }
    state.civilizations.player.units = ['gen-1', 'unit-1', 'unit-2', 'unit-3', 'unit-4'];
    const result = issueSeizeTheMoment(state, 'gen-1', ['unit-1', 'unit-2', 'unit-3', 'unit-4']);
    const resetCount = ['unit-1', 'unit-2', 'unit-3', 'unit-4'].filter(id => result.units[id].hasActed === false).length;
    expect(resetCount).toBe(3);
  });
});

describe('getLastStandPreview / issueLastStand', () => {
  function setup() {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'ls-1' });
    state.units['gen-1'] = makeGeneral(); // position { q:0, r:0 }, V1 commandRange=2, commandCapacity=3
    state.units['unit-1'] = makeUnit({ id: 'unit-1', position: { q: 1, r: 0 } }); // in the target area
    state.units['worker-1'] = { ...makeUnit({ id: 'worker-1', position: { q: 1, r: 0 } }), type: 'worker' }; // civilian -- must be excluded
    state.civilizations.player.units = ['gen-1', 'unit-1', 'worker-1'];
    return state;
  }

  it('rejects a target hex outside commandRange', () => {
    const state = setup();
    const preview = getLastStandPreview(state, 'gen-1', { q: 10, r: 10 });
    expect(preview.targets).toHaveLength(0);
  });

  it('includes combat units in the target area but excludes civilians', () => {
    const preview = getLastStandPreview(setup(), 'gen-1', { q: 1, r: 0 });
    const ids = preview.targets.map(t => t.unitId);
    expect(ids).toContain('unit-1');
    expect(ids).not.toContain('worker-1');
  });

  it('caps affected units at commandCapacity', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'ls-2' });
    state.units['gen-1'] = makeGeneral();
    for (let i = 1; i <= 4; i++) {
      state.units[`unit-${i}`] = makeUnit({ id: `unit-${i}`, position: { q: 1, r: 0 } });
    }
    state.civilizations.player.units = ['gen-1', 'unit-1', 'unit-2', 'unit-3', 'unit-4'];
    const preview = getLastStandPreview(state, 'gen-1', { q: 1, r: 0 });
    expect(preview.targets).toHaveLength(3);
  });

  it('issuing sets lastStandHold on every affected unit, sharing one formationId', () => {
    const result = issueLastStand(setup(), 'gen-1', { q: 1, r: 0 });
    const hold = result.units['unit-1'].lastStandHold;
    expect(hold).toBeDefined();
    expect(hold!.formationId).toBeTruthy();
    expect(hold!.defenseBonusMultiplier).toBeGreaterThan(1);
  });

  it('spends exactly one charge on issuance', () => {
    const state = { ...setup(), turn: 4 };
    const result = issueLastStand(state, 'gen-1', { q: 1, r: 0 });
    expect(result.units['gen-1'].generalCommandChargesUsed).toBe(1);
  });

  it('persists even conceptually after the General dies -- issuance does not reference the General again', () => {
    const state = { ...setup(), turn: 4 };
    const result = issueLastStand(state, 'gen-1', { q: 1, r: 0 });
    const withoutGeneral = { ...result, units: { ...result.units } };
    delete withoutGeneral.units['gen-1'];
    // resolveLastStandDefenseBonus reads only the unit's own lastStandHold, never the General
    expect(resolveLastStandDefenseBonus(withoutGeneral.units['unit-1'], withoutGeneral.turn).multiplier).toBeGreaterThan(1);
  });

  it('does NOT spend a charge when there are zero eligible targets in the area', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'ls-3' });
    state.units['gen-1'] = makeGeneral();
    state.civilizations.player.units = ['gen-1'];
    const result = issueLastStand(state, 'gen-1', { q: 1, r: 0 });
    expect(result).toBe(state);
    expect(result.units['gen-1'].generalCommandChargesUsed).toBeUndefined();
  });
});

describe('#888 — a generated-identity General is mechanically identical to an authored one', () => {
  const generatedId = 'generated:rome:3:abcd1234';
  function stateWithGeneratedGeneral(seed: string) {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed });
    state.generatedGenerals = {
      [generatedId]: {
        id: generatedId,
        name: 'Marcus Valerius, the Steadfast',
        civTypeEligibility: ['rome'],
        era: 3,
        descriptor: 'Legatus. A Roman field commander, risen through the ranks of the host.',
        portraitIcon: '🦅',
        origin: 'generated',
        commandRange: 2,
        commandCapacity: 3,
        abilityIds: ['rally', 'seize_the_moment', 'last_stand'],
        maxCommandCharges: 3,
        cooldownTurns: 10,
      },
    };
    return state;
  }

  it('heroic command eligibility resolves through the registry (charges, final-charge flag)', () => {
    const state = stateWithGeneratedGeneral('gen888-elig');
    const eligible = getHeroicCommandEligibility(state, makeGeneral({ generalDefinitionId: generatedId }));
    expect(eligible.eligible).toBe(true);
    expect(eligible.chargesRemaining).toBe(3);
    const final = getHeroicCommandEligibility(state, makeGeneral({ generalDefinitionId: generatedId, generalCommandChargesUsed: 2 }));
    expect(final.isFinalCharge).toBe(true);
  });

  it('Rally / Seize / Last Stand all issue and spend a charge exactly as for an authored General', () => {
    // Rally
    let state = stateWithGeneratedGeneral('gen888-rally');
    state.units['gen-1'] = makeGeneral({ generalDefinitionId: generatedId });
    state.units['unit-1'] = makeUnit({
      id: 'unit-1', position: { q: 1, r: 0 },
      landSupply: { state: 'severe', hostileUnsupportedTurns: 6, suppliedTurnsSinceRecovery: 0 },
    });
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    const rallyPreview = getRallyPreview(state, 'gen-1');
    expect(rallyPreview.eligibility.eligible).toBe(true);
    expect(rallyPreview.targets.length).toBeGreaterThan(0);
    const rallied = issueRally(state, 'gen-1');
    expect(rallied.units['gen-1'].generalCommandChargesUsed).toBe(1);

    // Seize the Moment
    state = stateWithGeneratedGeneral('gen888-seize');
    state.units['gen-1'] = makeGeneral({ generalDefinitionId: generatedId });
    state.units['unit-1'] = makeUnit({ id: 'unit-1', position: { q: 1, r: 0 }, hasActed: true, hasMoved: true, movementPointsLeft: 0 });
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    const { eligibility: seizeElig, eligible } = getSeizeTheMomentEligibleUnits(state, 'gen-1');
    expect(seizeElig.eligible).toBe(true);
    expect(eligible.length).toBeGreaterThan(0);
    const seized = issueSeizeTheMoment(state, 'gen-1', [eligible[0]!.unitId]);
    expect(seized.units['gen-1'].generalCommandChargesUsed).toBe(1);

    // Last Stand
    state = stateWithGeneratedGeneral('gen888-laststand');
    state.units['gen-1'] = makeGeneral({ generalDefinitionId: generatedId });
    state.units['unit-1'] = makeUnit({ id: 'unit-1', type: 'warrior', position: { q: 1, r: 0 } });
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    const lsPreview = getLastStandPreview(state, 'gen-1', { q: 1, r: 0 });
    expect(lsPreview.eligibility.eligible).toBe(true);
    const held = issueLastStand(state, 'gen-1', { q: 1, r: 0 });
    expect(held.units['gen-1'].generalCommandChargesUsed).toBe(1);
  });

  it('a General whose id is missing from the registry degrades safely (ineligible, no throw)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'gen888-missing' });
    const result = getHeroicCommandEligibility(state, makeGeneral({ generalDefinitionId: 'generated:rome:3:missing00' }));
    expect(result.eligible).toBe(false);
    expect(result.chargesRemaining).toBe(0);
  });
});

describe('resolveLastStandDefenseBonus', () => {
  it('returns multiplier 1 for a unit with no lastStandHold', () => {
    expect(resolveLastStandDefenseBonus(makeUnit(), 5).multiplier).toBe(1);
  });

  it('returns the bonus multiplier while unexpired', () => {
    const unit = makeUnit({ lastStandHold: { formationId: 'f1', defenseBonusMultiplier: 1.15, expiresTurn: 10 } });
    const result = resolveLastStandDefenseBonus(unit, 8);
    expect(result.multiplier).toBe(1.15);
    expect(result.label).toBeTruthy();
  });

  it('returns multiplier 1 once expired', () => {
    const unit = makeUnit({ lastStandHold: { formationId: 'f1', defenseBonusMultiplier: 1.15, expiresTurn: 10 } });
    expect(resolveLastStandDefenseBonus(unit, 11).multiplier).toBe(1);
  });
});

// ===========================================================================
// #885 — per-specialty ability magnitudes
// ===========================================================================

const G = (overrides = {}) => createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 's885', ...overrides });

describe('#885 specialty-resolved command stats / charges / cooldown', () => {
  it('a Tireless (endurance) General has 4 charges remaining at full', () => {
    const r = getHeroicCommandEligibility(G(), makeGeneral({ generalDefinitionId: 'gen_shaka' }));
    expect(r.chargesRemaining).toBe(4);
    expect(r.isFinalCharge).toBe(false);
  });

  it('a Tireless General is on its final charge only at used=3', () => {
    const r = getHeroicCommandEligibility(G(), makeGeneral({ generalDefinitionId: 'gen_shaka', generalCommandChargesUsed: 3 }));
    expect(r.eligible).toBe(true);
    expect(r.isFinalCharge).toBe(true);
  });

  it('a Bold (initiative) General starts a 7-turn cooldown when it spends a charge', () => {
    const state = { ...G(), turn: 8 };
    state.units['gen-1'] = makeGeneral({ generalDefinitionId: 'gen_caesar' });
    const after = spendHeroicCommandCharge(state, 'gen-1');
    expect(after.units['gen-1']!.generalCommandCooldownUntilTurn).toBe(15); // 8 + 7
  });

  it('a Supply Master (logistician) General starts a 13-turn cooldown', () => {
    const state = { ...G(), turn: 2 };
    state.units['gen-1'] = makeGeneral({ generalDefinitionId: 'gen_yuefei' });
    const after = spendHeroicCommandCharge(state, 'gen-1');
    expect(after.units['gen-1']!.generalCommandCooldownUntilTurn).toBe(15); // 2 + 13
  });
});

function stateWithHurtUnit(seed: string, generalId: string, hp = 40) {
  const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed });
  state.units['gen-1'] = makeGeneral({ generalDefinitionId: generalId });
  state.units['u1'] = {
    id: 'u1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
    movementPointsLeft: 1, health: hp, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
  } as Unit;
  state.civilizations.player.units = ['gen-1', 'u1'];
  return state;
}

describe('#885 Rally heal scales with specialty', () => {
  it('baseline (generalist) heals +30', () => {
    expect(getRallyPreview(stateWithHurtUnit('r-base', 'gen_hannibal'), 'gen-1').targets[0]!.healthAfter).toBe(70);
  });
  it('Supply Master (logistician) heals +50', () => {
    expect(getRallyPreview(stateWithHurtUnit('r-log', 'gen_yuefei'), 'gen-1').targets[0]!.healthAfter).toBe(90);
  });
  it('Tireless (endurance) heals +20', () => {
    expect(getRallyPreview(stateWithHurtUnit('r-end', 'gen_shaka'), 'gen-1').targets[0]!.healthAfter).toBe(60);
  });
  it('never exceeds 100', () => {
    expect(getRallyPreview(stateWithHurtUnit('r-cap', 'gen_yuefei', 80), 'gen-1').targets[0]!.healthAfter).toBe(100);
  });
});

function stateWithFormation(seed: string, generalId: string) {
  const state = createNewGame({ civType: 'england', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed });
  state.units['gen-1'] = makeGeneral({ generalDefinitionId: generalId });
  state.units['u1'] = {
    id: 'u1', type: 'swordsman', owner: 'player', position: { q: 1, r: 0 },
    movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  } as Unit;
  state.civilizations.player.units = ['gen-1', 'u1'];
  return state;
}

describe('#885 Last Stand scales with specialty', () => {
  it('baseline (generalist): +15% for 2 turns', () => {
    const p = getLastStandPreview(stateWithFormation('ls-base', 'gen_hannibal'), 'gen-1', { q: 1, r: 0 });
    expect(p.defenseBonusPercent).toBe(15);
    expect(p.durationTurns).toBe(2);
  });
  it('Defensive Commander: +25% for 3 turns; the issued hold carries 1.25', () => {
    const s = stateWithFormation('ls-def', 'gen_wellington');
    const p = getLastStandPreview(s, 'gen-1', { q: 1, r: 0 });
    expect(p.defenseBonusPercent).toBe(25);
    expect(p.durationTurns).toBe(3);
    const after = issueLastStand(s, 'gen-1', { q: 1, r: 0 });
    expect(after.units['u1']!.lastStandHold!.defenseBonusMultiplier).toBe(1.25);
    expect(after.units['u1']!.lastStandHold!.expiresTurn).toBe(s.turn + 3);
  });
  it('Bold Commander: weaker +10% Last Stand', () => {
    const p = getLastStandPreview(stateWithFormation('ls-init', 'gen_caesar'), 'gen-1', { q: 1, r: 0 });
    expect(p.defenseBonusPercent).toBe(10);
  });
});

function stateWithActedUnits(seed: string, generalId: string, n: number) {
  const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed });
  state.units['gen-1'] = makeGeneral({ generalDefinitionId: generalId });
  const ids: string[] = ['gen-1'];
  for (let i = 0; i < n; i++) {
    const id = `w${i}`;
    state.units[id] = {
      id, type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    ids.push(id);
  }
  state.civilizations.player.units = ids;
  return { state, ids: ids.slice(1) };
}

describe('#885 Seize the Moment extra-target for Bold Commander', () => {
  it('baseline (generalist) activates at most commandCapacity (3) units', () => {
    const { state, ids } = stateWithActedUnits('sz-base', 'gen_hannibal', 5);
    const after = issueSeizeTheMoment(state, 'gen-1', ids);
    expect(ids.filter(id => after.units[id]!.hasActed === false)).toHaveLength(3);
  });
  it('Bold Commander activates commandCapacity + 1 (4) units', () => {
    const { state, ids } = stateWithActedUnits('sz-init', 'gen_caesar', 5);
    const after = issueSeizeTheMoment(state, 'gen-1', ids);
    expect(ids.filter(id => after.units[id]!.hasActed === false)).toHaveLength(4);
  });
  it('Bold Commander still does NOT refund movement points', () => {
    const { state, ids } = stateWithActedUnits('sz-mov', 'gen_caesar', 2);
    const after = issueSeizeTheMoment(state, 'gen-1', ids);
    expect(after.units[ids[0]!]!.movementPointsLeft).toBe(0);
  });
});

// ===========================================================================
// #887 MR1 — career events at ability issuance points
// ===========================================================================

function withHistory(state: ReturnType<typeof createNewGame>, generalId = 'gen_hannibal') {
  state.civilizations.player.generalHistory = [
    { unitId: 'gen-1', generalDefinitionId: generalId, spawnedTurn: 1, careerEvents: [{ type: 'spawned', turn: 1 }] },
  ];
  return state;
}
function events(state: ReturnType<typeof createNewGame>): GeneralCareerEvent[] {
  return state.civilizations.player.generalHistory![0]!.careerEvents ?? [];
}

describe('#887 Rally records exactly one rally-used with counts', () => {
  function hurtState(seed: string, generalId = 'gen_hannibal') {
    const state = withHistory(createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed }), generalId);
    state.units['gen-1'] = makeGeneral({ generalDefinitionId: generalId });
    state.units['u1'] = {
      id: 'u1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 40, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'u1'];
    return state;
  }
  it('successful Rally → one rally-used (unitsAffected 1, totalHpRestored 30)', () => {
    const after = issueRally(hurtState('c887-r1'), 'gen-1');
    const ev = events(after).filter(e => e.type === 'rally-used');
    expect(ev).toEqual([{ type: 'rally-used', turn: 1, unitsAffected: 1, totalHpRestored: 30 }]);
  });
  it('ineligible Rally (nothing in range) → no rally-used', () => {
    const s = withHistory(createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'c887-r2' }));
    s.units['gen-1'] = makeGeneral();
    s.civilizations.player.units = ['gen-1'];
    const after = issueRally(s, 'gen-1');
    expect(events(after).some(e => e.type === 'rally-used')).toBe(false);
  });
});

describe('#887 Seize records seize-used + tags units with seizeGrantedBy', () => {
  function actedState(seed: string) {
    const state = withHistory(createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed }));
    state.units['gen-1'] = makeGeneral();
    state.units['w0'] = { id: 'w0', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false } as Unit;
    state.civilizations.player.units = ['gen-1', 'w0'];
    return state;
  }
  it('successful Seize → one seize-used; the refreshed unit carries seizeGrantedBy for this turn', () => {
    const after = issueSeizeTheMoment(actedState('c887-s1'), 'gen-1', ['w0']);
    expect(events(after).filter(e => e.type === 'seize-used')).toEqual([{ type: 'seize-used', turn: 1, unitsRefreshed: 1 }]);
    expect(after.units['w0']!.seizeGrantedBy).toEqual({ generalDefinitionId: 'gen_hannibal', turn: 1 });
  });
  it('empty selection → no seize-used', () => {
    const after = issueSeizeTheMoment(actedState('c887-s2'), 'gen-1', []);
    expect(events(after).some(e => e.type === 'seize-used')).toBe(false);
  });
});

describe('#887 Last Stand records last-stand-issued + stamps the hold with the issuer id', () => {
  it('successful Last Stand → last-stand-issued; every protected unit hold.generalDefinitionId is the General id', () => {
    const state = withHistory(createNewGame({ civType: 'england', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'c887-ls' }));
    state.units['gen-1'] = makeGeneral();
    state.units['u1'] = { id: 'u1', type: 'swordsman', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false } as Unit;
    state.civilizations.player.units = ['gen-1', 'u1'];
    const after = issueLastStand(state, 'gen-1', { q: 1, r: 0 });
    expect(events(after).filter(e => e.type === 'last-stand-issued')).toEqual([{ type: 'last-stand-issued', turn: 1, unitsProtected: 1 }]);
    expect(after.units['u1']!.lastStandHold!.generalDefinitionId).toBe('gen_hannibal');
  });
});

describe('#887 Final Command is recorded on the last charge only', () => {
  it('spending the charge that reaches the resolved max records final-command; earlier charges do not', () => {
    const base = withHistory(createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'c887-fc' }));
    base.units['gen-1'] = makeGeneral({ generalCommandChargesUsed: 0 });
    const after1 = spendHeroicCommandCharge(base, 'gen-1'); // used 1 of 3
    expect(events(after1).some(e => e.type === 'final-command')).toBe(false);
    const s2 = { ...after1 };
    s2.units = { ...s2.units, 'gen-1': { ...s2.units['gen-1']!, generalCommandChargesUsed: 2 } };
    const after3 = spendHeroicCommandCharge(s2, 'gen-1'); // used 3 of 3
    expect(events(after3).filter(e => e.type === 'final-command')).toEqual([{ type: 'final-command', turn: 1 }]);
  });
});
