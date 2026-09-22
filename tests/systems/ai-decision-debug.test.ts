import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createNewGame } from '@/core/game-state';
import { createEmptyOpponentAIState } from '@/core/opponent-ai-state';
import type { AIStrategicPlan } from '@/core/types';
import { describeWarningTrace } from '@/systems/ai-decision-debug';

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('#1090: ai-decision-debug is never imported by a production UI surface', () => {
  it('no file under src/ui or src/presentation imports ai-decision-debug', () => {
    const offenders: string[] = [];
    for (const dir of ['src/ui', 'src/presentation']) {
      for (const file of listSourceFiles(dir)) {
        const contents = readFileSync(file, 'utf-8');
        if (contents.includes('ai-decision-debug')) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('#1090: describeWarningTrace', () => {
  function baseState() {
    const state = createNewGame({
      civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Debug Trace Test', seed: 'ai-decision-debug',
    });
    state.opponentAI = createEmptyOpponentAIState();
    return state;
  }

  it('correlates a barbarian warningKey back to the camp\'s live plan and archetype', () => {
    const state = baseState();
    const plan: AIStrategicPlan = {
      id: 'plan:camp-1:capture', actorId: 'camp-1', objective: 'raid',
      target: { kind: 'resource', position: { q: 1, r: 1 }, resource: 'iron' },
      theaterId: 't', phase: 'advancing', reasonCodes: ['nearby-opportunity'], commitment: 0.6,
      createdTurn: 1, reconsiderAfterTurn: 3, expiresAfterTurn: 8, lastProgressTurn: 1,
      requiredRoles: {}, assignedUnitIds: [],
    };
    state.opponentAI!.barbarianCamps['camp-1'] = plan;

    const trace = describeWarningTrace(state, {
      viewerId: 'player', actorId: 'barbarian:camp-1', actorName: 'Raiders',
      warningKey: 'player:barbarian:camp-1:raid:1,1', kind: 'raid', evidence: 'visible', playAudio: true,
    });

    expect(trace.source).toBe('barbarian-camp');
    expect(trace.detail).toMatchObject({ objective: 'raid', phase: 'advancing', reasonCodes: ['nearby-opportunity'] });
    expect(trace.detail.archetype).toMatch(/^(raider|predator|warlord)$/);
  });

  it('correlates a posture-shift warningKey back to the civ\'s national intent reasonCodes', () => {
    const state = baseState();
    state.opponentAI!.nationalIntentByCiv['ai-1'] = {
      current: 'dominate', previous: 'expand', selectedTurn: 5, reconsiderAfterTurn: 20,
      shockActive: false, shockFreeStreak: 0, reasonCodes: ['intent-domination-pursuit'],
    };

    const trace = describeWarningTrace(state, {
      viewerId: 'player', actorId: 'ai-1', actorName: 'Rome',
      warningKey: 'player:ai-1:posture-shift', kind: 'posture-shift', posture: 'dominate',
      evidence: 'earned-intel', playAudio: false,
    });

    expect(trace.source).toBe('major-civ-posture');
    expect(trace.detail).toMatchObject({ current: 'dominate', reasonCodes: ['intent-domination-pursuit'] });
  });

  it('correlates a pirate warningKey back to the faction\'s live intel, discriminated by actorId prefix not kind', () => {
    const state = baseState();
    state.pirates = {
      ...state.pirates!,
      intelByCiv: {
        ...state.pirates!.intelByCiv,
        player: {
          'pirate-1': {
            factionId: 'pirate-1', level: 'tracked', discoveredRound: 1, lastUpdatedRound: 2,
            knownBehavior: 'raiding',
          },
        },
      },
    };

    const trace = describeWarningTrace(state, {
      viewerId: 'player', actorId: 'pirate-1', actorName: 'Pirates',
      warningKey: 'player:pirate-1:raid:regional', kind: 'raid', evidence: 'earned-intel', playAudio: true,
    });

    expect(trace.source).toBe('pirate-faction');
    expect(trace.detail).toMatchObject({ knownBehavior: 'raiding', level: 'tracked' });
  });

  it('reports unresolved (not a throw) when the named plan no longer exists', () => {
    const state = baseState();
    const trace = describeWarningTrace(state, {
      viewerId: 'player', actorId: 'barbarian:long-gone', actorName: 'Raiders',
      warningKey: 'player:barbarian:long-gone:raid:1,1', kind: 'raid', evidence: 'visible', playAudio: true,
    });
    expect(trace.source).toBe('unresolved');
  });
});
