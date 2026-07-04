import { describe, expect, it } from 'vitest';
import type { GameEvents } from '@/core/types';
import { presentStrategicWarning } from '@/ui/strategic-warning-presentation';

function warning(
  overrides: Partial<GameEvents['ai:strategic-warning']> = {},
): GameEvents['ai:strategic-warning'] {
  return {
    viewerId: 'player',
    actorId: 'rome',
    actorName: 'Roman',
    warningKey: 'player:rome:mobilizing:border',
    kind: 'mobilizing',
    evidence: 'visible',
    playAudio: true,
    ...overrides,
  };
}

describe('strategic warning presentation', () => {
  it('renders visible mobilization without a hidden target', () => {
    expect(presentStrategicWarning(warning())).toEqual({
      message: 'A Roman force is gathering near our border. Reinforce nearby cities or scout their approach.',
      type: 'warning',
    });
  });

  it('renders a safe visible target and preserves its map link', () => {
    const target = { kind: 'map' as const, coord: { q: 3, r: 4 }, label: 'Ravenna' };
    expect(presentStrategicWarning(warning({
      targetLabel: 'Ravenna',
      target,
    }))).toEqual({
      message: 'A Roman force is gathering against Ravenna. Reinforce the city, disrupt the rally, or seek peace.',
      type: 'warning',
      target,
    });
  });

  it('marks remembered force positions as uncertain', () => {
    expect(presentStrategicWarning(warning({
      evidence: 'remembered',
      regionLabel: 'eastern marches',
    })).message).toBe(
      'Scouts last reported Roman troops gathering in the eastern marches. Their current position is uncertain.',
    );
  });

  it.each([
    [
      { actorId: 'barbarian:camp', actorName: 'Raiders', kind: 'raid', resource: 'iron', targetLabel: 'iron outpost' },
      'Raiders are moving toward the iron outpost. Intercept them or destroy their camp.',
      'warning',
    ],
    [
      { actorId: 'barbarian:camp', actorName: 'Raiders', kind: 'resource-denied', resource: 'iron', regionLabel: 'northern outpost' },
      'Hostile raiders have cut access to iron at the northern outpost. Drive them off to restore the resource.',
      'warning',
    ],
    [
      { actorId: 'barbarian:camp', actorName: 'Raiders', kind: 'resource-restored', resource: 'iron', regionLabel: 'northern outpost' },
      'Access to iron at the northern outpost has been restored.',
      'success',
    ],
    [
      { actorId: 'independent-threats', actorName: 'Raiders', kind: 'recovery' },
      'The raid was broken. Independent threats will need time to regroup.',
      'success',
    ],
  ] as const)('renders required warning copy', (overrides, message, type) => {
    expect(presentStrategicWarning(warning(overrides as Partial<GameEvents['ai:strategic-warning']>)))
      .toMatchObject({ message, type });
  });

  it('uses viewer-safe generic pirate wording', () => {
    const presented = presentStrategicWarning(warning({
      actorId: 'pirate-1',
      actorName: 'Pirates',
      kind: 'blockade',
      evidence: 'earned-intel',
    }));
    expect(presented.message).toBe('Pirate activity indicates a blockade is forming. Review known pirate waters and protect coastal trade.');
    expect(presented.message).not.toContain('pirate-1');
  });
});
