import { describe, expect, it } from 'vitest';
import { createAIDecisionTrace } from '@/ai/ai-decision-trace';

describe('AI decision traces', () => {
  it('keeps only the top twelve candidates in deterministic score order', () => {
    const trace = createAIDecisionTrace({
      actorId: 'ai-1',
      turn: 12,
      decision: 'objective',
      selectedId: 'candidate-14',
      candidates: Array.from({ length: 15 }, (_, index) => ({
        id: `candidate-${index}`,
        score: index,
        eligible: index % 2 === 0,
        reasonCodes: [],
      })),
    });

    expect(trace.candidates).toHaveLength(12);
    expect(trace.candidates[0].id).toBe('candidate-14');
    expect(trace.candidates.at(-1)?.id).toBe('candidate-3');
  });

  it('defensively copies transient trace candidates', () => {
    const candidates = [{
      id: 'candidate',
      score: 10,
      eligible: true,
      reasonCodes: ['nearby'],
    }];
    const trace = createAIDecisionTrace({
      actorId: 'ai-1',
      turn: 12,
      decision: 'objective',
      selectedId: 'candidate',
      candidates,
    });
    candidates[0].reasonCodes.push('mutated');

    expect(trace.candidates[0].reasonCodes).toEqual(['nearby']);
  });
});
