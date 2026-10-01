import { describe, expect, it } from 'vitest';
import { findViewerBoundaryViolations } from '../helpers/viewer-safety-boundaries';

describe('#1135 — player surfaces reach the battle forecast only through its viewer projection', () => {
  const rawImport = "import { forecastCombat } from '@/systems/battle-forecast';\n";

  it('rejects a UI, input or controller module importing the omniscient forecast', () => {
    for (const file of ['src/ui/some-panel.ts', 'src/input/tap.ts', 'src/app/controllers/map-interaction-controller.ts']) {
      expect(findViewerBoundaryViolations(file, rawImport).map(v => v.rule)).toContain('raw-battle-forecast');
    }
  });

  it('allows the projection itself and the systems layer', () => {
    expect(findViewerBoundaryViolations('src/ui/battle-forecast-projection.ts', rawImport)).toEqual([]);
    expect(findViewerBoundaryViolations('src/ai/ai-tactics.ts', rawImport).filter(v => v.rule === 'raw-battle-forecast')).toEqual([]);
  });
});
