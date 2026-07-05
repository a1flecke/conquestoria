import { describe, expect, it } from 'vitest';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';
import { getGeographicStartAnchor, getStartPositionDistance } from '@/systems/map-generator';
import { selectAIRoster } from '@/systems/ai-roster-selection';
import { MAP_DIMENSIONS } from '@/core/game-state';

function historicalMinimum(ids: string[]): number {
  const map = {
    width: MAP_DIMENSIONS.large.width,
    wrapsHorizontally: true,
  };
  const anchors = ids.map(id => getGeographicStartAnchor('earth', 'large', id));
  let minimum = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const first = anchors[i];
      const second = anchors[j];
      if (first && second) {
        minimum = Math.min(minimum, getStartPositionDistance(map, first, second));
      }
    }
  }
  return minimum;
}

describe('roster-aware AI selection', () => {
  const input = {
    definitions: CIV_DEFINITIONS,
    humanCivilizationTypeIds: ['england'],
    count: 2,
    mapScript: 'earth' as const,
    mapSize: 'large' as const,
    placementMode: 'historical' as const,
    seed: 'issue-439',
  };

  it('selects the exact count without duplicating humans or AI civilizations', () => {
    const result = selectAIRoster(input);

    expect(result.civilizationTypeIds).toHaveLength(2);
    expect(new Set(result.civilizationTypeIds).size).toBe(2);
    expect(result.civilizationTypeIds).not.toContain('england');
  });

  it('is deterministic and independent of catalog order', () => {
    expect(selectAIRoster({ ...input, definitions: [...CIV_DEFINITIONS].reverse() }))
      .toEqual(selectAIRoster(input));
  });

  it('improves historical breathing room over the old clustered roster', () => {
    const result = selectAIRoster(input);

    expect(historicalMinimum(['england', ...result.civilizationTypeIds]))
      .toBeGreaterThan(historicalMinimum(['england', 'germany', 'rome']));
  });

  it('accounts for previously selected AIs rather than scoring only against humans', () => {
    const result = selectAIRoster({ ...input, count: 3 });
    expect(result.minimumHistoricalDistance).toBe(
      historicalMinimum(['england', ...result.civilizationTypeIds]),
    );
  });

  it('reports anchorless humans as fallback starts in the reviewed roster', () => {
    const result = selectAIRoster({
      ...input,
      humanCivilizationTypeIds: ['custom-sunfolk'],
      count: 1,
    });

    expect(result.fallbackCivilizationTypeIds).toContain('custom-sunfolk');
  });
});
