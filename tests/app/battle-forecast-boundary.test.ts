import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

describe('#1213 — the air-strike forecast follows the same boundary and is never an executor', () => {
  const rawImport = "import { forecastAirStrike } from '@/systems/air-strike-forecast';\n";

  it('rejects UI, input or controller modules importing the omniscient air-strike forecast', () => {
    for (const file of ['src/ui/some-panel.ts', 'src/input/tap.ts', 'src/app/controllers/map-interaction-controller.ts']) {
      expect(findViewerBoundaryViolations(file, rawImport).map(v => v.rule)).toContain('raw-battle-forecast');
    }
  });

  it('allows only its own viewer projection', () => {
    expect(findViewerBoundaryViolations('src/ui/air-strike-forecast-projection.ts', rawImport)).toEqual([]);
  });

  it('neither the forecast nor its projection can execute or write a strike', () => {
    for (const file of ['src/systems/air-strike-forecast.ts', 'src/ui/air-strike-forecast-projection.ts']) {
      const source = readFileSync(join(process.cwd(), file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(source, file).not.toMatch(/\bresolveAirStrike\s*\(|\bapplyCombatOutcomeToState\b|\bsession\.|\.commit\(|Math\.random|\bcreateRng\b|\bwithAirStrain\b/);
    }
  });

  it('there is exactly one interception ordering: the forecast and the strike share the same helpers', () => {
    const ops = readFileSync(join(process.cwd(), 'src/systems/air-operations-system.ts'), 'utf8');
    const ui = readFileSync(join(process.cwd(), 'src/ui/air-strike-forecast-projection.ts'), 'utf8');
    expect(ops).toMatch(/selectInterceptor[\s\S]*pickStrongestInterceptor/);
    expect(ui).toContain('pickStrongestInterceptor');
    expect(ui).toContain('canInterceptIncomingStrike');
    expect(ui).not.toMatch(/interceptionStrengthMultiplier/);
  });
});
