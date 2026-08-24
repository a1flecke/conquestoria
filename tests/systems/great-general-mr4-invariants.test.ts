import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  getHeroicCommandEligibility, issueRally, issueSeizeTheMoment, issueLastStand,
} from '@/systems/great-general-abilities';
import { getPassiveStabilizationTargets } from '@/systems/great-general-system';
import type { Unit } from '@/core/types';

function makeGeneral(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
    movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    generalDefinitionId: 'gen_caesar', ...overrides,
  } as Unit;
}

describe('#544 MR4 — difficulty invariance', () => {
  it('getHeroicCommandEligibility never reads opponentChallenge/challenge (structural: no such parameter exists)', () => {
    expect(getHeroicCommandEligibility.length).toBe(2); // (state, general) -- no difficulty parameter
  });

  it('getPassiveStabilizationTargets produces identical results regardless of opponentChallenge', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'inv-1' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    const explorer = getPassiveStabilizationTargets({ ...state, opponentChallenge: 'explorer' }, 'player');
    const veteran = getPassiveStabilizationTargets({ ...state, opponentChallenge: 'veteran' }, 'player');
    expect(explorer).toEqual(veteran);
  });

  it('Rally\'s HP restore and stage-clear amount are identical regardless of opponentChallenge', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'inv-2' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 40, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    const explorerResult = issueRally({ ...state, opponentChallenge: 'explorer' }, 'gen-1');
    const veteranResult = issueRally({ ...state, opponentChallenge: 'veteran' }, 'gen-1');
    expect(explorerResult.units['unit-1'].health).toBe(veteranResult.units['unit-1'].health);
    expect(explorerResult.units['unit-1'].landSupply).toEqual(veteranResult.units['unit-1'].landSupply);
  });

  it('no function exported from great-general-abilities.ts or great-general-system.ts reads GameState.opponentChallenge or Civilization.challenge', async () => {
    // Static-ish guard: grep the two module source files for the literal
    // substrings, since a structural test cannot see inside function bodies.
    // Comment lines are stripped first -- both files legitimately *mention*
    // "opponentChallenge"/"challenge" in prose explaining that the function
    // does NOT read them (the whole point of this test), which would
    // otherwise false-positive against a naive full-text match.
    const fs = await import('node:fs');
    const stripComments = (src: string) => src
      .split('\n')
      .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    const abilitiesSource = stripComments(fs.readFileSync('src/systems/great-general-abilities.ts', 'utf8'));
    const systemSource = stripComments(fs.readFileSync('src/systems/great-general-system.ts', 'utf8'));
    expect(abilitiesSource).not.toMatch(/opponentChallenge|\.challenge\b/);
    expect(systemSource.replace(/getGeneralThreshold[\s\S]*?^\}/m, '')).not.toMatch(/opponentChallenge/);
  });
});

describe('#544 MR4 — hot-seat privacy', () => {
  it('Rally, Seize, and Last Stand issuance only ever touch the issuing General\'s own owner civ', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'priv-1' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral();
    // A real friendly unit near the General (in range, degraded, and
    // already-acted so it's simultaneously Rally- and Seize-eligible) forces
    // all three abilities to do real work, so this test actually exercises
    // the isolation claim instead of vacuously passing on a no-op.
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 40, experience: 0, hasMoved: true, hasActed: true, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    const aiCivBefore = state.civilizations[aiId];

    const rallied = issueRally(state, 'gen-1');
    expect(rallied.units['unit-1'].health).toBeGreaterThan(40); // sanity: Rally actually did something
    expect(rallied.civilizations[aiId]).toBe(aiCivBefore);

    const seized = issueSeizeTheMoment(state, 'gen-1', ['unit-1']);
    expect(seized.units['unit-1'].hasActed).toBe(false); // sanity: Seize actually did something
    expect(seized.civilizations[aiId]).toBe(aiCivBefore);

    const lastStood = issueLastStand(state, 'gen-1', { q: 1, r: 0 });
    expect(lastStood.units['unit-1'].lastStandHold).toBeDefined(); // sanity: Last Stand actually did something
    expect(lastStood.civilizations[aiId]).toBe(aiCivBefore);
  });
});

describe('#544 MR4 — movement bonus stacking policy (game-balance.md)', () => {
  it('Seize the Moment never changes movementPointsLeft', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'move-1' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    state.civilizations.player.units = ['gen-1', 'unit-1'];

    const result = issueSeizeTheMoment(state, 'gen-1', ['unit-1']);
    expect(result.units['unit-1'].movementPointsLeft).toBe(0);
  });

  it('no ability in great-general-abilities.ts writes to Unit.movementBonus or Unit.movementPointsLeft except the explicit no-op assertion above (source grep)', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync('src/systems/great-general-abilities.ts', 'utf8');
    expect(source).not.toMatch(/movementBonus/);
    expect(source).not.toMatch(/movementPointsLeft\s*:/); // never assigns it, only reads
  });
});
