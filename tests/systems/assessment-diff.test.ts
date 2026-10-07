import { describe, expect, it } from 'vitest';
import type { AssessmentDigest, StrategicConstraintKind, VictoryStage } from '@/core/types';
import {
  MAX_ASSESSMENT_CHANGES,
  buildAssessmentDigest,
  diffAssessment,
  getSeverityBucket,
  type StrategicAssessment,
  type StrategicConstraint,
  type VictoryTrajectory,
} from '@/systems/strategic-assessment';

function constraint(kind: StrategicConstraintKind, severity: number, focusCityId?: string): StrategicConstraint {
  return {
    kind,
    severity,
    title: `${kind} title`,
    why: `${kind} is a problem.`,
    ...(focusCityId ? { focusCityId } : {}),
  };
}

function lane(id: string, stage: VictoryStage): VictoryTrajectory {
  return { id, lane: id === 'domination' ? 'domination' : 'world-race', title: `${id} lane`, stage, summary: `${id} summary.` };
}

function assessment(constraints: StrategicConstraint[], victory: VictoryTrajectory[] = []): StrategicAssessment {
  return { viewerCivId: 'player-1', turn: 12, constraints, victory, threats: [], opportunities: [] };
}

const digestOf = (a: StrategicAssessment): AssessmentDigest => buildAssessmentDigest(a);

describe('getSeverityBucket', () => {
  it('uses the documented bands: 1-39 low, 40-69 mid, 70+ high', () => {
    expect([1, 39, 40, 69, 70, 100].map(getSeverityBucket)).toEqual(['low', 'low', 'mid', 'mid', 'high', 'high']);
  });
});

describe('buildAssessmentDigest', () => {
  it('keeps kinds, buckets, focus cities and lane stages, and nothing else', () => {
    const digest = digestOf(assessment([constraint('food', 55, 'city-b'), constraint('gold', 90)], [lane('domination', 'building')]));

    expect(digest).toEqual({
      turn: 12,
      constraints: [{ kind: 'food', bucket: 'mid', focusCityId: 'city-b' }, { kind: 'gold', bucket: 'high' }],
      victory: [{ id: 'domination', stage: 'building' }],
    });
  });
});

describe('diffAssessment (#1238)', () => {
  it('has no history without a previous digest, and invents nothing', () => {
    expect(diffAssessment(undefined, assessment([constraint('food', 80)], [lane('domination', 'at-risk')]))).toEqual([]);
  });

  it('is empty when nothing changed', () => {
    const now = assessment([constraint('food', 50, 'a')], [lane('domination', 'building')]);

    expect(diffAssessment(digestOf(now), now)).toEqual([]);
  });

  it('does not report a value that moves inside its band, or a different focus city', () => {
    const before = digestOf(assessment([constraint('food', 41, 'a')]));

    expect(diffAssessment(before, assessment([constraint('food', 68, 'b')]))).toEqual([]);
  });

  it('reports a new constraint, using its current title and reason', () => {
    const changes = diffAssessment(digestOf(assessment([])), assessment([constraint('unrest', 60)]));

    expect(changes).toEqual([{ kind: 'new', title: 'unrest title', changedBecause: 'unrest is a problem.' }]);
  });

  it('reports a constraint that crossed up into a worse band', () => {
    const changes = diffAssessment(digestOf(assessment([constraint('gold', 45)])), assessment([constraint('gold', 72)]));

    expect(changes.map(c => c.kind)).toEqual(['worsened']);
  });

  it('does not report an improvement as a change (a lower band is not one of the four reported kinds)', () => {
    expect(diffAssessment(digestOf(assessment([constraint('gold', 90)])), assessment([constraint('gold', 45)]))).toEqual([]);
  });

  it('reports a constraint that is gone as resolved, named by kind', () => {
    const changes = diffAssessment(digestOf(assessment([constraint('food', 50)])), assessment([]));

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'resolved', title: 'Food is no longer a concern' });
  });

  it('does not call a constraint resolved when the cap may simply have displaced it', () => {
    const full = [
      constraint('unrest', 90), constraint('gold', 80), constraint('supply', 70), constraint('food', 60), constraint('production', 50),
    ];
    const before = digestOf(assessment([...full, constraint('science', 41)].slice(0, 5)));
    // science was never in the digest; production is displaced by a worse science item, cap still full
    const now = assessment([constraint('unrest', 90), constraint('gold', 80), constraint('supply', 70), constraint('food', 60), constraint('science', 55)]);

    const kinds = diffAssessment(before, now).map(c => c.kind);

    expect(kinds).not.toContain('resolved');
  });

  it('reports a victory lane that changed stage, and a new lane only once something has started', () => {
    const before = digestOf(assessment([], [lane('domination', 'not-started')]));

    const moved = diffAssessment(before, assessment([], [
      lane('domination', 'at-risk'), lane('world-race-first-satellite', 'not-started'),
    ]));
    expect(moved.map(c => [c.kind, c.title])).toEqual([['victory-moved', 'domination lane is at risk']]);

    const started = diffAssessment(before, assessment([], [lane('domination', 'not-started'), lane('world-race-first-satellite', 'building')]));
    expect(started.map(c => c.title)).toEqual(['world-race-first-satellite lane is under way']);
  });

  it('does not report a lane disappearing: the viewer may simply no longer see it', () => {
    const before = digestOf(assessment([], [lane('world-race-first-satellite', 'building')]));

    expect(diffAssessment(before, assessment([], []))).toEqual([]);
  });

  it('keeps at most three items, ordered new/worse by severity, then victory, then resolved', () => {
    const before = digestOf(assessment(
      [constraint('science', 50), constraint('production', 45)],
      [lane('domination', 'not-started')],
    ));
    const now = assessment(
      [constraint('food', 60), constraint('gold', 90), constraint('unrest', 75)],
      [lane('domination', 'at-risk')],
    );

    const changes = diffAssessment(before, now);

    expect(changes).toHaveLength(MAX_ASSESSMENT_CHANGES);
    expect(changes.map(c => c.title)).toEqual(['gold title', 'unrest title', 'food title']);
  });

  it('is deterministic and independent of input ordering', () => {
    const before = digestOf(assessment([constraint('science', 50)]));
    const forward = assessment([constraint('unrest', 60), constraint('gold', 60)], [lane('b', 'building'), lane('a', 'building')]);
    const shuffled = assessment([constraint('gold', 60), constraint('unrest', 60)], [lane('a', 'building'), lane('b', 'building')]);

    expect(diffAssessment(before, forward)).toEqual(diffAssessment(before, shuffled));
    expect(diffAssessment(before, forward)).toEqual(diffAssessment(before, forward));
  });

  it('never reports threats: a threat that stops being listed is not asserted destroyed or retreating', () => {
    const before = digestOf({ ...assessment([]), threats: [{ kind: 'war', civId: 'ai-1', civName: 'Greece', why: 'At war.' }] });
    const now = assessment([]);

    expect(diffAssessment(before, now)).toEqual([]);
  });

  it('does not mutate its inputs', () => {
    const before = digestOf(assessment([constraint('food', 50)]));
    const now = assessment([constraint('gold', 80)]);
    const snapshot = JSON.stringify([before, now]);

    diffAssessment(before, now);

    expect(JSON.stringify([before, now])).toBe(snapshot);
  });
});
